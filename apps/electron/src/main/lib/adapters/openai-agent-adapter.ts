/**
 * OpenAI 兼容 Agent 适配器
 *
 * 实现 AgentProviderAdapter 接口，使用 OpenAI 规范的 API。
 * 基于 format-converter 的 Anthropic ↔ OpenAI 双向格式转换，
 * 让 Claude Code 透明地调用 OpenAI（或兼容）后端。
 *
 * 支持两种 OpenAI 目标格式：
 * - Chat Completions API（经典 messages/choices 结构）
 * - Responses API（2025 新一代扁平 input/output 结构）
 */

import type {
  AgentQueryInput,
  AgentProviderAdapter,
  SDKUserMessageInput,
  TypedError,
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKContentBlock,
  SDKToolUseBlock,
} from '@proma/shared'
import {
  anthropicToOpenai,
  anthropicToResponses,
  openaiToAnthropic,
  responsesToAnthropic,
  createChatSseState,
  createAnthropicSseStream,
  createAnthropicSseStreamFromResponses,
  createResponsesSseState,
  getClaudeApiFormat,
  buildAuthHeaders,
  takeSseBlock,
  type ApiFormat,
  type AnthropicRequestBody,
  type AnthropicContentBlock,
  type AnthropicMessage,
  type AnthropicTool,
  type ChatSseState,
  type ResponsesSseState,
} from '@proma/core/providers'
import { getFetchFn } from '../proxy-fetch'
import { getEffectiveProxyUrl } from '../proxy-settings-service'
import { TRANSIENT_NETWORK_PATTERN } from '../error-patterns'

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
  thinkingEnabled?: boolean
  history?: SDKMessage[]
  env?: Record<string, string | undefined>
  apiFormat?: ApiFormat
  isCodexOAuth?: boolean
  codexFastMode?: boolean
  providerType?: string
}

const activeControllers = new Map<string, AbortController>()
const activeRequests = new Map<string, () => void>()

const MAX_ERROR_MESSAGE_LENGTH = 5000

function buildAnthropicBody(options: OpenAIAgentQueryOptions): AnthropicRequestBody {
  const messages: AnthropicMessage[] = []

  if (options.history) {
    for (const msg of options.history) {
      if (msg.type === 'assistant') {
        const assistantMsg = msg as SDKAssistantMessage
        const content: AnthropicContentBlock[] = []
        for (const block of assistantMsg.message.content) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: (block as { text: string }).text })
          } else if (block.type === 'tool_use') {
            const tb = block as SDKToolUseBlock
            content.push({ type: 'tool_use', id: tb.id, name: tb.name, input: tb.input })
          } else if (block.type === 'thinking') {
            content.push({ type: 'thinking', thinking: (block as { thinking: string }).thinking })
          }
        }
        messages.push({ role: 'assistant', content })
      } else if (msg.type === 'user') {
        const userMsg = msg as { type: 'user'; message?: { content?: Array<{ type: string; text?: string; tool_use_id?: string; content?: string; is_error?: boolean }> } }
        if (userMsg.message?.content) {
          const content: AnthropicContentBlock[] = []
          for (const block of userMsg.message.content) {
            if (block.type === 'text' && block.text) {
              content.push({ type: 'text', text: block.text })
            } else if (block.type === 'tool_result') {
              content.push({
                type: 'tool_result',
                tool_use_id: block.tool_use_id || '',
                content: block.content || '',
                is_error: block.is_error,
              })
            }
          }
          if (content.length > 0) {
            messages.push({ role: 'user', content })
          }
        }
      }
    }
  }

  messages.push({
    role: 'user',
    content: options.prompt,
  })

  const body: AnthropicRequestBody = {
    model: options.model,
    messages,
    stream: true,
    max_tokens: 16384,
  }

  if (options.systemPrompt) {
    body.system = options.systemPrompt
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t): AnthropicTool => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
    body.tool_choice = 'auto'
  }

  if (options.thinkingEnabled) {
    body.thinking = { type: 'enabled', budget_tokens: 16384 }
  }

  return body
}

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

