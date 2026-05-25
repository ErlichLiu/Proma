import { test, expect, describe } from 'bun:test'
import {
  createInitialState,
  finalizeIfRunning,
  markError,
  markIdleTimeout,
  markInterrupted,
  reduce,
  type RunState,
} from './card-run-state'
import type { AgentStreamPayload } from '@proma/shared'

/**
 * Phase 1 流式卡片 BDD 测试。
 *
 * 覆盖：
 * - reducer 对 SDK 各类消息（assistant text / thinking / tool_use, user tool_result, result）的累积语义
 * - 终态标记函数（markError / markInterrupted / markIdleTimeout / finalizeIfRunning）
 * - 渲染器在 running / done / error 等终态下输出的 CardKit 2.0 关键字段
 */

// ===== 测试辅助：构造 AgentStreamPayload =====

function assistantText(text: string): AgentStreamPayload {
  return {
    kind: 'sdk_message',
    message: {
      type: 'assistant',
      message: { content: [{ type: 'text', text }], usage: { input_tokens: 0 } },
      parent_tool_use_id: null,
    } as never,
  }
}

function assistantThinking(thinking: string): AgentStreamPayload {
  return {
    kind: 'sdk_message',
    message: {
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking }], usage: { input_tokens: 0 } },
      parent_tool_use_id: null,
    } as never,
  }
}

function assistantToolUse(id: string, name: string, input: unknown): AgentStreamPayload {
  return {
    kind: 'sdk_message',
    message: {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id, name, input } as never],
        usage: { input_tokens: 0 },
      },
      parent_tool_use_id: null,
    } as never,
  }
}

function userToolResult(toolUseId: string, content: string, isError = false): AgentStreamPayload {
  return {
    kind: 'sdk_message',
    message: {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError } as never],
      },
      parent_tool_use_id: null,
    } as never,
  }
}

function resultMessage(subtype: 'success' | 'error', inputTokens = 100, outputTokens = 50): AgentStreamPayload {
  return {
    kind: 'sdk_message',
    message: {
      type: 'result',
      subtype,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      total_cost_usd: 0.001,
    } as never,
  }
}

// ===== reducer：基础场景 =====

describe('reducer: 初始状态', () => {
  test('Given 新建状态 Then footer=thinking, terminal=running, blocks 空', () => {
    const s = createInitialState()
    expect(s.footer).toBe('thinking')
    expect(s.terminal).toBe('running')
    expect(s.blocks).toEqual([])
    expect(s.reasoning.content).toBe('')
    expect(s.meta).toEqual({})
  })
})

describe('reducer: assistant text 消息', () => {
  test('Given 单条 text 块 When reduce Then 新增 streaming text block, footer 变 streaming', () => {
    const s = reduce(createInitialState(), assistantText('Hello'))
    expect(s.blocks).toHaveLength(1)
    expect(s.blocks[0]).toEqual({ kind: 'text', content: 'Hello', streaming: true })
    expect(s.footer).toBe('streaming')
  })

  test('Given 连续多条 text 块 Then 追加到同一个 streaming block', () => {
    let s = createInitialState()
    s = reduce(s, assistantText('Hello'))
    s = reduce(s, assistantText(' world'))
    expect(s.blocks).toHaveLength(1)
    expect((s.blocks[0] as { content: string }).content).toBe('Hello world')
  })

  test('Given assistant message 含 model 字段 Then meta.model 被设置一次', () => {
    const payload: AgentStreamPayload = {
      kind: 'sdk_message',
      message: {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'hi' }],
          model: 'claude-opus-4-7',
          usage: { input_tokens: 0 },
        },
        parent_tool_use_id: null,
      } as never,
    }
    const s = reduce(createInitialState(), payload)
    expect(s.meta.model).toBe('claude-opus-4-7')
  })
})

