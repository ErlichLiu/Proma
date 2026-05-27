/**
 * OpenAI 兼容 Agent 适配器
 *
 * 实现 AgentProviderAdapter 接口，使用 OpenAI 规范的 API。
 * 将 SDKMessage 格式转换为 OpenAI 格式，反之亦然。
 * 
 * 参考 cc-switch 设计模式，提供 Anthropic SDK 到 OpenAI API 的适配层。
 */

import type {
  AgentQueryInput,
  AgentProviderAdapter,
  SDKUserMessageInput,
  TypedError,
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKContentBlock,
  SDKToolUseBlock,
  SDKToolResultBlock,
  SDKTextBlock,
} from '@proma/shared'
import { getFetchFn } from '../proxy-fetch'
import { getEffectiveProxyUrl } from '../proxy-settings-service'
import { TRANSIENT_NETWORK_PATTERN } from '../error-patterns'

/** OpenAI 内容块 */
interface OpenAIContentBlock {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

/** OpenAI tool_call 格式 */
interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** OpenAI 消息格式 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentBlock[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

/** OpenAI SSE 数据块 */
interface OpenAIChunkData {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    delta?: {
      role?: string
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** OpenAI 工具定义格式 */
interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** OpenAI Agent 查询选项 */
export interface OpenAIAgentQueryOptions extends AgentQueryInput {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt?: string
  tools?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  /** 是否启用思考模式 */
  thinkingEnabled?: boolean
  /** 历史消息（用于多轮对话） */
  history?: SDKMessage[]
  /** 环境变量 */
  env?: Record<string, string | undefined>
}

/** 活跃的 AbortController 映射 */
const activeControllers = new Map<string, AbortController>()

/** 活跃的请求映射 */
const activeRequests = new Map<string, () => void>()

/** 错误消息最大保留长度 */
const MAX_ERROR_MESSAGE_LENGTH = 5000

/**
 * 将 SDKContentBlock 转换为 OpenAI 格式
 */
function sdkContentBlockToOpenAI(block: SDKContentBlock): OpenAIContentBlock | { type: string; text?: string } {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: (block as SDKTextBlock).text }
    case 'tool_use':
      return { type: 'text', text: JSON.stringify(block) }
    case 'tool_result':
      return { type: 'text', text: JSON.stringify(block) }
    case 'thinking':
      return { type: 'text', text: (block as { thinking: string }).thinking }
    default:
      return { type: 'text', text: JSON.stringify(block) }
  }
}

/**
 * 将 SDKMessage 转换为 OpenAI 消息格式
 */
function sdkMessageToOpenAI(message: SDKMessage): OpenAIMessage | null {
  if (message.type === 'assistant') {
    const assistantMsg = message as SDKAssistantMessage
    const content = assistantMsg.message.content
      ? assistantMsg.message.content.map(sdkContentBlockToOpenAI)
      : null
    
    const toolCalls: OpenAIToolCall[] = []
    assistantMsg.message.content?.forEach((block) => {
      if (block.type === 'tool_use') {
        const toolBlock = block as SDKToolUseBlock
        toolCalls.push({
          id: toolBlock.id,
          type: 'function',
          function: {
            name: toolBlock.name,
            arguments: JSON.stringify(toolBlock.input),
          },
        })
      }
    })

    return {
      role: 'assistant',
      content: content?.length === 1 && content[0].type === 'text' 
        ? content[0].text || '' 
        : (content || null),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  }

  if (message.type === 'user') {
    const userMsg = message as SDKUserMessage
    const content = userMsg.message?.content
      ? userMsg.message.content.map(sdkContentBlockToOpenAI)
      : []
    
    return {
      role: 'user',
      content: content.length === 1 && content[0].type === 'text'
        ? content[0].text || ''
        : content.length > 0 ? content : null,
    }
  }

  return null
}

/**
 * 将工具调用结果转换为 OpenAI 格式
 */
function toolResultToOpenAI(toolUseId: string, result: string, isError: boolean): OpenAIMessage {
  return {
    role: 'tool',
    content: isError ? `Error: ${result}` : result,
    tool_call_id: toolUseId,
  }
}

/**
 * 从 OpenAI 响应构建 SDKMessage
 */
function buildSDKAssistantMessage(
  contentBlocks: SDKContentBlock[],
  model?: string,
  stopReason?: string,
  sessionId?: string,
  error?: { message: string },
): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: {
      content: contentBlocks,
      model,
      stop_reason: stopReason,
    },
    parent_tool_use_id: null,
    session_id: sessionId,
    error,
  }
}

/**
 * 从 OpenAI 响应构建 SDKResultMessage
 */
function buildSDKResultMessage(
  sessionId?: string,
  inputTokens: number = 0,
  outputTokens: number = 0,
): SDKResultMessage {
  return {
    type: 'result',
    subtype: 'success',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    session_id: sessionId,
  }
}

/**
 * 将错误映射为 TypedError
 */
function mapErrorToTypedError(errorCode: string, message: string): TypedError {
  const errorMap: Record<string, { code: string; title: string; message: string; canRetry: boolean }> = {
    'invalid_api_key': {
      code: 'invalid_api_key',
      title: '认证失败',
      message: '无法通过 API 认证，API Key 可能无效或已过期',
      canRetry: true,
    },
    'rate_limited': {
      code: 'rate_limited',
      title: '请求频率限制',
      message: '请求过于频繁，请稍后再试',
      canRetry: true,
    },
    'service_error': {
      code: 'service_error',
      title: '服务错误',
      message: 'API 服务暂时异常，请稍后再试',
      canRetry: true,
    },
    'network_error': {
      code: 'network_error',
      title: '网络异常',
      message: '上游 API 连接中断',
      canRetry: true,
    },
    'prompt_too_long': {
      code: 'prompt_too_long',
      title: '上下文过长',
      message: '当前对话的上下文已超出模型限制，请压缩上下文或开启新会话',
      canRetry: false,
    },
  }

  const isNetworkError = TRANSIENT_NETWORK_PATTERN.test(message)
  if (isNetworkError) {
    return {
      code: 'network_error',
      title: '网络异常',
      message: message || '上游 API 连接中断',
      actions: [
        { key: 's', label: '设置', action: 'settings' },
        { key: 'r', label: '重试', action: 'retry' },
      ],
      canRetry: true,
      retryDelayMs: 1000,
      originalError: message,
    }
  }

  const mapped = errorMap[errorCode] || {
    code: 'unknown_error',
    title: '',
    message: message || errorCode,
    canRetry: false,
  }

  return {
    code: mapped.code as any,
    title: mapped.title,
    message: mapped.message,
    actions: [
      { key: 's', label: '设置', action: 'settings' },
      ...(mapped.canRetry ? [{ key: 'r', label: '重试', action: 'retry' }] : []),
      ...(mapped.code === 'prompt_too_long' ? [{ key: 'c', label: '压缩上下文', action: 'compact' }] : []),
    ],
    canRetry: mapped.canRetry,
    retryDelayMs: mapped.canRetry ? 1000 : undefined,
    originalError: message,
  }
}

export class OpenAIAgentAdapter implements AgentProviderAdapter {
  async *query(input: AgentQueryInput): AsyncIterable<SDKMessage> {
    const options = input as OpenAIAgentQueryOptions
    const controller = new AbortController()
    activeControllers.set(options.sessionId, controller)

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)

