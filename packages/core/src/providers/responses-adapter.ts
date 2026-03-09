/**
 * OpenAI Responses API 适配器
 *
 * 实现 OpenAI Responses API (/v1/responses) 的消息转换、请求构建和 SSE 解析。
 * 与 Chat Completions 的主要差异：
 * - 端点：/responses（非 /chat/completions）
 * - 消息字段：input（非 messages）
 * - 系统提示：instructions 字段（非 system role 消息）
 * - 图片格式：{ type: 'input_image', image_url: 'data:...' }（更简洁）
 * - 工具格式：扁平结构 { type, name, description, parameters }（非嵌套 function 对象）
 * - SSE 事件：response.output_text.delta / response.output_item.added / response.function_call_arguments.delta
 * - 续接消息：function_call + function_call_output 输入项（非 assistant/tool role 消息）
 */

import type {
  ProviderAdapter,
  ProviderRequest,
  StreamRequestInput,
  StreamEvent,
  TitleRequestInput,
  ImageAttachmentData,
  ToolDefinition,
  ContinuationMessage,
} from './types.ts'
import { normalizeBaseUrl } from './url-utils.ts'

// ===== Responses API 特有类型 =====

/** 文本内容块 */
interface ResponsesInputText {
  type: 'input_text'
  text: string
}

/** 图片内容块（直接使用 data URI，无需嵌套 url 对象） */
interface ResponsesInputImage {
  type: 'input_image'
  image_url: string
}

/** 内容块联合类型 */
type ResponsesContentBlock = ResponsesInputText | ResponsesInputImage

/** 普通对话消息输入项 */
interface ResponsesMessageItem {
  role: 'user' | 'assistant'
  content: string | ResponsesContentBlock[]
}

/** 函数调用输入项（历史轮次续接用） */
interface ResponsesFunctionCallItem {
  type: 'function_call'
  /** 输出项 ID（可选，与 response.output_item.added 中的 item.id 对应） */
  id?: string
  /** 函数调用 ID，发送 function_call_output 时必须与此匹配 */
  call_id: string
  name: string
  arguments: string
}

/** 函数调用结果输入项 */
interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output'
  /** 对应的函数调用 ID */
  call_id: string
  output: string
}

/** 输入项联合类型 */
type ResponsesInputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem

/** 工具定义（扁平格式，不同于 Chat Completions 的嵌套 function 对象） */
interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string
  parameters: Record<string, unknown>
}

/** SSE 文本增量事件 */
interface ResponsesTextDeltaEvent {
  type: 'response.output_text.delta'
  delta: string
  item_id: string
  output_index: number
  content_index: number
}

/** SSE 推理文本增量事件（o1/o3/o4 系列） */
interface ResponsesReasoningDeltaEvent {
  type: 'response.reasoning_text.delta'
  delta: string
  item_id: string
  output_index: number
}

/** SSE 输出项添加事件（包含函数调用开始） */
interface ResponsesOutputItemAddedEvent {
  type: 'response.output_item.added'
  item: {
    /** 输出项 ID，后续 delta 事件通过 item_id 引用 */
    id?: string
    type: string
    /** 函数调用 ID，发送 function_call_output 时使用 */
    call_id?: string
    name?: string
    arguments?: string
  }
  output_index: number
}

/** SSE 函数调用参数增量事件 */
interface ResponsesFunctionCallArgsDeltaEvent {
  type: 'response.function_call_arguments.delta'
  delta: string
  /** 与 tool_call_start 中使用的 item.id 对应 */
  item_id: string
  output_index: number
}

/** 通用 SSE 事件（用于 type 字段路由） */
interface ResponsesBaseEvent {
  type: string
}

// ===== 消息转换 =====

/**
 * 将图片附件转换为 Responses API 格式的内容块
 */
function buildImageBlocks(imageData: ImageAttachmentData[]): ResponsesContentBlock[] {
  return imageData.map((img) => ({
    type: 'input_image' as const,
    image_url: `data:${img.mediaType};base64,${img.data}`,
  }))
}

/**
 * 构建包含图片和文本的消息内容
 */
function buildMessageContent(
  text: string,
  imageData: ImageAttachmentData[],
): string | ResponsesContentBlock[] {
  if (imageData.length === 0) return text

  const content: ResponsesContentBlock[] = buildImageBlocks(imageData)
  if (text) {
    content.push({ type: 'input_text', text })
  }
  return content
}

/**
 * 将统一消息历史转换为 Responses API input 数组
 *
 * 注意：system 消息不进入 input，由 instructions 字段单独传递。
 */
function toResponsesInput(input: StreamRequestInput): ResponsesInputItem[] {
  const { history, userMessage, attachments, readImageAttachments } = input
  const items: ResponsesInputItem[] = []

  // 历史消息（跳过 system 消息）
  for (const msg of history) {
    if (msg.role === 'system') continue

    const role = msg.role === 'assistant' ? 'assistant' as const : 'user' as const

    // 历史用户消息附件处理
    if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
      const historyImages = readImageAttachments(msg.attachments)
      items.push({ role, content: buildMessageContent(msg.content, historyImages) })
    } else {
      items.push({ role, content: msg.content })
    }
  }

  // 当前用户消息
  const currentImages = readImageAttachments(attachments)
  items.push({
    role: 'user',
    content: buildMessageContent(userMessage, currentImages),
  })

  return items
}

