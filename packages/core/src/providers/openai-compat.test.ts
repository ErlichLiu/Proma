import { describe, expect, test } from 'bun:test'
import { probeOpenAICompatibleModelsBaseUrl } from './openai-compat.ts'

function makeFetch(map: Record<string, number | 'throw'>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const hit = map[url]
    if (hit === 'throw') {
      throw new Error('network error')
    }
    const status = typeof hit === 'number' ? hit : 404
    const body = status === 200 ? '{"data":[]}' : `status ${status}`
    return new Response(body, { status })
  }) as unknown as typeof fetch
}

describe('probeOpenAICompatibleModelsBaseUrl', () => {
  test('Given /models ok and /v1/models 404 When probe Then chooses non-v1 baseUrl', async () => {
    const baseUrl = 'https://api.example.com'
    const fetchFn = makeFetch({
      'https://api.example.com/models': 200,
      'https://api.example.com/v1/models': 404,
    })

    const result = await probeOpenAICompatibleModelsBaseUrl({ baseUrl, apiKey: 'k', fetchFn })
    expect(result.resolvedBaseUrl).toBe('https://api.example.com')
    expect(result.best.ok).toBe(true)
  })

  test('Given /models 404 and /v1/models ok When probe Then chooses /v1 baseUrl', async () => {
    const baseUrl = 'https://api.example.com'
    const fetchFn = makeFetch({
      'https://api.example.com/models': 404,
      'https://api.example.com/v1/models': 200,
    })

    const result = await probeOpenAICompatibleModelsBaseUrl({ baseUrl, apiKey: 'k', fetchFn })
    expect(result.resolvedBaseUrl).toBe('https://api.example.com/v1')
    expect(result.best.ok).toBe(true)
  })

  test('Given both endpoints 401 When probe Then prefers /v1 baseUrl', async () => {
    const baseUrl = 'https://api.example.com'
    const fetchFn = makeFetch({
      'https://api.example.com/models': 401,
      'https://api.example.com/v1/models': 401,
    })

    const result = await probeOpenAICompatibleModelsBaseUrl({ baseUrl, apiKey: 'bad', fetchFn })
    expect(result.resolvedBaseUrl).toBe('https://api.example.com/v1')
    expect(result.best.status).toBe(401)
  })

  test('Given both endpoints 403 When probe Then prefers /v1 baseUrl', async () => {
    const baseUrl = 'https://api.example.com'
    const fetchFn = makeFetch({
      'https://api.example.com/models': 403,
      'https://api.example.com/v1/models': 403,
    })

    const result = await probeOpenAICompatibleModelsBaseUrl({ baseUrl, apiKey: 'bad', fetchFn })
    expect(result.resolvedBaseUrl).toBe('https://api.example.com/v1')
    expect(result.best.status).toBe(403)
  })

  test('Given /models throws and /v1/models 404 When probe Then chooses /v1 baseUrl (less bad)', async () => {
    const baseUrl = 'https://api.example.com'
    const fetchFn = makeFetch({
      'https://api.example.com/models': 'throw',
      'https://api.example.com/v1/models': 404,
    })

    const result = await probeOpenAICompatibleModelsBaseUrl({ baseUrl, apiKey: 'k', fetchFn })
    expect(result.resolvedBaseUrl).toBe('https://api.example.com/v1')
    expect(result.probes).toHaveLength(2)
  })
})
