import { test, expect, describe } from 'bun:test'
import { renderCard } from './card-renderer-v2'
import {
  createInitialState,
  markError,
  markIdleTimeout,
  markInterrupted,
  reduce,
} from './card-run-state'
import type { AgentStreamPayload } from '@proma/shared'

/**
 * Phase 1 渲染器 BDD 测试。
 *
 * 验证 CardKit 2.0 关键协议字段（schema/streaming_mode/summary/body.elements）
 * 与"工具折叠阈值"、"终止按钮存在条件"等业务规则。
 */

interface Card {
  schema: string
  config: { streaming_mode: boolean; summary: { content: string } }
  body: { elements: Array<Record<string, unknown>> }
  header?: { title: { content: string }; template: string }
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

function findElement(card: Card, predicate: (e: Record<string, unknown>) => boolean) {
  return card.body.elements.find(predicate)
}

// ===== schema 协议字段 =====

describe('renderCard: CardKit 2.0 schema 协议', () => {
  test('Given running 态 Then schema=2.0, streaming_mode=true', () => {
    const card = renderCard(createInitialState()) as Card
    expect(card.schema).toBe('2.0')
    expect(card.config.streaming_mode).toBe(true)
    expect(card.config.summary.content).toBe('思考中')
  })

  test('Given done 态 Then streaming_mode=false', () => {
    let s = createInitialState()
    s = { ...s, terminal: 'done', footer: null }
    const card = renderCard(s) as Card
    expect(card.config.streaming_mode).toBe(false)
    expect(card.config.summary.content).toBe('已完成')
  })

  test('Given error 态 Then streaming_mode=false, summary=出错', () => {
    const card = renderCard(markError(createInitialState(), 'X')) as Card
    expect(card.config.streaming_mode).toBe(false)
    expect(card.config.summary.content).toBe('出错')
  })

  test('Given interrupted 态 Then summary=已中断', () => {
    const card = renderCard(markInterrupted(createInitialState())) as Card
    expect(card.config.summary.content).toBe('已中断')
  })

  test('Given idle_timeout 态 Then summary=已超时', () => {
    const card = renderCard(markIdleTimeout(createInitialState(), 3)) as Card
    expect(card.config.summary.content).toBe('已超时')
  })
})

// ===== 终止提示（lark.WSClient 不支持 cardAction，用文本命令兜底）=====

describe('renderCard: 终止提示', () => {
  test('Given running + 提供 stopHint Then 卡底渲染提示文字', () => {
    const card = renderCard(createInitialState(), {
      stopHint: '💬 发送 `/stop` 可终止当前任务',
    }) as Card
    const hint = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('/stop'),
    )
    expect(hint).toBeDefined()
  })

  test('Given running + 不提供 stopHint Then 卡底无提示', () => {
    const card = renderCard(createInitialState()) as Card
    const hint = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('/stop'),
    )
    expect(hint).toBeUndefined()
  })

  test('Given done 态 Then 不显示 stopHint（即使传了）', () => {
    let s = createInitialState()
    s = { ...s, terminal: 'done', footer: null }
    const card = renderCard(s, { stopHint: '💬 发送 `/stop` 可终止当前任务' }) as Card
    const hint = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('/stop'),
    )
    expect(hint).toBeUndefined()
  })
})

// ===== 工具折叠阈值（MIN_TOOLS_TO_COLLAPSE = 3）=====

describe('renderCard: 工具调用折叠', () => {
  test('Given 1 个工具 Then 单独面板（不折叠）', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/a' }))
    const card = renderCard(s) as Card
    const panels = card.body.elements.filter((e) => e.tag === 'collapsible_panel')
    expect(panels).toHaveLength(1)
  })

  test('Given 2 个工具 Then 仍是各自单独面板（< 3 不折叠）', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/a' }))
    s = reduce(s, assistantToolUse('t2', 'Bash', { command: 'ls' }))
    const card = renderCard(s) as Card
    const panels = card.body.elements.filter((e) => e.tag === 'collapsible_panel')
    expect(panels).toHaveLength(2)
  })

  test('Given 3 个工具 + running Then 头 2 折叠为摘要 + 最新 1 个独立展开', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/a' }))
    s = reduce(s, assistantToolUse('t2', 'Bash', { command: 'ls' }))
    s = reduce(s, assistantToolUse('t3', 'Grep', { pattern: 'foo' }))
    const card = renderCard(s) as Card
    const panels = card.body.elements.filter((e) => e.tag === 'collapsible_panel')
    expect(panels).toHaveLength(2) // 1 个摘要折叠 + 1 个 latest
  })

  test('Given 3 个工具 + done Then 全部折叠成 1 个摘要面板', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/a' }))
    s = reduce(s, assistantToolUse('t2', 'Bash', { command: 'ls' }))
    s = reduce(s, assistantToolUse('t3', 'Grep', { pattern: 'foo' }))
    s = { ...s, terminal: 'done', footer: null }
    const card = renderCard(s) as Card
    const panels = card.body.elements.filter((e) => e.tag === 'collapsible_panel')
    expect(panels).toHaveLength(1)
  })

  test('Given showToolCalls=false Then 工具块不渲染', () => {
    let s = createInitialState()
    s = reduce(s, assistantToolUse('t1', 'Read', { file_path: '/a' }))
    const card = renderCard(s, { showToolCalls: false }) as Card
    const panels = card.body.elements.filter((e) => e.tag === 'collapsible_panel')
    expect(panels).toHaveLength(0)
  })
})

// ===== 文本块 =====

describe('renderCard: 文本块渲染', () => {
  test('Given 单条 text 块 Then 出现 markdown element', () => {
    let s = createInitialState()
    s = reduce(s, {
      kind: 'sdk_message',
      message: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }], usage: { input_tokens: 0 } },
        parent_tool_use_id: null,
      } as never,
    })
    const card = renderCard(s) as Card
    const md = findElement(card, (e) => e.tag === 'markdown' && (e.content as string)?.includes('Hello'))
    expect(md).toBeDefined()
  })
})

// ===== 终态文案 =====

describe('renderCard: 终态文案', () => {
  test('Given interrupted Then 显示"已被中断"提示', () => {
    const card = renderCard(markInterrupted(createInitialState())) as Card
    const note = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('已被中断'),
    )
    expect(note).toBeDefined()
  })

  test('Given idle_timeout 5 分钟 Then 显示"5 分钟无响应"', () => {
    const card = renderCard(markIdleTimeout(createInitialState(), 5)) as Card
    const note = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('5 分钟无响应'),
    )
    expect(note).toBeDefined()
  })

  test('Given error + errorMsg Then 显示"Agent 失败：xxx"', () => {
    const card = renderCard(markError(createInitialState(), '炸了')) as Card
    const note = card.body.elements.find((e) =>
      e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('炸了'),
    )
    expect(note).toBeDefined()
  })
})

// ===== Header =====

describe('renderCard: header', () => {
  test('Given header 选项 Then card.header 设置 title + 模板色', () => {
    const card = renderCard(createInitialState(), { header: '@MyBot · workspace-a' }) as Card
    expect(card.header).toBeDefined()
    expect(card.header?.title.content).toBe('@MyBot · workspace-a')
    expect(card.header?.template).toBe('blue') // running 态
  })

  test('Given error 态 + header Then template=red', () => {
    const card = renderCard(markError(createInitialState(), 'x'), { header: 'X' }) as Card
    expect(card.header?.template).toBe('red')
  })
})
