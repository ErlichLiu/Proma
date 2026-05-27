import { describe, expect, test } from 'bun:test'
import { buildLiveGroupSet } from './live-group-set'
import type { MessageGroup } from './SDKMessageRenderer'
import type { SDKAssistantMessage, SDKMessage, SDKSystemMessage, SDKUserMessage } from '@proma/shared'

const userMessage: SDKUserMessage = {
  type: 'user',
  parent_tool_use_id: null,
  message: { content: [{ type: 'text', text: '开始' }] },
}

const assistantMessage: SDKAssistantMessage = {
  type: 'assistant',
  parent_tool_use_id: null,
  message: { content: [{ type: 'text', text: '执行中' }] },
}

const systemMessage: SDKSystemMessage = {
  type: 'system',
  subtype: 'compact_boundary',
}

describe('Agent live group 标记', () => {
  test('given live messages while streaming when building live groups then marks matching assistant turn as live', () => {
    const assistantGroup: MessageGroup = {
      type: 'assistant-turn',
      assistantMessages: [assistantMessage],
      turnMessages: [assistantMessage],
    }
    const groups: MessageGroup[] = [
      { type: 'user', message: userMessage },
      assistantGroup,
    ]

    const liveGroups = buildLiveGroupSet({
      allGroups: groups,
      liveMessages: [assistantMessage],
      streaming: true,
    })

    expect(liveGroups.has(assistantGroup)).toBe(true)
    expect(liveGroups.size).toBe(1)
  })

  test('given retained live messages after stream completion when building live groups then treats them as bridge data only', () => {
    const assistantGroup: MessageGroup = {
      type: 'assistant-turn',
      assistantMessages: [assistantMessage],
      turnMessages: [assistantMessage],
    }

    const liveGroups = buildLiveGroupSet({
      allGroups: [assistantGroup],
      liveMessages: [assistantMessage],
      streaming: false,
    })

    expect(liveGroups.size).toBe(0)
  })

  test('given live user and system messages while streaming when building live groups then marks only matching groups', () => {
    const userGroup: MessageGroup = { type: 'user', message: userMessage }
    const systemGroup: MessageGroup = { type: 'system', message: systemMessage }
    const assistantGroup: MessageGroup = {
      type: 'assistant-turn',
      assistantMessages: [assistantMessage],
      turnMessages: [assistantMessage],
    }

    const liveGroups = buildLiveGroupSet({
      allGroups: [userGroup, systemGroup, assistantGroup],
      liveMessages: [systemMessage as SDKMessage],
      streaming: true,
    })

    expect(liveGroups.has(systemGroup)).toBe(true)
    expect(liveGroups.has(userGroup)).toBe(false)
    expect(liveGroups.has(assistantGroup)).toBe(false)
  })
})