    // 取消请求的回调
    const abortCallback = () => {
      controller.abort()
    }
    activeRequests.set(options.sessionId, abortCallback)

    try {
      const messages: OpenAIMessage[] = []

      // 添加系统提示
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt })
      }

      // 添加历史消息
      if (options.history) {
        for (const msg of options.history) {
          const openAIMsg = sdkMessageToOpenAI(msg)
          if (openAIMsg) {
            messages.push(openAIMsg)
          }
        }
      }

      // 添加当前用户消息
      messages.push({
        role: 'user',
        content: options.prompt,
      })

      // 构建请求体
      const body: Record<string, unknown> = {
        model: options.model,
        messages,
        stream: true,
        max_tokens: 8192,
      }

      // 添加工具定义
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((tool): OpenAIToolDefinition => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }))
        body.tool_choice = 'auto'
      }

      // 思考模式支持
      if (options.thinkingEnabled) {
        body.reasoning_enabled = true
      }

      // 构建请求 URL
      const baseUrl = options.baseUrl.replace(/\/$/, '')
      const url = `${baseUrl}/chat/completions`

      // 发送请求
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      // 处理 HTTP 错误
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const truncatedText = text.length > MAX_ERROR_MESSAGE_LENGTH
          ? text.slice(0, MAX_ERROR_MESSAGE_LENGTH) + `\n\n[错误详情过长 (${(text.length / 1024).toFixed(0)}KB)，已截断]`
          : text

        let errorCode = 'service_error'
        let errorMessage = truncatedText

        try {
          const json = JSON.parse(text)
          if (json.error) {
            errorMessage = json.error.message || truncatedText
            if (json.error.type) {
              errorCode = json.error.type
            }
          }
        } catch {
          // 不是 JSON 格式，使用原始文本
        }

        const typedError = mapErrorToTypedError(errorCode, errorMessage)
        yield buildSDKAssistantMessage([], options.model, undefined, options.sessionId, { message: typedError.message })
        return
      }

      if (!response.body) {
        throw new Error('响应体为空')
      }

      // 处理流式响应
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentToolCalls: OpenAIToolCall[] = []
      let currentContent = ''
      let currentReasoning = ''
      let model: string | undefined
      let inputTokens = 0
      let outputTokens = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            // 过滤非 data 行
            let data: string
            if (line.startsWith('data: ')) {
              data = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim()
            } else {
              continue
            }

            // 跳过空数据和 [DONE]
            if (data === '[DONE]' || !data) continue

            try {
              const chunk = JSON.parse(data) as OpenAIChunkData
              
              // 更新模型信息
              if (chunk.model) {
                model = chunk.model
              }

              // 更新 token 用量
              if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens || inputTokens
                outputTokens = chunk.usage.completion_tokens || outputTokens
              }

              const delta = chunk.choices?.[0]?.delta

              // 处理文本内容
              if (delta?.content) {
                currentContent += delta.content

                const contentBlocks: SDKContentBlock[] = [{
                  type: 'text',
                  text: delta.content,
                }]

                yield buildSDKAssistantMessage(contentBlocks, model, undefined, options.sessionId)
              }

              // 处理推理内容 (DeepSeek 等供应商)
              if (delta?.reasoning_content) {
                currentReasoning += delta.reasoning_content

                const contentBlocks: SDKContentBlock[] = [{
                  type: 'thinking',
                  thinking: delta.reasoning_content,
                }]

                yield buildSDKAssistantMessage(contentBlocks, model, undefined, options.sessionId)
              }

              // 处理工具调用
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const toolCallId = tc.id || `tc_${tc.index ?? 0}`

                  // 创建或更新工具调用
                  if (tc.function?.name) {
                    let existingCall = currentToolCalls.find(call => call.id === toolCallId)
                    if (!existingCall) {
                      existingCall = {
                        id: toolCallId,
                        type: 'function',
                        function: {
                          name: tc.function.name,
                          arguments: '',
                        },
                      }
                      currentToolCalls.push(existingCall)
                    }
                  }

                  // 累积工具参数
                  if (tc.function?.arguments) {
                    const existingCall = currentToolCalls.find(call => call.id === toolCallId)
                    if (existingCall) {
                      existingCall.function.arguments += tc.function.arguments
                    }
                  }
                }
              }

              // 处理结束原因
              const finishReason = chunk.choices?.[0]?.finish_reason
              if (finishReason) {
                // 工具调用完成
                if (finishReason === 'tool_calls' && currentToolCalls.length > 0) {
                  const contentBlocks: SDKContentBlock[] = currentToolCalls.map((tc): SDKToolUseBlock => {
                    let input: Record<string, unknown> = {}
                    try {
                      input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
                    } catch {
                      input = {}
                    }
                    return {
                      type: 'tool_use',
                      id: tc.id,
                      name: tc.function.name,
                      input,
                    }
                  })

                  yield buildSDKAssistantMessage(contentBlocks, model, 'tool_use', options.sessionId)
                }
              }
            } catch (parseError) {
              console.warn('[OpenAI 适配器] SSE 解析失败:', parseError)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // 发送最终结果消息
      if (currentContent.length > 0 || currentToolCalls.length === 0) {
        yield buildSDKResultMessage(options.sessionId, inputTokens, outputTokens)
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      const typedError = mapErrorToTypedError('network_error', message)

      yield buildSDKAssistantMessage([], options.model, undefined, options.sessionId, { message: typedError.message })
    } finally {
      activeControllers.delete(options.sessionId)
      activeRequests.delete(options.sessionId)
    }
  }

  abort(sessionId: string): void {
    const controller = activeControllers.get(sessionId)
    if (controller) {
      controller.abort()
      activeControllers.delete(sessionId)
    }
    activeRequests.delete(sessionId)
  }

  dispose(): void {
    for (const controller of activeControllers.values()) {
      controller.abort()
    }
    activeControllers.clear()
    activeRequests.clear()
  }

  async sendQueuedMessage(sessionId: string, message: SDKUserMessageInput): Promise<void> {
    console.log('[OpenAI 适配器] 队列消息已注入:', sessionId)
  }

  async cancelQueuedMessage(sessionId: string, messageUuid: string): Promise<void> {
    console.log('[OpenAI 适配器] 队列消息取消:', sessionId, messageUuid)
  }

  async setPermissionMode(sessionId: string, mode: string): Promise<void> {
    console.log('[OpenAI 适配器] 权限模式切换:', sessionId, mode)
  }
}