function buildSDKResultMessage(
  sessionId?: string,
  inputTokens = 0,
  outputTokens = 0,
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
    code: mapped.code as TypedError['code'],
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

function resolveApiFormat(options: OpenAIAgentQueryOptions): ApiFormat {
  if (options.apiFormat) return options.apiFormat
  return getClaudeApiFormat({
    meta: {
      providerType: options.providerType,
      apiFormat: undefined,
    },
  })
}

async function* handleNonStreamChat(
  response: Response,
  options: OpenAIAgentQueryOptions,
  model: string,
): AsyncIterable<SDKMessage> {
  const data = await response.json()
  const anthropicResp = openaiToAnthropic(data)
  const content = (anthropicResp.content as Array<Record<string, unknown>>) || []

  const contentBlocks: SDKContentBlock[] = content.map((block): SDKContentBlock => {
    if (block.type === 'thinking') {
      return { type: 'thinking', thinking: block.thinking as string }
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id as string, name: block.name as string, input: (block.input || {}) as Record<string, unknown> }
    }
    return { type: 'text', text: (block.text || '') as string }
  })

  const usage = anthropicResp.usage as { input_tokens?: number; output_tokens?: number } | undefined
  yield buildSDKAssistantMessage(contentBlocks, model, anthropicResp.stop_reason as string, options.sessionId)
  yield buildSDKResultMessage(options.sessionId, usage?.input_tokens, usage?.output_tokens)
}

async function* handleNonStreamResponses(
  response: Response,
  options: OpenAIAgentQueryOptions,
  model: string,
): AsyncIterable<SDKMessage> {
  const data = await response.json()
  const anthropicResp = responsesToAnthropic(data)
  const content = (anthropicResp.content as Array<Record<string, unknown>>) || []

  const contentBlocks: SDKContentBlock[] = content.map((block): SDKContentBlock => {
    if (block.type === 'thinking') {
      return { type: 'thinking', thinking: block.thinking as string }
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id as string, name: block.name as string, input: (block.input || {}) as Record<string, unknown> }
    }
    return { type: 'text', text: (block.text || '') as string }
  })

  const usage = anthropicResp.usage as { input_tokens?: number; output_tokens?: number } | undefined
  yield buildSDKAssistantMessage(contentBlocks, model, anthropicResp.stop_reason as string, options.sessionId)
  yield buildSDKResultMessage(options.sessionId, usage?.input_tokens, usage?.output_tokens)
}

async function* handleStreamChat(
  response: Response,
  options: OpenAIAgentQueryOptions,
): AsyncIterable<SDKMessage> {
  if (!response.body) throw new Error('响应体为空')

  const state = createChatSseState()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const reader = response.body.getReader()
  let buffer = ''

  let inputTokens = 0
  let outputTokens = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const { block, remaining } = takeSseBlock(buffer)
        if (!block) break
        buffer = remaining

        if (!block.data || block.data === '[DONE]') {
          if (block.data === '[DONE]') {
            const finalEvents = finalizeChatStream(state)
            for (const msg of finalEvents) yield msg
            yield buildSDKResultMessage(options.sessionId, inputTokens, outputTokens)
            return
          }
          continue
        }

        try {
          const chunk = JSON.parse(block.data)
          const events = processChatChunkSimple(chunk, state)
          for (const msg of events) yield msg

          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens || inputTokens
            outputTokens = chunk.usage.completion_tokens || outputTokens
          }
        } catch {
          // skip
        }
      }
    }

    const finalEvents = finalizeChatStream(state)
    for (const msg of finalEvents) yield msg
    yield buildSDKResultMessage(options.sessionId, inputTokens, outputTokens)
  } finally {
    reader.releaseLock()
  }
}