describe('reducer: thinking 消息', () => {
  test('Given thinking 累积 Then reasoning.content 追加, active=true, footer=thinking', () => {
    let s = createInitialState()
    s = reduce(s, assistantThinking('first '))
    s = reduce(s, assistantThinking('second'))
    expect(s.reasoning.content).toBe('first second')
    expect(s.reasoning.active).toBe(true)
    expect(s.footer).toBe('thinking')
  })

  test('Given thinking 后接 text Then reasoning.active 转 false, 不清空内容', () => {
    let s = createInitialState()
    s = reduce(s, assistantThinking('内心戏'))
    s = reduce(s, assistantText('回答'))
    expect(s.reasoning.content).toBe('内心戏')
    expect(s.reasoning.active).toBe(false)
    expect(s.footer).toBe('streaming')
  })
})

describe('reducer: 工具调用配对', () => {
  test('Given tool_use 然后 tool_result Then tool block 状态从 running 变 done', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('tool_1', 'Bash', { command: 'ls' }))
    expect(s.footer).toBe('tool_running')
    expect(s.blocks).toHaveLength(1)
    expect((s.blocks[0] as { tool: { status: string } }).tool.status).toBe('running')

    s = reduce(s, userToolResult('tool_1', 'file1\nfile2'))
    const tool = (s.blocks[0] as { tool: { status: string; output: string } }).tool
    expect(tool.status).toBe('done')
    expect(tool.output).toBe('file1\nfile2')
  })

  test('Given tool_result is_error Then 状态变 error', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('tool_1', 'Bash', { command: 'bad' }))
    s = reduce(s, userToolResult('tool_1', '权限拒绝', true))
    const tool = (s.blocks[0] as { tool: { status: string } }).tool
    expect(tool.status).toBe('error')
  })

  test('Given streaming text 后启动 tool Then text block 被 close（streaming=false）', () => {
    let s = createInitialState()
    s = reduce(s, assistantText('thinking aloud'))
    expect((s.blocks[0] as { streaming: boolean }).streaming).toBe(true)
    s = reduce(s, assistantToolUse('tool_1', 'Read', { file_path: '/a' }))
    expect((s.blocks[0] as { streaming: boolean }).streaming).toBe(false)
    expect(s.blocks).toHaveLength(2)
  })

  test('Given tool_result content 是数组形式 Then 正确拼接为字符串', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('tool_1', 'X', {}))
    const payload: AgentStreamPayload = {
      kind: 'sdk_message',
      message: {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool_1',
            content: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }],
            is_error: false,
          } as never],
        },
        parent_tool_use_id: null,
      } as never,
    }
    s = reduce(s, payload)
    const tool = (s.blocks[0] as { tool: { output: string } }).tool
    expect(tool.output).toBe('part1\npart2')
  })
})

