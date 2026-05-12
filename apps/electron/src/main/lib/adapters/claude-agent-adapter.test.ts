import { describe, expect, test } from 'bun:test'
import { friendlyErrorMessage } from './claude-agent-adapter'

describe('friendlyErrorMessage', () => {
  describe('given a known error pattern', () => {
    test('when message contains "not logged in" then returns friendly login hint', () => {
      const raw = 'Error: not logged in, please run /login first'
      expect(friendlyErrorMessage(raw)).toBe('请检查是否选择了正确的 Proma 供应渠道和模型')
    })

    test('when message contains "validation error" then returns friendly validation hint', () => {
      const raw = 'API Error: 400 2671 validation errors:\n  {\'type\': \'string_type\'...}'
      expect(friendlyErrorMessage(raw)).toBe('API 请求格式校验失败，请重试或开启新会话')
    })

    test('when a massive validation error contains embedded conversation history then still returns friendly hint', () => {
      const payload = 'x'.repeat(11_000_000)
      const raw = `API Error: 400 2671 validation errors:\n  input: ${payload}`
      expect(friendlyErrorMessage(raw)).toBe('API 请求格式校验失败，请重试或开启新会话')
    })
  })

  describe('given an unknown error pattern', () => {
    test('when message is short then returns original text', () => {
      const raw = 'Something unexpected happened'
      expect(friendlyErrorMessage(raw)).toBe(raw)
    })

    test('when message exceeds 5000 chars then truncates with notice', () => {
      const raw = 'Unknown error: ' + 'a'.repeat(10000)
      const result = friendlyErrorMessage(raw)

      expect(result.length).toBeLessThan(raw.length)
      expect(result).toContain('[错误详情过长')
      expect(result).toContain('已截断]')
      expect(result).toStartWith('Unknown error: ')
    })

    test('when message is exactly at limit then returns original without truncation', () => {
      const raw = 'e'.repeat(5000)
      const result = friendlyErrorMessage(raw)
      expect(result).toBe(raw)
      expect(result).not.toContain('已截断')
    })
  })

  describe('given regex safety on large inputs', () => {
    test('when error is 10MB then regex only runs on first 5000 chars, not full string', () => {
      const raw = 'Some prefix ' + 'x'.repeat(10_000_000)
      const start = performance.now()
      friendlyErrorMessage(raw)
      const elapsed = performance.now() - start
      // Should be fast — regex on 5KB, not 10MB
      expect(elapsed).toBeLessThan(100)
    })
  })
})
