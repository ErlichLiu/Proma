import { describe, expect, test } from 'bun:test'
import type { ChatMessage, FileAttachment } from '@proma/shared'
import type { ImageAttachmentData, StreamRequestInput, ToolDefinition } from './types.ts'
import { OpenAIAdapter } from './openai-adapter.ts'

function makeHistory(): ChatMessage[] {
  const now = Date.now()
  return [
    { id: 'u1', role: 'user', content: '你好', createdAt: now - 2_000 },
    { id: 'a1', role: 'assistant', content: '你好，有什么可以帮你？', createdAt: now - 1_000 },
  ]
}

function makeImageAttachment(): FileAttachment {
  return {
    id: 'att_1',
    filename: 'a.png',
    mediaType: 'image/png',
    localPath: 'c/att.png',
    size: 123,
  }
}

const readImageAttachments = (attachments?: FileAttachment[]): ImageAttachmentData[] => {
  if (!attachments || attachments.length === 0) return []
  return attachments.map((att) => ({
    mediaType: att.mediaType,
    data: 'AAAA',
  }))
}

describe('OpenAIAdapter (Responses API)', () => {
  test('Given apiFormat=responses When buildStreamRequest Then uses /responses', () => {
    const adapter = new OpenAIAdapter()
    const input: StreamRequestInput = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      modelId: 'gpt-5',
      apiFormat: 'responses',
      history: makeHistory(),
      userMessage: '请总结一下',
      readImageAttachments,
    }

    const req = adapter.buildStreamRequest(input)
    expect(req.url.endsWith('/responses')).toBe(true)
  })

  test('Given systemMessage When buildStreamRequest Then sets instructions', () => {
    const adapter = new OpenAIAdapter()
    const input: StreamRequestInput = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      modelId: 'gpt-5',
      apiFormat: 'responses',
      history: makeHistory(),
      userMessage: '请总结一下',
      systemMessage: '你是一个严谨的助手',
      readImageAttachments,
    }

    const req = adapter.buildStreamRequest(input)
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.instructions).toBe('你是一个严谨的助手')
  })

  test('Given tools When buildStreamRequest Then tools are flat (no function nesting)', () => {
    const adapter = new OpenAIAdapter()
    const tools: ToolDefinition[] = [
      {
        name: 'get_weather',
        description: 'Get weather by city',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' },
          },
          required: ['city'],
        },
      },
    ]

    const input: StreamRequestInput = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      modelId: 'gpt-5',
      apiFormat: 'responses',
      history: makeHistory(),
      userMessage: '上海天气？',
      tools,
      readImageAttachments,
    }

    const req = adapter.buildStreamRequest(input)
    const body = JSON.parse(req.body) as Record<string, unknown>
    const bodyTools = body.tools as Array<Record<string, unknown>>
    expect(bodyTools[0]?.type).toBe('function')
    expect(bodyTools[0]?.name).toBe('get_weather')
    expect(bodyTools[0]?.description).toBe('Get weather by city')
    expect(bodyTools[0]?.parameters).toBeTruthy()
    expect((bodyTools[0] as Record<string, unknown>).function).toBeUndefined()
  })

  test('Given current message has image When buildStreamRequest Then includes input_image with data URL', () => {
    const adapter = new OpenAIAdapter()
    const attachments = [makeImageAttachment()]
    const input: StreamRequestInput = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      modelId: 'gpt-5',
      apiFormat: 'responses',
      history: makeHistory(),
      userMessage: '这张图里是什么？',
      attachments,
      readImageAttachments,
    }

    const req = adapter.buildStreamRequest(input)
    const body = JSON.parse(req.body) as Record<string, unknown>
    const inputArr = body.input as Array<Record<string, unknown>>
    const first = inputArr[0] as Record<string, unknown>
    const content = first.content as Array<Record<string, unknown>>

    const imageItem = content.find((c) => c.type === 'input_image')
    expect(imageItem).toBeTruthy()
    expect(typeof imageItem?.image_url).toBe('string')
    expect((imageItem?.image_url as string).startsWith('data:image/png;base64,')).toBe(true)
  })

  test('Given response.output_text.delta When parseSSELine Then returns chunk', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({ type: 'response.output_text.delta', delta: 'hi' }))
    expect(events).toEqual([{ type: 'chunk', delta: 'hi' }])
  })

  test('Given response.output_item.added function_call When parseSSELine Then returns tool_call_start', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({
      type: 'response.output_item.added',
      item: { type: 'function_call', call_id: 'call_1', name: 'my_tool' },
    }))
    expect(events).toEqual([{ type: 'tool_call_start', toolCallId: 'call_1', toolName: 'my_tool' }])
  })

  test('Given response.output_item.added with response_id When parseSSELine Then returns meta + tool_call_start', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({
      type: 'response.output_item.added',
      response_id: 'resp_1',
      item: { type: 'function_call', call_id: 'call_1', name: 'my_tool' },
    }))
    expect(events).toEqual([
      { type: 'meta', responseId: 'resp_1' },
      { type: 'tool_call_start', toolCallId: 'call_1', toolName: 'my_tool' },
    ])
  })

  test('Given response.function_call_arguments.delta When parseSSELine Then returns tool_call_delta', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({
      type: 'response.function_call_arguments.delta',
      call_id: 'call_1',
      delta: '{"q":"x"}',
    }))
    expect(events).toEqual([{ type: 'tool_call_delta', toolCallId: 'call_1', argumentsDelta: '{"q":"x"}' }])
  })

  test('Given response.function_call_arguments.delta with response_id When parseSSELine Then returns meta + tool_call_delta', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({
      type: 'response.function_call_arguments.delta',
      response_id: 'resp_1',
      call_id: 'call_1',
      delta: '{"q":"x"}',
    }))
    expect(events).toEqual([
      { type: 'meta', responseId: 'resp_1' },
      { type: 'tool_call_delta', toolCallId: 'call_1', argumentsDelta: '{"q":"x"}' },
    ])
  })

  test('Given response.created When parseSSELine Then returns meta(responseId)', () => {
    const adapter = new OpenAIAdapter()
    const events = adapter.parseSSELine(JSON.stringify({
      type: 'response.created',
      response: { id: 'resp_1' },
    }))
    expect(events).toEqual([{ type: 'meta', responseId: 'resp_1' }])
  })
})
