import { describe, expect, it } from 'bun:test'
import { AnthropicAdapter } from '../src/providers/anthropic-adapter.ts'

describe('AnthropicAdapter.buildTitleRequest', () => {
  it('does not send thinking field for title requests', () => {
    const adapter = new AnthropicAdapter()
    const request = adapter.buildTitleRequest({
      baseUrl: 'https://example.com/anthropic',
      apiKey: 'sk-test',
      modelId: 'qianfan-code-latest',
      prompt: 'title prompt',
    })

    const body = JSON.parse(request.body) as Record<string, unknown>
    expect(body.model).toBe('qianfan-code-latest')
    expect(body.max_tokens).toBe(50)
    expect(body.messages).toEqual([{ role: 'user', content: 'title prompt' }])
    expect('thinking' in body).toBeFalse()
  })
})

