import { describe, expect, test } from 'bun:test'
import { normalizeOpenAIBaseUrl } from './url-utils.ts'

describe('normalizeOpenAIBaseUrl', () => {
  test('Given baseUrl without version When normalize Then appends /v1', () => {
    expect(normalizeOpenAIBaseUrl('https://api.openai.com')).toBe('https://api.openai.com/v1')
  })

  test('Given baseUrl already endsWith /v1 When normalize Then keeps /v1', () => {
    expect(normalizeOpenAIBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })

  test('Given baseUrl endsWith endpoint suffix When normalize Then strips suffix and ensures version', () => {
    expect(normalizeOpenAIBaseUrl('https://example.com/v1/chat/completions')).toBe('https://example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://example.com/v1/responses')).toBe('https://example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://example.com/v1/models')).toBe('https://example.com/v1')
  })
})

