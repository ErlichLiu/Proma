export interface WSRequest {
  type: string
  id?: string
  data?: Record<string, unknown>
}

export interface WSResponse {
  type: string
  id?: string
  ok: boolean
  data?: unknown
  error?: string
  errorCode?: string
}

type PushHandler = (msg: WSResponse) => void
type OpenHandler = (ws: WebSocket) => void

let msgId = 0
const reqMap = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const pushHandlers = new Set<PushHandler>()
let openHandler: OpenHandler | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let _ws: WebSocket | null = null
let _host = ''
let _port = ''
let _isReconnect = false

export function onOpen(handler: OpenHandler): void {
  openHandler = handler
}

export function connect(host: string, port: string): WebSocket {
  close()
  _host = host; _port = port
  const protocol = port === '443' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${host}:${port}/ws`)
  _ws = ws

  ws.onopen = () => {
    reconnectDelay = 1000
    if (_isReconnect) {
      window.dispatchEvent(new CustomEvent('proma:ws-reconnected'))
    }
    _isReconnect = true
    openHandler?.(ws)
  }

  ws.onmessage = (e) => {
    try {
      const msg: WSResponse = JSON.parse(e.data)
      // 心跳处理
      if (msg.type === '_heartbeat') { ws.send(JSON.stringify({ type: 'pong' })); return }
      // 请求响应
      if (msg.id && reqMap.has(msg.id)) {
        const p = reqMap.get(msg.id)!
        reqMap.delete(msg.id)
        if (msg.ok) p.resolve(msg.data ?? {})
        else {
          p.reject(new Error(msg.error ?? 'Unknown error'))
          if (msg.errorCode === 'TOKEN_EXPIRED' || msg.errorCode === 'AUTH_REQUIRED') {
            localStorage.removeItem('proma_mobile_token')
            window.dispatchEvent(new CustomEvent('proma:auth-expired'))
          }
        }
        return
      }
      // 推送给所有处理器
      for (const h of pushHandlers) { try { h(msg) } catch {} }
    } catch { /* parse error */ }
  }

  ws.onclose = () => {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectDelay = Math.min(reconnectDelay * 1.5, 15000)
      connect(_host, _port)
    }, reconnectDelay)
  }

  ws.onerror = () => { /* onclose will handle */ }

  return ws
}

export function close(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  _isReconnect = false
  if (_ws) { try { _ws.close() } catch {}; _ws = null }
}

export function onPush(handler: PushHandler): () => void {
  pushHandlers.add(handler)
  return () => { pushHandlers.delete(handler) }
}

export function wsReq(type: string, data?: Record<string, unknown>, timeout = 15000): Promise<unknown> {
  const ws = _ws
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Not connected'))
  return new Promise((resolve, reject) => {
    const id = String(++msgId)
    reqMap.set(id, { resolve, reject })
    ws.send(JSON.stringify({ type, id, data: data ?? {} }))
    setTimeout(() => {
      if (reqMap.has(id)) { reqMap.delete(id); reject(new Error('timeout')) }
    }, timeout)
  })
}