/**
 * 将工具定义转换为 Responses API 扁平格式
 *
 * 与 Chat Completions 不同，Responses API 的工具定义不嵌套 function 对象，
 * name/description/parameters 直接在顶层。
 */
function toResponsesTools(tools: ToolDefinition[]): ResponsesFunctionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
  }))
}

/**
 * 将续接消息追加到 Responses API input 数组
 *
 * Responses API 使用 function_call + function_call_output 输入项续接工具调用，
 * 而非 Chat Completions 的 assistant role / tool role 消息。
 *
 * 关键设计：parseSSELine 在 tool_call_start 事件中将 item.call_id 存入 metadata，
 * 此处通过 metadata.call_id 恢复真实的 call_id（用于 function_call_output 匹配）。
 */
function appendContinuationMessages(
  items: ResponsesInputItem[],
  continuationMessages: ContinuationMessage[],
): void {
  // item_id → call_id 映射，供后续 function_call_output 查找
  const callIdMap = new Map<string, string>()

  for (const contMsg of continuationMessages) {
    if (contMsg.role === 'assistant') {
      for (const tc of contMsg.toolCalls) {
        const callId = tc.metadata?.call_id as string | undefined ?? tc.id
        callIdMap.set(tc.id, callId)
        items.push({
          type: 'function_call',
          id: tc.id,
          call_id: callId,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        })
      }
    } else if (contMsg.role === 'tool') {
      for (const result of contMsg.results) {
        // 优先用 callIdMap 查找真实 call_id，降级直接使用 toolCallId
        const callId = callIdMap.get(result.toolCallId) ?? result.toolCallId
        items.push({
          type: 'function_call_output',
          call_id: callId,
          output: result.content,
        })
      }
    }
  }
}

// ===== 适配器实现 =====

export class ResponsesAdapter implements ProviderAdapter {
  readonly providerType = 'openai-responses' as const

  buildStreamRequest(input: StreamRequestInput): ProviderRequest {
    const url = normalizeBaseUrl(input.baseUrl)
    const inputItems = toResponsesInput(input)

    // 工具续接消息追加到 input 数组（Responses API 无独立的续接轮次概念）
    if (input.continuationMessages && input.continuationMessages.length > 0) {
      appendContinuationMessages(inputItems, input.continuationMessages)
    }

    const body: Record<string, unknown> = {
      model: input.modelId,
      input: inputItems,
      stream: true,
    }

    // 系统提示通过 instructions 字段传递（区别于 Chat Completions 的 system role 消息）
    if (input.systemMessage) {
      body.instructions = input.systemMessage
    }

    // 工具定义（扁平格式）
    if (input.tools && input.tools.length > 0) {
      body.tools = toResponsesTools(input.tools)
    }

    return {
      url: `${url}/responses`,
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  }

  parseSSELine(jsonLine: string): StreamEvent[] {
    try {
      const raw = JSON.parse(jsonLine) as ResponsesBaseEvent
      const events: StreamEvent[] = []

      // 文本增量
      if (raw.type === 'response.output_text.delta') {
        const event = raw as ResponsesTextDeltaEvent
        if (event.delta) {
          events.push({ type: 'chunk', delta: event.delta })
        }
      }

      // 推理文本增量（o1/o3/o4 系列推理模型）
      else if (raw.type === 'response.reasoning_text.delta') {
        const event = raw as ResponsesReasoningDeltaEvent
        if (event.delta) {
          events.push({ type: 'reasoning', delta: event.delta })
        }
      }

      // 新输出项（函数调用开始）
      else if (raw.type === 'response.output_item.added') {
        const event = raw as ResponsesOutputItemAddedEvent
        if (event.item.type === 'function_call') {
          // item.id 作为跟踪键，与后续 delta 的 item_id 对应
          const itemId = event.item.id ?? `tc_${event.output_index}`
          const callId = event.item.call_id ?? itemId
          events.push({
            type: 'tool_call_start',
            toolCallId: itemId,
            toolName: event.item.name ?? '',
            // 保留 call_id 供 appendContinuationMessages 构建 function_call_output 使用
            metadata: { call_id: callId },
          })
        }
      }

      // 函数调用参数增量（item_id 与 tool_call_start 的 toolCallId 对应）
      else if (raw.type === 'response.function_call_arguments.delta') {
        const event = raw as ResponsesFunctionCallArgsDeltaEvent
        if (event.delta) {
          events.push({
            type: 'tool_call_delta',
            toolCallId: event.item_id,
            argumentsDelta: event.delta,
          })
        }
      }

      return events
    } catch {
      return []
    }
  }

  buildTitleRequest(input: TitleRequestInput): ProviderRequest {
    const url = normalizeBaseUrl(input.baseUrl)

    return {
      url: `${url}/responses`,
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelId,
        input: [{ role: 'user', content: input.prompt }],
        stream: false,
        max_output_tokens: 50,
      }),
    }
  }

  parseTitleResponse(responseBody: unknown): string | null {
    // 格式：output[0].content[0].text
    const data = responseBody as { output?: Array<{ content?: Array<{ text?: string }> }> }
    return data.output?.[0]?.content?.[0]?.text ?? null
  }
}
