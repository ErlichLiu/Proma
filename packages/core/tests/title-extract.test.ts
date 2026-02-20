import { describe, expect, it } from 'bun:test'
import {
  extractTextFromContentLike,
  extractTitleFromCommonResponse,
} from '../src/providers/title-extract.ts'

describe('title extraction fallback', () => {
  it('extracts from OpenAI chat completion shape', () => {
    const body = {
      choices: [{ message: { content: 'OpenAI title' } }],
    }
    expect(extractTitleFromCommonResponse(body)).toBe('OpenAI title')
  })

  it('extracts from OpenAI responses output_text', () => {
    const body = {
      output_text: 'Responses title',
    }
    expect(extractTitleFromCommonResponse(body)).toBe('Responses title')
  })

  it('extracts from Anthropic text block', () => {
    const body = {
      content: [{ type: 'text', text: 'Anthropic title' }],
    }
    expect(extractTitleFromCommonResponse(body)).toBe('Anthropic title')
  })

  it('extracts from Anthropic thinking block by taking last line', () => {
    const body = {
      content: [{ type: 'thinking', thinking: 'step1\n- Thinking title' }],
    }
    expect(extractTitleFromCommonResponse(body)).toBe('Thinking title')
  })

  it('extracts from Google candidates parts', () => {
    const body = {
      candidates: [{ content: { parts: [{ text: 'Gemini title' }] } }],
    }
    expect(extractTitleFromCommonResponse(body)).toBe('Gemini title')
  })

  it('extracts wrapped payload under data', () => {
    const body = {
      data: {
        choices: [{ message: { content: 'Wrapped title' } }],
      },
    }
    expect(extractTitleFromCommonResponse(body)).toBe('Wrapped title')
  })

  it('returns null for malformed response', () => {
    expect(extractTitleFromCommonResponse({ foo: { bar: 1 } })).toBeNull()
    expect(extractTitleFromCommonResponse(null)).toBeNull()
  })

  it('extracts from content-like mixed arrays', () => {
    const content = [
      { type: 'image' },
      { type: 'text', text: 'Text block title' },
    ]
    expect(extractTextFromContentLike(content)).toBe('Text block title')
  })
})