describe('reducer: result 消息', () => {
  test('Given subtype=success Then terminal=done, footer=null, meta 填充', () => {
    let s = createInitialState()
    s = reduce(s, assistantText('done'))
    s = reduce(s, resultMessage('success', 200, 80))
    expect(s.terminal).toBe('done')
    expect(s.footer).toBeNull()
    expect(s.meta.inputTokens).toBe(200)
    expect(s.meta.outputTokens).toBe(80)
    expect(s.meta.costUsd).toBe(0.001)
    expect(s.meta.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('Given subtype=error Then terminal=error, errorMsg 有值', () => {
    let s = createInitialState()
    s = reduce(s, resultMessage('error'))
    expect(s.terminal).toBe('error')
    expect(s.errorMsg).toBeTruthy()
  })

  test('Given subtype 为 error_max_turns 等错误前缀 Then 仍判定为 error', () => {
    let s = createInitialState()
    const payload: AgentStreamPayload = {
      kind: 'sdk_message',
      message: {
        type: 'result',
        subtype: 'error_max_turns',
        usage: { input_tokens: 0, output_tokens: 0 },
      } as never,
    }
    s = reduce(s, payload)
    expect(s.terminal).toBe('error')
  })

  test('Given result 来临前有 streaming text Then text block 被 close', () => {
    let s = createInitialState()
    s = reduce(s, assistantText('writing'))
    s = reduce(s, resultMessage('success'))
    expect((s.blocks[0] as { streaming: boolean }).streaming).toBe(false)
  })
})

describe('reducer: assistant.error 字段', () => {
  test('Given assistant 帧带 error.message Then 直接转 error 终态', () => {
    const payload: AgentStreamPayload = {
      kind: 'sdk_message',
      message: {
        type: 'assistant',
        message: { content: [], usage: { input_tokens: 0 } },
        error: { message: '上下文超限' },
        parent_tool_use_id: null,
      } as never,
    }
    const s = reduce(createInitialState(), payload)
    expect(s.terminal).toBe('error')
    expect(s.errorMsg).toBe('上下文超限')
  })
})

// ===== 终态标记函数 =====

describe('终态标记', () => {
  test('markError 设置 errorMsg + terminal=error + footer=null', () => {
    const s = markError(createInitialState(), '炸了')
    expect(s.terminal).toBe('error')
    expect(s.errorMsg).toBe('炸了')
    expect(s.footer).toBeNull()
  })

  test('markInterrupted 设置 terminal=interrupted', () => {
    let s = createInitialState()
    s = reduce(s, assistantText('hi'))
    s = markInterrupted(s)
    expect(s.terminal).toBe('interrupted')
    expect((s.blocks[0] as { streaming: boolean }).streaming).toBe(false)
  })

  test('markIdleTimeout 设置 terminal + 分钟数', () => {
    const s = markIdleTimeout(createInitialState(), 5)
    expect(s.terminal).toBe('idle_timeout')
    expect(s.idleTimeoutMinutes).toBe(5)
  })

  test('finalizeIfRunning：running 态 Then 转 done', () => {
    const s = finalizeIfRunning(createInitialState())
    expect(s.terminal).toBe('done')
  })

  test('finalizeIfRunning：非 running 态 Then 返回原 state', () => {
    const s0 = markError(createInitialState(), 'x')
    const s1 = finalizeIfRunning(s0)
    expect(s1).toBe(s0)
  })
})

// ===== 不可变性 =====

describe('reducer 不可变性', () => {
  test('Given 状态 Then reduce 返回新对象（不修改原状态）', () => {
    const s0 = createInitialState()
    const s1 = reduce(s0, assistantText('hi'))
    expect(s1).not.toBe(s0)
    expect(s0.blocks).toEqual([])
    expect(s1.blocks).toHaveLength(1)
  })

  test('Given 无关 payload Then 返回原对象引用（避免无意义渲染）', () => {
    const s0 = createInitialState()
    const noopPayload: AgentStreamPayload = {
      kind: 'sdk_message',
      message: { type: 'system', subtype: 'init' } as never,
    }
    const s1 = reduce(s0, noopPayload)
    expect(s1).toBe(s0)
  })
})

// ===== 端到端：一次完整会话流 =====

describe('端到端：一次完整会话', () => {
  test('thinking → tool_use → tool_result → text → result：状态机正确推进', () => {
    let s: RunState = createInitialState()
    expect(s.footer).toBe('thinking')

    s = reduce(s, assistantThinking('思考一下用什么工具'))
    expect(s.footer).toBe('thinking')
    expect(s.reasoning.active).toBe(true)

    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/x.md' }))
    expect(s.footer).toBe('tool_running')
    expect(s.reasoning.active).toBe(false)

    s = reduce(s, userToolResult('t1', 'file contents'))
    expect((s.blocks[0] as { tool: { status: string } }).tool.status).toBe('done')

    s = reduce(s, assistantText('根据文件内容，'))
    s = reduce(s, assistantText('结论是 X。'))
    expect(s.footer).toBe('streaming')
    expect(s.blocks).toHaveLength(2)
    expect((s.blocks[1] as { content: string }).content).toBe('根据文件内容，结论是 X。')

    s = reduce(s, resultMessage('success', 1000, 200))
    expect(s.terminal).toBe('done')
    expect(s.footer).toBeNull()
    expect(s.meta.inputTokens).toBe(1000)
  })
})