function processChatChunkSimple(
  chunk: { id?: string; model?: string; choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number } },
  state: ChatSseState,
): SDKMessage[] {
  const messages: SDKMessage[] = []

  if (chunk.id) state.messageId = chunk.id
  if (chunk.model) state.currentModel = chunk.model

  const delta = chunk.choices?.[0]?.delta

  if (!state.hasSentMessageStart) {
    state.hasSentMessageStart = true
  }

  if (delta?.reasoning_content) {
    if (state.currentNonToolBlockType !== 'thinking') {
      if (state.currentNonToolBlockType) {
        // close previous block
      }
      state.currentNonToolBlockType = 'thinking'
      state.currentNonToolBlockIndex = state.nextContentIndex++
    }
    messages.push(buildSDKAssistantMessage(
      [{ type: 'thinking', thinking: delta.reasoning_content }],
      state.currentModel,
    ))
  }

  if (delta?.content) {
    if (state.currentNonToolBlockType !== 'text') {
      if (state.currentNonToolBlockType) {
        // close previous block
      }
      state.currentNonToolBlockType = 'text'
      state.currentNonToolBlockIndex = state.nextContentIndex++
    }
    messages.push(buildSDKAssistantMessage(
      [{ type: 'text', text: delta.content }],
      state.currentModel,
    ))
  }

  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0
      let toolBlock = state.toolBlocksByIndex.get(idx)

      if (!toolBlock) {
        toolBlock = {
          anthropicIndex: state.nextContentIndex++,
          id: tc.id || '',
          name: tc.function?.name || '',
          started: false,
          pendingArgs: '',
          aborted: false,
        }
        state.toolBlocksByIndex.set(idx, toolBlock)
      }

      if (tc.id) toolBlock.id = tc.id
      if (tc.function?.name) toolBlock.name = tc.function.name

      if (!toolBlock.started && toolBlock.id && toolBlock.name) {
        if (state.currentNonToolBlockType) {
          state.currentNonToolBlockType = null
        }
        toolBlock.started = true
      }

      if (tc.function?.arguments && toolBlock.started && !toolBlock.aborted) {
        toolBlock.pendingArgs += tc.function.arguments
      }
    }
  }

  const finishReason = chunk.choices?.[0]?.finish_reason
  if (finishReason && !state.hasEmittedMessageDelta) {
    state.hasEmittedMessageDelta = true
    let stopReason: string
    switch (finishReason) {
      case 'stop': stopReason = 'end_turn'; break
      case 'length': stopReason = 'max_tokens'; break
      case 'tool_calls': stopReason = 'tool_use'; break
      default: stopReason = 'end_turn'
    }
    state.pendingMessageDelta = { stop_reason: stopReason }

    if (finishReason === 'tool_calls') {
      for (const [, toolBlock] of state.toolBlocksByIndex) {
        if (toolBlock.started && !toolBlock.aborted) {
          let input: Record<string, unknown> = {}
          try {
            input = JSON.parse(toolBlock.pendingArgs)
          } catch {
            input = {}
          }
          messages.push(buildSDKAssistantMessage(
            [{ type: 'tool_use', id: toolBlock.id, name: toolBlock.name, input }],
            state.currentModel,
            'tool_use',
          ))
        }
      }
    }
  }

  return messages
}

function finalizeChatStream(state: ChatSseState): SDKMessage[] {
  const messages: SDKMessage[] = []

  if (state.pendingMessageDelta && state.pendingMessageDelta.stop_reason !== 'tool_use') {
    // Already handled in processChatChunkSimple
  }

  return messages
}

