import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_AGENT_SESSION_TITLE,
  deriveAgentFallbackTitle,
  isDefaultAgentTitle,
  MAX_AGENT_TITLE_LENGTH,
} from './agent-title-utils'

describe('agent-title-utils', () => {
  it('derives deterministic fallback title from first user message', () => {
    expect(deriveAgentFallbackTitle('  hello   agent  ')).toBe('hello agent')
    expect(deriveAgentFallbackTitle('《Agent 会话测试》')).toBe('Agent 会话测试')
  })

  it('returns non-default fallback when user message is empty', () => {
    expect(deriveAgentFallbackTitle('   ')).not.toBe(DEFAULT_AGENT_SESSION_TITLE)
  })

  it('keeps fallback title under max length', () => {
    const title = deriveAgentFallbackTitle('x'.repeat(MAX_AGENT_TITLE_LENGTH + 20))
    expect(title.length).toBeLessThanOrEqual(MAX_AGENT_TITLE_LENGTH)
  })

  it('detects default agent title safely', () => {
    expect(isDefaultAgentTitle(DEFAULT_AGENT_SESSION_TITLE)).toBeTrue()
    expect(isDefaultAgentTitle('  新 Agent 会话  ')).toBeTrue()
    expect(isDefaultAgentTitle('自定义会话')).toBeFalse()
    expect(isDefaultAgentTitle(undefined)).toBeTrue()
  })
})

