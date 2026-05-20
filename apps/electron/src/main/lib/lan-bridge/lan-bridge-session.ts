/**
 * LAN Bridge 客户端连接管理
 *
 * 管理所有 WS 客户端的连接、认证、心跳、速率限制。
 */

import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { ClientConnection } from './lan-bridge-types'
import { verifyToken } from './lan-bridge-auth'

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 60
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 20_000

export class LanBridgeSessionManager {
  private clients = new Map<string, ClientConnection>()
  private maxConnections: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(maxConnections: number) {
    this.maxConnections = maxConnections
  }

  /** 添加新连接 */
  addClient(ws: WebSocket, ip: string): ClientConnection | null {
    if (this.clients.size >= this.maxConnections) {
      ws.close(1013, 'Max connections reached')
      return null
    }

    const client: ClientConnection = {
      id: randomUUID(),
      ws,
      ip,
      authenticated: false,
      subscriptions: new Set(),
      lastActivity: Date.now(),
      alive: true,
      windowStart: Date.now(),
      messageCount: 0,
    }

    this.clients.set(client.id, client)
    console.log(`[LAN Bridge] 客户端连接: ${ip} (${client.id}), 总连接数: ${this.clients.size}`)
    return client
  }

  /** 移除连接 */
  removeClient(id: string): void {
    const client = this.clients.get(id)
    if (!client) return
    this.clients.delete(id)
    console.log(`[LAN Bridge] 客户端断开: ${client.ip} (${id}), 总连接数: ${this.clients.size}`)
  }

  /** 获取客户端 */
  getClient(id: string): ClientConnection | undefined {
    return this.clients.get(id)
  }

  /** 检查速率限制，返回 true 表示允许 */
  checkRateLimit(client: ClientConnection): boolean {
    const now = Date.now()
    if (now - client.windowStart > RATE_LIMIT_WINDOW_MS) {
      client.windowStart = now
      client.messageCount = 0
    }
    client.messageCount++
    return client.messageCount <= RATE_LIMIT_MAX_MESSAGES
  }

  /** 从请求 data 中提取并验证 token */
  authenticateFromData(client: ClientConnection, data: Record<string, unknown>): boolean {
    const token = data.token as string | undefined
    if (!token) return false
    if (verifyToken(token, client.ip)) {
      client.authenticated = true
      return true
    }
    return false
  }

  /** 获取订阅了指定 sessionId 的所有客户端 */
  getSubscribers(sessionId: string): ClientConnection[] {
    const subscribers: ClientConnection[] = []
    for (const client of this.clients.values()) {
      if (client.authenticated && client.subscriptions.has(sessionId)) {
        subscribers.push(client)
      }
    }
    return subscribers
  }

  /** 获取所有已认证客户端 */
  getAuthenticatedClients(): ClientConnection[] {
    return [...this.clients.values()].filter(c => c.authenticated)
  }

  /** 向所有已认证客户端广播 */
  broadcast(message: object): void {
    const data = JSON.stringify(message)
    for (const client of this.clients.values()) {
      if (client.authenticated && client.ws.readyState === 1) {
        try { client.ws.send(data) } catch { /* ignore send errors */ }
      }
    }
  }

  /** 向指定客户端发送 */
  send(client: ClientConnection, message: object): void {
    if (client.ws.readyState === 1) {
      try { client.ws.send(JSON.stringify(message)) } catch { /* ignore send errors */ }
    }
  }

  /** 启动心跳检测 */
  startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, client] of this.clients) {
        // 检查心跳超时
        if (!client.alive || now - client.lastActivity > HEARTBEAT_TIMEOUT_MS) {
          console.log(`[LAN Bridge] 心跳超时，断开: ${client.ip} (${id})`)
          client.ws.terminate()
          this.clients.delete(id)
          continue
        }
        // 发送心跳 ping
        client.alive = false
        if (client.ws.readyState === 1) {
          try { client.ws.send(JSON.stringify({ type: '_heartbeat' })) } catch { /* ignore */ }
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  /** 停止心跳检测 */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 关闭所有连接 */
  closeAll(): void {
    this.stopHeartbeat()
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down')
    }
    this.clients.clear()
  }

  /** 获取所有客户端信息（用于 IPC 状态查询） */
  getClientInfos(): Array<{ id: string; ip: string; authenticated: boolean; connectedAt: number; subscriptions: string[] }> {
    return [...this.clients.values()].map(c => ({
      id: c.id,
      ip: c.ip,
      authenticated: c.authenticated,
      connectedAt: c.lastActivity,
      subscriptions: [...c.subscriptions],
    }))
  }

  get connectionCount(): number {
    return this.clients.size
  }
}