async function* handleStreamResponses(
  response: Response,
  options: OpenAIAgentQueryOptions,
): AsyncIterable<SDKMessage> {
  if (!response.body) throw new Error('响应体为空')

  const state = createResponsesSseState()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  let inputTokens = 0
  let outputTokens = 0
  let currentText = ''
  let currentThinking = ''
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const { block, remaining } = takeSseBlock(buffer)
        if (!block) break
        buffer = remaining

        if (!block.data) continue

        try {
          const data = JSON.parse(block.data)
          const eventName = block.event || ''

          if (eventName === 'response.created') {
            const resp = data.response as Record<string, unknown> | undefined
            if (resp?.id) state.messageId = resp.id as string
            if (resp?.model) state.currentModel = resp.model as string
          }

          if (eventName === 'response.output_text.delta') {
            const textDelta = data.delta as string || ''
            currentText += textDelta
            yield buildSDKAssistantMessage(
              [{ type: 'text', text: textDelta }],
              state.currentModel,
            )
          }

          if (eventName === 'response.reasoning_summary_text.delta') {
            const thinkingDelta = data.delta as string || ''
            currentThinking += thinkingDelta
            yield buildSDKAssistantMessage(
              [{ type: 'thinking', thinking: thinkingDelta }],
              state.currentModel,
            )
          }

          if (eventName === 'response.output_item.added') {
            const item = data.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') {
              state.hasToolUse = true
              toolCalls.push({
                id: (item.call_id || item.id || '') as string,
                name: (item.name || '') as string,
                arguments: '',
              })
            }
          }

          if (eventName === 'response.function_call_arguments.delta') {
            const argsDelta = data.delta as string || ''
            const itemId = (data.item_id ?? '') as string
            const tc = toolCalls[toolCalls.length - 1]
            if (tc) {
              tc.arguments += argsDelta
            }
          }

          if (eventName === 'response.completed') {
            const resp = data.response as Record<string, unknown> | undefined
            const respUsage = (resp?.usage ?? data.usage) as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
            inputTokens = respUsage?.input_tokens ?? respUsage?.prompt_tokens ?? 0
            outputTokens = respUsage?.output_tokens ?? respUsage?.completion_tokens ?? 0

            let stopReason = 'end_turn'
            if (state.hasToolUse) {
              stopReason = 'tool_use'
            }

            if (state.hasToolUse && toolCalls.length > 0) {
              const contentBlocks: SDKToolUseBlock[] = toolCalls.map(tc => {
                let input: Record<string, unknown> = {}
                try {
                  input = JSON.parse(tc.arguments)
                } catch {
                  input = {}
                }
                return { type: 'tool_use', id: tc.id, name: tc.name, input }
              })
              yield buildSDKAssistantMessage(contentBlocks, state.currentModel, 'tool_use', options.sessionId)
            }

            yield buildSDKResultMessage(options.sessionId, inputTokens, outputTokens)
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export class OpenAIAgentAdapter implements AgentProviderAdapter {
  async *query(input: AgentQueryInput): AsyncIterable<SDKMessage> {
    const options = input as OpenAIAgentQueryOptions
    const controller = new AbortController()
    activeControllers.set(options.sessionId, controller)

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)

    const abortCallback = () => { controller.abort() }
    activeRequests.set(options.sessionId, abortCallback)

    try {
      const apiFormat = resolveApiFormat(options)
      const anthropicBody = buildAnthropicBody(options)
      const authConfig = buildAuthHeaders(options.providerType || 'openai', options.apiKey)
      const baseUrl = options.baseUrl.replace(/\/$/, '')

      let url: string
      let requestBody: Record<string, unknown>

      if (apiFormat === 'openai_responses') {
        url = `${baseUrl}/responses`
        requestBody = anthropicToResponses(
          anthropicBody,
          undefined,
          options.isCodexOAuth ?? false,
          options.codexFastMode ?? false,
        )
      } else {
        url = `${baseUrl}/chat/completions`
        requestBody = anthropicToOpenai(anthropicBody)
      }

      const response = await fetchFn(url, {
        method: 'POST',
        headers: authConfig.headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const truncatedText = text.length > MAX_ERROR_MESSAGE_LENGTH
          ? text.slice(0, MAX_ERROR_MESSAGE_LENGTH)
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
          // not JSON
        }

        const typedError = mapErrorToTypedError(errorCode, errorMessage)
        yield buildSDKAssistantMessage([], options.model, undefined, options.sessionId, { message: typedError.message })
        return
      }

      const isStream = requestBody.stream === true

      if (apiFormat === 'openai_responses') {
        if (isStream) {
          yield* handleStreamResponses(response, options)
        } else {
          yield* handleNonStreamResponses(response, options, options.model)
        }
      } else {
        if (isStream) {
          yield* handleStreamChat(response, options)
        } else {
          yield* handleNonStreamChat(response, options, options.model)
        }
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
