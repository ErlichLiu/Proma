import { describe, expect, test } from 'bun:test'
import { streamSSE } from './sse-reader.ts'
import { OpenAIAdapter } from './openai-adapter.ts'

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('streamSSE (Responses API aggregation)', () => {
  test('Given Responses SSE with responseId/content/toolCalls When streamSSE Then aggregates responseId/toolCalls/stopReason', async () => {
    const adapter = new OpenAIAdapter()

    const sseLines = [
      `data: ${JSON.stringify({ type: 'response.created', response: { id: 'resp_123' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello' })}\n`,
      `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: ' world' })}\n\n`,
      `data: ${JSON.stringify({
        type: 'response.output_item.added',
        item: { type: 'function_call', call_id: 'call_1', name: 'my_tool' },
      })}\n`,
      `data: ${JSON.stringify({
        type: 'response.function_call_arguments.delta',
        call_id: 'call_1',
        delta: '{"q":"x"}',
      })}\n\n`,
      `data: [DONE]\n\n`,
    ]

    const response = new Response(makeSSEStream([sseLines.join('')]), { status: 200 })
    const fetchFn: typeof fetch = async (_input, _init) => response

    const events: Array<{ type: string }> = []
    const result = await streamSSE({
      request: { url: 'https://example.com/responses', headers: {}, body: '{}' },
      adapter,
      fetchFn,
      onEvent: (e) => events.push({ type: e.type }),
    })

    expect(result.responseId).toBe('resp_123')
    expect(result.content).toBe('Hello world')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.id).toBe('call_1')
    expect(result.toolCalls[0]?.name).toBe('my_tool')
    expect(result.toolCalls[0]?.arguments).toEqual({ q: 'x' })
    expect(result.stopReason).toBe('tool_use')

    // 保底：done 事件必然触发（无论服务端是否显式给出 stopReason）
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})
