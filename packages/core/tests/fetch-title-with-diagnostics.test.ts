import { describe, expect, it } from 'bun:test'
import { fetchTitleWithDiagnostics } from '../src/providers/sse-reader.ts'
import type { ProviderAdapter, ProviderRequest, StreamEvent, StreamRequestInput, TitleRequestInput } from '../src/providers/types.ts'

function createAdapter(parseTitleResponse: (body: unknown) => string | null): ProviderAdapter {
  return {
    providerType: 'openai',
    buildStreamRequest(_input: StreamRequestInput): ProviderRequest {
      return { url: 'https://example.com/stream', headers: {}, body: '{}' }
    },
    parseSSELine(_jsonLine: string): StreamEvent[] {
      return []
    },
    buildTitleRequest(_input: TitleRequestInput): ProviderRequest {
      return { url: 'https://example.com/title', headers: {}, body: '{}' }
    },
    parseTitleResponse,
  }
}

const request: ProviderRequest = {
  url: 'https://example.com/title',
  headers: { 'content-type': 'application/json' },
  body: '{"a":1}',
}

describe('fetchTitleWithDiagnostics', () => {
  it('returns success when adapter extracts title', async () => {
    const adapter = createAdapter(() => 'Adapter Title')
    const result = await fetchTitleWithDiagnostics(
      request,
      adapter,
      async () => new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }),
    )
    expect(result.reason).toBe('success')
    expect(result.title).toBe('Adapter Title')
    expect(result.status).toBe(200)
  })

  it('returns http_non_200 with status and preview', async () => {
    const adapter = createAdapter(() => null)
    const result = await fetchTitleWithDiagnostics(
      request,
      adapter,
      async () => new Response('bad request', { status: 400 }),
    )
    expect(result.reason).toBe('http_non_200')
    expect(result.title).toBeNull()
    expect(result.status).toBe(400)
    expect(result.dataPreview).toContain('bad request')
  })

  it('returns empty_content when payload has known title shape but empty value', async () => {
    const adapter = createAdapter(() => null)
    const result = await fetchTitleWithDiagnostics(
      request,
      adapter,
      async () => new Response(JSON.stringify({ content: [] }), { status: 200 }),
    )
    expect(result.reason).toBe('empty_content')
    expect(result.title).toBeNull()
    expect(result.status).toBe(200)
  })

  it('returns parse_failed when payload is unknown shape', async () => {
    const adapter = createAdapter(() => null)
    const result = await fetchTitleWithDiagnostics(
      request,
      adapter,
      async () => new Response(JSON.stringify({ foo: { bar: 1 } }), { status: 200 }),
    )
    expect(result.reason).toBe('parse_failed')
    expect(result.title).toBeNull()
    expect(result.status).toBe(200)
  })
})

