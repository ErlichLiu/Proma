import type { AgentStreamPayload } from '@proma/shared'

/**
 * 飞书流式卡片的运行时状态机。
 *
 * 把 AgentStreamPayload（sdk_message + proma_event）累积成一个结构化的
 * RunState，便于渲染层无时序地把状态转成 CardKit 2.0 JSON。设计参考
 * zara/feishu-claude-code-bridge `src/card/run-state.ts`，但消费的是
 * Proma 的 SDKMessage 形态而非 claude CLI 的 stream-json。
 *
 * 所有 reducer 是纯函数：`reduce(state, payload) → state`。
 */

export type ToolStatus = 'running' | 'done' | 'error'

export interface ToolEntry {
  id: string
  name: string
  input: unknown
  status: ToolStatus
  output?: string
}

export type Block =
  | { kind: 'text'; content: string; streaming: boolean }
  | { kind: 'tool'; tool: ToolEntry }

export type FooterStatus = 'thinking' | 'tool_running' | 'streaming' | null

export type Terminal = 'running' | 'done' | 'interrupted' | 'error' | 'idle_timeout'

export interface RunState {
  blocks: Block[]
  reasoning: { content: string; active: boolean }
  footer: FooterStatus
  terminal: Terminal
  errorMsg?: string
  /** idle_timeout 终态下，无响应的分钟数（卡片渲染时拼"N 分钟无响应"）。 */
  idleTimeoutMinutes?: number
  startedAt: number
  /** result 消息携带的元数据，渲染卡片底部 summary 用。 */
  meta: {
    durationMs?: number
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    model?: string
  }
}

export function createInitialState(): RunState {
  return {
    blocks: [],
    reasoning: { content: '', active: false },
    footer: 'thinking',
    terminal: 'running',
    startedAt: Date.now(),
    meta: {},
  }
}

function closeStreamingText(blocks: Block[]): Block[] {
  return blocks.map((b) =>
    b.kind === 'text' && b.streaming ? { ...b, streaming: false } : b,
  )
}

function appendText(state: RunState, delta: string): RunState {
  const last = state.blocks[state.blocks.length - 1]
  if (last && last.kind === 'text' && last.streaming) {
    const next: Block = { ...last, content: last.content + delta }
    return {
      ...state,
      blocks: [...state.blocks.slice(0, -1), next],
      reasoning: { ...state.reasoning, active: false },
      footer: 'streaming',
    }
  }
  return {
    ...state,
    blocks: [...state.blocks, { kind: 'text', content: delta, streaming: true }],
    reasoning: { ...state.reasoning, active: false },
    footer: 'streaming',
  }
}

function appendThinking(state: RunState, delta: string): RunState {
  return {
    ...state,
    reasoning: { content: state.reasoning.content + delta, active: true },
    footer: 'thinking',
  }
}

function startTool(state: RunState, id: string, name: string, input: unknown): RunState {
  const tool: ToolEntry = { id, name, input, status: 'running' }
  return {
    ...state,
    blocks: [...closeStreamingText(state.blocks), { kind: 'tool', tool }],
    reasoning: { ...state.reasoning, active: false },
    footer: 'tool_running',
  }
}

function completeTool(state: RunState, id: string, output: string, isError: boolean): RunState {
  const blocks = state.blocks.map((b) => {
    if (b.kind !== 'tool' || b.tool.id !== id) return b
    return {
      ...b,
      tool: { ...b.tool, status: isError ? ('error' as const) : ('done' as const), output },
    }
  })
  return { ...state, blocks }
}

interface SDKContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface SDKAssistantMessage {
  type: 'assistant'
  message?: { content?: SDKContentBlock[]; model?: string }
}

interface SDKUserMessage {
  type: 'user'
  message?: { content?: SDKContentBlock[] }
}

interface SDKResultMessage {
  type: 'result'
  subtype?: string
  duration_ms?: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  is_error?: boolean
  result?: string
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'text' in c && typeof (c as { text: string }).text === 'string') {
          return (c as { text: string }).text
        }
        try {
          return JSON.stringify(c)
        } catch {
          return String(c)
        }
      })
      .join('\n')
  }
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

export function reduce(state: RunState, payload: AgentStreamPayload): RunState {
  if (payload.kind === 'sdk_message') {
    const msg = payload.message as SDKAssistantMessage | SDKUserMessage | SDKResultMessage | { type: string }

    if (msg.type === 'assistant') {
      const am = msg as SDKAssistantMessage
      let next = state
      if (am.message?.model && !next.meta.model) {
        next = { ...next, meta: { ...next.meta, model: am.message.model } }
      }
      for (const block of am.message?.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          next = appendText(next, block.text)
        } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
          next = appendThinking(next, block.thinking)
        } else if (block.type === 'tool_use' && block.id && block.name) {
          next = startTool(next, block.id, block.name, block.input)
        }
      }
      return next
    }

    if (msg.type === 'user') {
      const um = msg as SDKUserMessage
      let next = state
      for (const block of um.message?.content ?? []) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const output = stringifyToolResult(block.content)
          next = completeTool(next, block.tool_use_id, output, block.is_error === true)
        }
      }
      return next
    }

    if (msg.type === 'result') {
      const rm = msg as SDKResultMessage
      const meta = {
        ...state.meta,
        durationMs: rm.duration_ms,
        inputTokens: rm.usage?.input_tokens,
        outputTokens: rm.usage?.output_tokens,
        costUsd: rm.total_cost_usd,
      }
      if (rm.is_error) {
        return {
          ...state,
          blocks: closeStreamingText(state.blocks),
          reasoning: { ...state.reasoning, active: false },
          terminal: 'error',
          footer: null,
          errorMsg: rm.result ?? 'Agent 运行出错',
          meta,
        }
      }
      return {
        ...state,
        blocks: closeStreamingText(state.blocks),
        reasoning: { ...state.reasoning, active: false },
        terminal: 'done',
        footer: null,
        meta,
      }
    }

    return state
  }

  if (payload.kind === 'proma_event') {
    const evt = payload.event
    if (evt.type === 'retry') {
      return state
    }
    if (evt.type === 'model_resolved') {
      return { ...state, meta: { ...state.meta, model: evt.model } }
    }
    return state
  }

  return state
}

export function markInterrupted(state: RunState): RunState {
  return {
    ...state,
    blocks: closeStreamingText(state.blocks),
    reasoning: { ...state.reasoning, active: false },
    terminal: 'interrupted',
    footer: null,
  }
}

export function markIdleTimeout(state: RunState, minutes: number): RunState {
  return {
    ...state,
    blocks: closeStreamingText(state.blocks),
    reasoning: { ...state.reasoning, active: false },
    terminal: 'idle_timeout',
    footer: null,
    idleTimeoutMinutes: minutes,
  }
}

export function markError(state: RunState, message: string): RunState {
  return {
    ...state,
    blocks: closeStreamingText(state.blocks),
    reasoning: { ...state.reasoning, active: false },
    terminal: 'error',
    footer: null,
    errorMsg: message,
  }
}

/** 当外部确认 run 已结束但 state 仍是 running 时，兜底收尾。 */
export function finalizeIfRunning(state: RunState): RunState {
  if (state.terminal !== 'running') return state
  return {
    ...state,
    blocks: closeStreamingText(state.blocks),
    reasoning: { ...state.reasoning, active: false },
    terminal: 'done',
    footer: null,
  }
}
