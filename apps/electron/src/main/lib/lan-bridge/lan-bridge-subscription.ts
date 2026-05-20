/**
 * LAN Bridge 实时订阅 — agentEventBus → WS 推送
 *
 * 订阅 agentEventBus 事件，将 Agent 流式输出推送给已订阅的 WS 客户端。
 */

import type { AgentStreamPayload } from '@proma/shared'
import type { AgentEventBus } from '../agent-event-bus'
import { getSessionManager } from './lan-bridge'

let unsubscribe: (() => void) | null = null

/** 启动 EventBus 订阅 */
export function startSubscription(eventBus: AgentEventBus): void {
  stopSubscription()
  unsubscribe = eventBus.on(handleAgentPayload)
}

/** 停止 EventBus 订阅 */
export function stopSubscription(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}

function handleAgentPayload(sessionId: string, payload: AgentStreamPayload): void {
  console.log(`[LAN Bridge 推送] sessionId=${sessionId.slice(0, 12)} kind=${payload.kind}`)
  if (payload.kind === 'sdk_message') {
    const msg = payload.message as Record<string, unknown>
    console.log(`[LAN Bridge 推送] sdk_message type=${msg.type}`)
  } else if (payload.kind === 'proma_event') {
    const event = payload.event as Record<string, unknown>
    console.log(`[LAN Bridge 推送] proma_event type=${event.type}`)
  }
  const manager = getSessionManager()
  if (!manager) { console.log('[LAN Bridge 推送] manager 为空'); return }
  const subscribers = manager.getSubscribers(sessionId)
  console.log(`[LAN Bridge 推送] 订阅者: ${subscribers.length}`)
  if (subscribers.length === 0) return

  if (payload.kind === 'sdk_message') {
    const msg = payload.message as Record<string, unknown>
    const type = msg.type as string

    if (type === 'assistant') {
      // SDKAssistantMessage 结构: { type:'assistant', message: { content: [...] } }
      const message = msg.message as Record<string, unknown> | undefined
      const content = message?.content as Array<Record<string, unknown>> | undefined
      if (content) {
        for (const block of content) {
          if (block.type === 'text') {
            const text = block.text as string
            if (text) {
              broadcastTo(subscribers, {
                type: 'stream.chunk',
                data: { sessionId, text },
              })
            }
          } else if (block.type === 'tool_use') {
            broadcastTo(subscribers, {
              type: 'stream.tool_start',
              data: {
                sessionId,
                toolName: block.name as string,
                toolInput: JSON.stringify(block.input ?? {}),
              },
            })
          } else if (block.type === 'thinking') {
            broadcastTo(subscribers, {
              type: 'stream.thinking',
              data: { sessionId, thinking: block.thinking as string },
            })
          }
        }
      }
    } else if (type === 'result') {
      broadcastTo(subscribers, {
        type: 'stream.complete',
        data: { sessionId },
      })
    }
  } else if (payload.kind === 'proma_event') {
    const event = payload.event as Record<string, unknown>
    const eventType = event.type as string

    if (eventType === 'file_change') {
      broadcastTo(subscribers, {
        type: 'session.updated',
        data: { sessionId },
      })
    }
  }
}

function broadcastTo(clients: Array<{ ws: { send: (data: string) => void; readyState: number } }>, message: object): void {
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data)
    }
  }
}
