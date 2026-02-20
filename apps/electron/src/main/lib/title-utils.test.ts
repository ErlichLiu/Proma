import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_CHAT_TITLE,
  deriveFallbackTitle,
  isDefaultChatTitle,
  MAX_CHAT_TITLE_LENGTH,
  sanitizeTitleCandidate,
} from './title-utils'

describe('title-utils', () => {
  it('sanitizes wrapping punctuation and whitespace', () => {
    expect(sanitizeTitleCandidate('  "  你好 世界  "  ')).toBe('你好 世界')
    expect(sanitizeTitleCandidate('《测试标题》')).toBe('测试标题')
  })

  it('truncates long titles', () => {
    const source = 'abcdefghijklmnopqrstuvwxyz'
    expect(sanitizeTitleCandidate(source, 10)).toBe('abcdefghij')
  })

  it('returns null for empty candidate', () => {
    expect(sanitizeTitleCandidate('   ')).toBeNull()
  })

  it('derives deterministic fallback title', () => {
    expect(deriveFallbackTitle('  hello   world  ')).toBe('hello world')
    expect(deriveFallbackTitle('   ')).not.toBe(DEFAULT_CHAT_TITLE)
  })

  it('keeps fallback under max length', () => {
    const fallback = deriveFallbackTitle('x'.repeat(MAX_CHAT_TITLE_LENGTH + 50))
    expect(fallback.length).toBeLessThanOrEqual(MAX_CHAT_TITLE_LENGTH)
  })

  it('detects default title safely', () => {
    expect(isDefaultChatTitle(DEFAULT_CHAT_TITLE)).toBeTrue()
    expect(isDefaultChatTitle('  新对话  ')).toBeTrue()
    expect(isDefaultChatTitle('自定义标题')).toBeFalse()
    expect(isDefaultChatTitle(undefined)).toBeTrue()
  })
})
