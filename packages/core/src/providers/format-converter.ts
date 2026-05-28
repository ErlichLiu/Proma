/**
 * Anthropic ↔ OpenAI 格式转换代理
 *
 * 让 Claude Code（只懂 Anthropic Messages API）能透明地调用 OpenAI（或兼容 OpenAI 的第三方）后端。
 * 请求方向：Anthropic → OpenAI 转换
 * 响应方向：OpenAI → Anthropic 逆转换
 *
 * 支持两种 OpenAI 目标格式：
 * - Chat Completions API（经典 messages/choices 结构）
 * - Responses API（2025 新一代扁平 input/output 结构）
 */

// ===== 工具函数 =====

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + (obj as unknown[]).map(canonicalJsonStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

const BILLING_HEADER_RE = /^x-anthropic-billing-header:.*\n?/

export function stripBillingHeader(text: string): string {
  return text.replace(BILLING_HEADER_RE, '')
}

export function stripSseField(line: string, field: string): string {
  const prefix = field + ':'
  if (line.startsWith(prefix + ' ')) return line.slice(prefix.length + 1)
  if (line.startsWith(prefix)) return line.slice(prefix.length)
  return line
}

export interface SseBlock {
  event?: string
  data: string
}

export function takeSseBlock(buffer: string): { block: SseBlock | null; remaining: string } {
  const idx = buffer.indexOf('\n\n')
  if (idx === -1) return { block: null, remaining: buffer }

  const raw = buffer.slice(0, idx)
  const remaining = buffer.slice(idx + 2)

  let event: string | undefined
  const dataLines: string[] = []

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = stripSseField(line, 'event').trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(stripSseField(line, 'data'))
    }
  }

  return { block: { event, data: dataLines.join('\n') }, remaining }
}

export function cleanSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'format' && value === 'uri') continue
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        cleaned[key] = value.map(item =>
          typeof item === 'object' && item !== null ? cleanSchema(item as Record<string, unknown>) : item
        )
      } else {
        cleaned[key] = cleanSchema(value as Record<string, unknown>)
      }
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

export function sanitizeAnthropicToolUseInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  if (name === 'Read' && 'pages' in input && input.pages === '') {
    const { pages, ...rest } = input
    return rest
  }
  return input
}

// ===== system prompt 处理 =====

interface SystemSegment {
  text: string
  cache_control?: unknown
}

function processSystemPrompt(system: string | SystemSegment[] | undefined): { text: string; cache_control?: unknown } | null {
  if (system == null) return null

  if (typeof system === 'string') {
    const stripped = stripBillingHeader(system).trim()
    if (!stripped) return null
    return { text: stripped }
  }

  if (Array.isArray(system)) {
    const texts: string[] = []
    let allCacheControl: unknown = undefined
    let hasConflict = false
    let firstCache: unknown = undefined

    for (const seg of system) {
      const text = stripBillingHeader(seg.text || '').trim()
      if (!text) continue
      texts.push(text)

      if (seg.cache_control !== undefined) {
        if (firstCache === undefined) {
          firstCache = seg.cache_control
        } else if (JSON.stringify(seg.cache_control) !== JSON.stringify(firstCache)) {
          hasConflict = true
        }
      } else if (firstCache !== undefined) {
        hasConflict = true
      }
    }

    if (texts.length === 0) return null

    allCacheControl = hasConflict ? undefined : firstCache
    return { text: texts.join('\n'), cache_control: allCacheControl }
  }

  return null
}

// ===== thinking → reasoning_effort 映射 =====

const O_SERIES_RE = /^o\d/
const GPT5_PLUS_RE = /^gpt-[5-9]/

function isReasoningEffortModel(model: string): boolean {
  return O_SERIES_RE.test(model) || GPT5_PLUS_RE.test(model)
}

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

function resolveReasoningEffort(body: Record<string, unknown>): ReasoningEffort | null {
  const outputConfig = body.output_config as { effort?: string } | undefined
  if (outputConfig?.effort) {
    const map: Record<string, ReasoningEffort> = { low: 'low', medium: 'medium', high: 'high', max: 'xhigh' }
    return map[outputConfig.effort] ?? null
  }

  const thinking = body.thinking as { type?: string; budget_tokens?: number } | undefined
  if (!thinking || thinking.type === 'disabled') return null

  if (thinking.type === 'adaptive') return 'xhigh'
  if (thinking.type === 'enabled') {
    if (thinking.budget_tokens == null) return 'high'
    if (thinking.budget_tokens < 4000) return 'low'
    if (thinking.budget_tokens < 16000) return 'medium'
    return 'high'
  }

  return null
}

// ===== Anthropic → OpenAI Chat Completions =====

export interface AnthropicContentBlock {
  type: string
  text?: string
  thinking?: string
  signature?: string
  source?: { type: string; media_type: string; data: string }
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  is_error?: boolean
  cache_control?: unknown
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export interface AnthropicTool {
  type?: string
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

export interface AnthropicRequestBody {
  model: string
  messages: AnthropicMessage[]
  system?: string | SystemSegment[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  stream?: boolean
  thinking?: { type: string; budget_tokens?: number }
  output_config?: { effort?: string }
  tools?: AnthropicTool[]
  tool_choice?: string | { type: string; name?: string }
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentPart[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  reasoning_content?: string
  cache_control?: unknown
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
  cache_control?: unknown
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export function anthropicToOpenai(
  body: AnthropicRequestBody,
  preserveReasoningContent = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = { model: body.model }

  // system → system message
  const systemResult = processSystemPrompt(body.system)
  const openaiMessages: OpenAIMessage[] = []

  if (systemResult) {
    const sysMsg: OpenAIMessage = { role: 'system', content: systemResult.text }
    if (systemResult.cache_control) {
      sysMsg.cache_control = systemResult.cache_control
    }
    openaiMessages.push(sysMsg)
  }

  // messages 转换
  for (const msg of body.messages) {
    const role = msg.role as 'user' | 'assistant'

    if (typeof msg.content === 'string') {
      openaiMessages.push({ role, content: msg.content || null })
      continue
    }

    if (msg.content == null) {
      openaiMessages.push({ role, content: null })
      continue
    }

    const contentParts: OpenAIContentPart[] = []
    const toolCalls: OpenAIToolCall[] = []
    let thinkingText = ''
    let hasCacheControl = false

    for (const block of msg.content as AnthropicContentBlock[]) {
      switch (block.type) {
        case 'text': {
          const part: OpenAIContentPart = { type: 'text', text: block.text || '' }
          if (block.cache_control) {
            part.cache_control = block.cache_control
            hasCacheControl = true
          }
          contentParts.push(part)
          break
        }
        case 'image': {
          if (block.source?.type === 'base64') {
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            })
          }
          break
        }
        case 'tool_use': {
          toolCalls.push({
            id: block.id || '',
            type: 'function',
            function: {
              name: block.name || '',
              arguments: canonicalJsonStringify(block.input || {}),
            },
          })
          break
        }
        case 'tool_result': {
          let toolContent: string
          if (typeof block.content === 'string') {
            toolContent = block.content
          } else if (Array.isArray(block.content)) {
            toolContent = (block.content as AnthropicContentBlock[])
              .filter(b => b.type === 'text')
              .map(b => b.text || '')
              .join('\n')
          } else {
            toolContent = JSON.stringify(block.content)
          }
          openaiMessages.push({
            role: 'tool',
            tool_call_id: block.tool_use_id || '',
            content: toolContent,
          })
          break
        }
        case 'thinking': {
          if (block.thinking) {
            thinkingText += block.thinking
          }
          break
        }
      }
    }

    if (contentParts.length > 0 || toolCalls.length > 0) {
      const openaiMsg: OpenAIMessage = {
        role,
        content: contentParts.length === 1 && !hasCacheControl && contentParts[0].type === 'text'
          ? contentParts[0].text || ''
          : contentParts.length > 0
            ? contentParts
            : null,
      }

      if (toolCalls.length > 0) {
        openaiMsg.tool_calls = toolCalls
        if (preserveReasoningContent && thinkingText) {
          openaiMsg.reasoning_content = thinkingText
        } else if (preserveReasoningContent) {
          openaiMsg.reasoning_content = 'tool call'
        }
      }

      openaiMessages.push(openaiMsg)
    } else if (thinkingText && preserveReasoningContent && role === 'assistant') {
      openaiMessages.push({
        role,
        content: null,
        reasoning_content: thinkingText,
      })
    }
  }

  // system message 归一化
  normalizeSystemMessages(openaiMessages)

  result.messages = openaiMessages

  // 参数映射
  const isOSeries = O_SERIES_RE.test(body.model)
  if (body.max_tokens != null) {
    result[isOSeries ? 'max_completion_tokens' : 'max_tokens'] = body.max_tokens
  }
  if (body.temperature != null) result.temperature = body.temperature
  if (body.top_p != null) result.top_p = body.top_p
  if (body.stop_sequences) result.stop = body.stop_sequences
  if (body.stream != null) result.stream = body.stream

  // thinking → reasoning_effort
  if (isReasoningEffortModel(body.model)) {
    const effort = resolveReasoningEffort(body as unknown as Record<string, unknown>)
    if (effort) result.reasoning_effort = effort
  }

  // tools 转换
  if (body.tools && body.tools.length > 0) {
    const filtered = body.tools.filter(t => t.type !== 'BatchTool')
    if (filtered.length > 0) {
      result.tools = filtered.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          ...(t.description && { description: t.description }),
          parameters: cleanSchema(t.input_schema || { type: 'object', properties: {} }),
        },
      }))
    }
  }

  // tool_choice 映射
  if (body.tool_choice != null) {
    result.tool_choice = mapToolChoiceToOpenai(body.tool_choice)
  }

  return result
}

function normalizeSystemMessages(messages: OpenAIMessage[]): void {
  const systemMsgs = messages.filter(m => m.role === 'system')
  if (systemMsgs.length <= 1) return

  const nonSystemMsgs = messages.filter(m => m.role !== 'system')

  const texts: string[] = []
  let allCacheControl: unknown = undefined
  let hasConflict = false
  let firstCache: unknown = undefined

  for (const msg of systemMsgs) {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    texts.push(text)

    if (msg.cache_control !== undefined) {
      if (firstCache === undefined) {
        firstCache = msg.cache_control
      } else if (JSON.stringify(msg.cache_control) !== JSON.stringify(firstCache)) {
        hasConflict = true
      }
    } else if (firstCache !== undefined) {
      hasConflict = true
    }
  }

  allCacheControl = hasConflict ? undefined : firstCache

  const merged: OpenAIMessage = { role: 'system', content: texts.join('\n') }
  if (allCacheControl) merged.cache_control = allCacheControl

  messages.length = 0
  messages.push(merged, ...nonSystemMsgs)
}

function mapToolChoiceToOpenai(toolChoice: string | { type: string; name?: string }): string | Record<string, unknown> {
  if (typeof toolChoice === 'string') {
    if (toolChoice === 'auto') return 'auto'
    if (toolChoice === 'any') return 'required'
    if (toolChoice === 'none') return 'none'
    return toolChoice
  }
  if (toolChoice.type === 'auto') return 'auto'
  if (toolChoice.type === 'any') return 'required'
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } }
  }
  return 'auto'
}

// ===== Anthropic → Responses API =====

export interface ResponsesApiInputItem {
  role?: 'user' | 'assistant'
  type?: 'message' | 'function_call' | 'function_call_output'
  content?: Array<{ type: string; text?: string; image_url?: string }>
  call_id?: string
  name?: string
  arguments?: string
  output?: string
}

export function anthropicToResponses(
  body: AnthropicRequestBody,
  cacheKey?: string,
  isCodexOAuth = false,
  codexFastMode = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = { model: body.model }

  // system → instructions
  const systemResult = processSystemPrompt(body.system)
  result.instructions = systemResult?.text ?? ''

  // messages → input
  const inputItems: ResponsesApiInputItem[] = []

  for (const msg of body.messages) {
    const role = msg.role as 'user' | 'assistant'

    if (typeof msg.content === 'string') {
      inputItems.push({
        role,
        type: 'message',
        content: [{
          type: role === 'assistant' ? 'output_text' : 'input_text',
          text: msg.content,
        }],
      })
      continue
    }

    if (msg.content == null) {
      continue
    }

    let currentContent: Array<{ type: string; text?: string; image_url?: string }> = []

    function flushCurrentContent(): void {
      if (currentContent.length > 0) {
        inputItems.push({
          role,
          type: 'message',
          content: currentContent,
        })
        currentContent = []
      }
    }

    for (const block of msg.content as AnthropicContentBlock[]) {
      switch (block.type) {
        case 'text': {
          currentContent.push({
            type: role === 'assistant' ? 'output_text' : 'input_text',
            text: block.text || '',
          })
          break
        }
        case 'image': {
          if (block.source?.type === 'base64') {
            currentContent.push({
              type: 'input_image',
              image_url: `data:${block.source.media_type};base64,${block.source.data}`,
            })
          }
          break
        }
        case 'tool_use': {
          flushCurrentContent()
          inputItems.push({
            type: 'function_call',
            call_id: block.id || '',
            name: block.name || '',
            arguments: canonicalJsonStringify(sanitizeAnthropicToolUseInput(block.name || '', block.input || {})),
          })
          break
        }
        case 'tool_result': {
          flushCurrentContent()
          let outputContent: string
          if (typeof block.content === 'string') {
            outputContent = block.content
          } else if (Array.isArray(block.content)) {
            outputContent = (block.content as AnthropicContentBlock[])
              .filter(b => b.type === 'text')
              .map(b => b.text || '')
              .join('\n')
          } else {
            outputContent = JSON.stringify(block.content)
          }
          inputItems.push({
            type: 'function_call_output',
            call_id: block.tool_use_id || '',
            output: outputContent,
          })
          break
        }
        case 'thinking': {
          break
        }
      }
    }

    flushCurrentContent()
  }

  result.input = inputItems

  // 参数
  result.max_output_tokens = body.max_tokens ?? 16384
  if (body.temperature != null) result.temperature = body.temperature
  if (body.top_p != null) result.top_p = body.top_p
  if (body.stream != null) result.stream = body.stream

  // reasoning
  if (isReasoningEffortModel(body.model)) {
    const effort = resolveReasoningEffort(body as unknown as Record<string, unknown>)
    if (effort) {
      result.reasoning = { effort }
    }
  }

  // tools 转换
  if (body.tools && body.tools.length > 0) {
    const filtered = body.tools.filter(t => t.type !== 'BatchTool')
    if (filtered.length > 0) {
      result.tools = filtered.map(t => ({
        type: 'function',
        name: t.name,
        ...(t.description && { description: t.description }),
        parameters: cleanSchema(t.input_schema || { type: 'object', properties: {} }),
      }))
    }
  }

  // tool_choice 映射
  if (body.tool_choice != null) {
    result.tool_choice = mapToolChoiceToResponses(body.tool_choice)
  }

  // Codex OAuth 特殊约束
  if (isCodexOAuth) {
    result.store = false
    result.include = ['reasoning.encrypted_content']
    delete result.max_output_tokens
    delete result.temperature
    delete result.top_p
    result.instructions = result.instructions || ''
    result.tools = result.tools || []
    result.parallel_tool_calls = false
    result.stream = true
    if (codexFastMode) {
      result.service_tier = 'priority'
    }
  }

  return result
}

function mapToolChoiceToResponses(toolChoice: string | { type: string; name?: string }): string | Record<string, unknown> {
  if (typeof toolChoice === 'string') {
    if (toolChoice === 'auto') return 'auto'
    if (toolChoice === 'any') return 'required'
    if (toolChoice === 'none') return 'none'
    return toolChoice
  }
  if (toolChoice.type === 'auto') return 'auto'
  if (toolChoice.type === 'any') return 'required'
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', name: toolChoice.name }
  }
  return 'auto'
}

// ===== OpenAI Chat Completions → Anthropic =====

export interface OpenAIChatResponse {
  id?: string
  model?: string
  choices?: Array<{
    message?: {
      role?: string
      content?: string | Array<{ type: string; text?: string; refusal?: string }>
      reasoning_content?: string
      refusal?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
      function_call?: { name: string; arguments: string }
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

export function openaiToAnthropic(body: OpenAIChatResponse): Record<string, unknown> {
  const choice = body.choices?.[0]
  const message = choice?.message

  const content: Array<Record<string, unknown>> = []

  if (message?.reasoning_content) {
    content.push({ type: 'thinking', thinking: message.reasoning_content })
  }

  if (message?.content) {
    if (typeof message.content === 'string') {
      content.push({ type: 'text', text: message.content })
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text' && part.text) {
          content.push({ type: 'text', text: part.text })
        } else if (part.type === 'output_text' && part.text) {
          content.push({ type: 'text', text: part.text })
        } else if (part.refusal) {
          content.push({ type: 'text', text: part.refusal })
        }
      }
    }
  }

  if (message?.refusal) {
    content.push({ type: 'text', text: message.refusal })
  }

  const hasToolUse = (message?.tool_calls && message.tool_calls.length > 0) || message?.function_call

  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(tc.function.arguments)
      } catch {
        input = {}
      }
      input = sanitizeAnthropicToolUseInput(tc.function.name, input)
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
    }
  } else if (message?.function_call) {
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(message.function_call.arguments)
    } catch {
      input = {}
    }
    input = sanitizeAnthropicToolUseInput(message.function_call.name, input)
    content.push({ type: 'tool_use', id: 'fc_0', name: message.function_call.name, input })
  }

  let stopReason = mapFinishReason(choice?.finish_reason)
  if (hasToolUse && stopReason !== 'tool_use') {
    stopReason = 'tool_use'
  }

  const usage = mapOpenaiUsage(body.usage)

  return {
    id: body.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: body.model || '',
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  }
}

function mapFinishReason(reason?: string): string {
  switch (reason) {
    case 'stop': return 'end_turn'
    case 'length': return 'max_tokens'
    case 'tool_calls':
    case 'function_call': return 'tool_use'
    case 'content_filter': return 'end_turn'
    default: return 'end_turn'
  }
}

function mapOpenaiUsage(usage?: OpenAIChatResponse['usage']): Record<string, unknown> {
  if (!usage) return { input_tokens: 0, output_tokens: 0 }

  const result: Record<string, unknown> = {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
  }

  if (usage.prompt_tokens_details?.cached_tokens) {
    result.cache_read_input_tokens = usage.prompt_tokens_details.cached_tokens
  }
  if (usage.cache_read_input_tokens != null) {
    result.cache_read_input_tokens = usage.cache_read_input_tokens
  }
  if (usage.cache_creation_input_tokens != null) {
    result.cache_creation_input_tokens = usage.cache_creation_input_tokens
  }

  return result
}

// ===== Responses API → Anthropic =====

export interface ResponsesApiOutputItem {
  type: string
  id?: string
  call_id?: string
  name?: string
  arguments?: string
  content?: Array<{ type: string; text?: string; refusal?: string }>
  summary?: Array<{ type: string; text?: string }>
}

export interface ResponsesApiResponse {
  id?: string
  model?: string
  status?: string
  status_details?: { reason?: string }
  output?: ResponsesApiOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
    prompt_tokens_details?: { cached_tokens?: number }
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

export function responsesToAnthropic(body: ResponsesApiResponse): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = []
  let hasToolUse = false

  if (body.output) {
    for (const item of body.output) {
      switch (item.type) {
        case 'message': {
          if (item.content) {
            for (const part of item.content) {
              if ((part.type === 'output_text' || part.type === 'text') && part.text) {
                content.push({ type: 'text', text: part.text })
              } else if (part.refusal) {
                content.push({ type: 'text', text: part.refusal })
              }
            }
          }
          break
        }
        case 'function_call': {
          hasToolUse = true
          let input: Record<string, unknown> = {}
          try {
            input = JSON.parse(item.arguments || '{}')
          } catch {
            input = {}
          }
          input = sanitizeAnthropicToolUseInput(item.name || '', input)
          content.push({
            type: 'tool_use',
            id: item.call_id || item.id || '',
            name: item.name || '',
            input,
          })
          break
        }
        case 'reasoning': {
          if (item.summary) {
            const texts = item.summary
              .filter(s => s.type === 'summary_text' && s.text)
              .map(s => s.text!)
            if (texts.length > 0) {
              content.push({ type: 'thinking', thinking: texts.join('\n') })
            }
          }
          break
        }
      }
    }
  }

  let stopReason = 'end_turn'
  if (body.status === 'completed' && hasToolUse) {
    stopReason = 'tool_use'
  } else if (body.status === 'incomplete') {
    const reason = body.status_details?.reason
    if (reason === 'max_output_tokens' || reason === 'max_tokens' || reason == null) {
      stopReason = 'max_tokens'
    } else {
      stopReason = 'end_turn'
    }
  }

  const usage = mapResponsesUsage(body.usage)

  return {
    id: body.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: body.model || '',
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  }
}

function mapResponsesUsage(usage?: ResponsesApiResponse['usage']): Record<string, unknown> {
  if (!usage) return { input_tokens: 0, output_tokens: 0 }

  const result: Record<string, unknown> = {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
  }

  if (usage.input_tokens_details?.cached_tokens) {
    result.cache_read_input_tokens = usage.input_tokens_details.cached_tokens
  }
  if (usage.prompt_tokens_details?.cached_tokens) {
    result.cache_read_input_tokens = usage.prompt_tokens_details.cached_tokens
  }
  if (usage.cache_read_input_tokens != null) {
    result.cache_read_input_tokens = usage.cache_read_input_tokens
  }
  if (usage.cache_creation_input_tokens != null) {
    result.cache_creation_input_tokens = usage.cache_creation_input_tokens
  }

  return result
}

// ===== Chat Completions SSE → Anthropic SSE =====

export interface ChatSseState {
  messageId: string
  currentModel: string
  hasSentMessageStart: boolean
  nextContentIndex: number
  currentNonToolBlockType: 'text' | 'thinking' | null
  currentNonToolBlockIndex: number
  toolBlocksByIndex: Map<number, { anthropicIndex: number; id: string; name: string; started: boolean; pendingArgs: string; aborted?: boolean }>
  hasEmittedMessageDelta: boolean
  pendingMessageDelta: { stop_reason: string; usage?: Record<string, unknown> } | null
}

export function createChatSseState(): ChatSseState {
  return {
    messageId: `msg_${Date.now()}`,
    currentModel: '',
    hasSentMessageStart: false,
    nextContentIndex: 0,
    currentNonToolBlockType: null,
    currentNonToolBlockIndex: -1,
    toolBlocksByIndex: new Map(),
    hasEmittedMessageDelta: false,
    pendingMessageDelta: null,
  }
}

export interface AnthropicSseEvent {
  event: string
  data: Record<string, unknown>
}

const COPILOT_WHITESPACE_RE = /\s{20,}/

export function processChatSseChunk(
  chunk: { id?: string; model?: string; choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } },
  state: ChatSseState,
): AnthropicSseEvent[] {
  const events: AnthropicSseEvent[] = []

  if (chunk.id) state.messageId = chunk.id
  if (chunk.model) state.currentModel = chunk.model

  const delta = chunk.choices?.[0]?.delta

  if (!state.hasSentMessageStart) {
    state.hasSentMessageStart = true
    events.push({
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: state.messageId,
          type: 'message',
          role: 'assistant',
          model: state.currentModel,
          content: [],
          usage: { input_tokens: chunk.usage?.prompt_tokens ?? 0, output_tokens: 0 },
        },
      },
    })
  }

  if (delta?.reasoning_content) {
    if (state.currentNonToolBlockType !== 'thinking') {
      if (state.currentNonToolBlockType) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentNonToolBlockIndex },
        })
      }
      state.currentNonToolBlockType = 'thinking'
      state.currentNonToolBlockIndex = state.nextContentIndex++
      events.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: state.currentNonToolBlockIndex,
          content_block: { type: 'thinking', thinking: '' },
        },
      })
    }
    events.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: state.currentNonToolBlockIndex,
        delta: { type: 'thinking_delta', thinking: delta.reasoning_content },
      },
    })
  }

  if (delta?.content) {
    if (state.currentNonToolBlockType !== 'text') {
      if (state.currentNonToolBlockType) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentNonToolBlockIndex },
        })
      }
      state.currentNonToolBlockType = 'text'
      state.currentNonToolBlockIndex = state.nextContentIndex++
      events.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: state.currentNonToolBlockIndex,
          content_block: { type: 'text', text: '' },
        },
      })
    }
    events.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: state.currentNonToolBlockIndex,
        delta: { type: 'text_delta', text: delta.content },
      },
    })
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
          events.push({
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: state.currentNonToolBlockIndex },
          })
          state.currentNonToolBlockType = null
        }

        toolBlock.started = true
        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: toolBlock.anthropicIndex,
            content_block: { type: 'tool_use', id: toolBlock.id, name: toolBlock.name, input: {} },
          },
        })
      }

      if (tc.function?.arguments && toolBlock.started && !toolBlock.aborted) {
        if (COPILOT_WHITESPACE_RE.test(tc.function.arguments)) {
          toolBlock.aborted = true
          events.push({
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: toolBlock.anthropicIndex },
          })
          continue
        }
        toolBlock.pendingArgs += tc.function.arguments
        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: toolBlock.anthropicIndex,
            delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
          },
        })
      }
    }
  }

  const finishReason = chunk.choices?.[0]?.finish_reason
  if (finishReason && !state.hasEmittedMessageDelta) {
    let stopReason: string
    switch (finishReason) {
      case 'stop': stopReason = 'end_turn'; break
      case 'length': stopReason = 'max_tokens'; break
      case 'tool_calls': stopReason = 'tool_use'; break
      default: stopReason = 'end_turn'
    }

    const usageData: Record<string, unknown> = {}
    if (chunk.usage) {
      usageData.output_tokens = chunk.usage.completion_tokens ?? 0
      if (chunk.usage.prompt_tokens_details?.cached_tokens) {
        usageData.cache_read_input_tokens = chunk.usage.prompt_tokens_details.cached_tokens
      }
    }

    state.pendingMessageDelta = { stop_reason: stopReason, usage: usageData }
  }

  return events
}

export function finalizeChatSseStream(state: ChatSseState): AnthropicSseEvent[] {
  const events: AnthropicSseEvent[] = []

  if (state.currentNonToolBlockType) {
    events.push({
      event: 'content_block_stop',
      data: { type: 'content_block_stop', index: state.currentNonToolBlockIndex },
    })
  }

  for (const [, toolBlock] of state.toolBlocksByIndex) {
    if (toolBlock.started && !toolBlock.aborted) {
      events.push({
        event: 'content_block_stop',
        data: { type: 'content_block_stop', index: toolBlock.anthropicIndex },
      })
    }
  }

  if (state.pendingMessageDelta) {
    events.push({
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: state.pendingMessageDelta.stop_reason, stop_sequence: null },
        usage: state.pendingMessageDelta.usage || {},
      },
    })
  }

  events.push({
    event: 'message_stop',
    data: { type: 'message_stop' },
  })

  return events
}

// ===== Responses API SSE → Anthropic SSE =====

export interface ResponsesSseState {
  messageId: string
  currentModel: string
  hasSentMessageStart: boolean
  nextContentIndex: number
  indexByKey: Map<string, number>
  toolIndexByItemId: Map<string, number>
  toolArgsByIndex: Map<number, string>
  hasToolUse: boolean
  currentBlockType: 'text' | 'thinking' | 'tool_use' | null
  currentBlockIndex: number
}

export function createResponsesSseState(): ResponsesSseState {
  return {
    messageId: `msg_${Date.now()}`,
    currentModel: '',
    hasSentMessageStart: false,
    nextContentIndex: 0,
    indexByKey: new Map(),
    toolIndexByItemId: new Map(),
    toolArgsByIndex: new Map(),
    hasToolUse: false,
    currentBlockType: null,
    currentBlockIndex: -1,
  }
}

export function processResponsesSseEvent(
  eventName: string,
  data: Record<string, unknown>,
  state: ResponsesSseState,
): AnthropicSseEvent[] {
  const events: AnthropicSseEvent[] = []

  const response = data.response as Record<string, unknown> | undefined
  const item = data.item as Record<string, unknown> | undefined
  const part = data.part as Record<string, unknown> | undefined

  switch (eventName) {
    case 'response.created': {
      if (response) {
        state.messageId = (response.id as string) || state.messageId
        state.currentModel = (response.model as string) || state.currentModel
      }
      if (!state.hasSentMessageStart) {
        state.hasSentMessageStart = true
        events.push({
          event: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: state.messageId,
              type: 'message',
              role: 'assistant',
              model: state.currentModel,
              content: [],
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        })
      }
      break
    }

    case 'response.content_part.added': {
      const contentIndex = (part?.['content_index'] ?? data.content_index ?? 0) as number
      const itemId = (item?.id ?? data.item_id ?? '') as string
      const key = `${itemId}:${contentIndex}`
      const idx = state.nextContentIndex++
      state.indexByKey.set(key, idx)

      if (state.currentBlockType) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentBlockIndex },
        })
      }

      state.currentBlockType = 'text'
      state.currentBlockIndex = idx
      events.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: idx,
          content_block: { type: 'text', text: '' },
        },
      })
      break
    }

    case 'response.output_text.delta': {
      const contentIndex = (data.content_index ?? 0) as number
      const itemId = (data.item_id ?? '') as string
      const key = `${itemId}:${contentIndex}`
      let idx = state.indexByKey.get(key)
      if (idx == null) {
        idx = state.nextContentIndex++
        state.indexByKey.set(key, idx)
      }

      if (state.currentBlockType !== 'text' || state.currentBlockIndex !== idx) {
        if (state.currentBlockType) {
          events.push({
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: state.currentBlockIndex },
          })
        }
        state.currentBlockType = 'text'
        state.currentBlockIndex = idx
        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: idx,
            content_block: { type: 'text', text: '' },
          },
        })
      }

      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: idx,
          delta: { type: 'text_delta', text: data.delta as string || '' },
        },
      })
      break
    }

    case 'response.content_part.done': {
      const contentIndex2 = (part?.['content_index'] ?? data.content_index ?? 0) as number
      const itemId2 = (item?.id ?? data.item_id ?? '') as string
      const key2 = `${itemId2}:${contentIndex2}`
      const idx2 = state.indexByKey.get(key2)
      if (idx2 != null) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: idx2 },
        })
        if (state.currentBlockIndex === idx2) {
          state.currentBlockType = null
        }
      }
      break
    }

    case 'response.output_item.added': {
      const itemType = (item?.type ?? data.type) as string
      if (itemType === 'function_call') {
        state.hasToolUse = true
        const callId = (item?.call_id ?? data.call_id ?? '') as string
        const fcName = (item?.name ?? data.name ?? '') as string
        const fcItemId = (item?.id ?? data.item_id ?? '') as string

        if (state.currentBlockType) {
          events.push({
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: state.currentBlockIndex },
          })
          state.currentBlockType = null
        }

        const toolIdx = state.nextContentIndex++
        state.toolIndexByItemId.set(fcItemId, toolIdx)
        state.toolArgsByIndex.set(toolIdx, '')

        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: toolIdx,
            content_block: { type: 'tool_use', id: callId, name: fcName, input: {} },
          },
        })
      }
      break
    }

    case 'response.function_call_arguments.delta': {
      const fcItemId2 = (data.item_id ?? '') as string
      const toolIdx2 = state.toolIndexByItemId.get(fcItemId2)
      if (toolIdx2 != null) {
        const argsDelta = data.delta as string || ''
        const prev = state.toolArgsByIndex.get(toolIdx2) || ''
        state.toolArgsByIndex.set(toolIdx2, prev + argsDelta)

        events.push({
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: toolIdx2,
            delta: { type: 'input_json_delta', partial_json: argsDelta },
          },
        })
      }
      break
    }

    case 'response.output_item.done': {
      const doneItemId = (item?.id ?? data.item_id ?? '') as string
      const toolIdx3 = state.toolIndexByItemId.get(doneItemId)
      if (toolIdx3 != null) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: toolIdx3 },
        })
      }
      break
    }

    case 'response.reasoning_summary_part.added': {
      const rsItemId = (data.item_id ?? '') as string
      const rsContentIndex = (data.content_index ?? 0) as number
      const rsKey = `reasoning:${rsItemId}:${rsContentIndex}`
      const rsIdx = state.nextContentIndex++
      state.indexByKey.set(rsKey, rsIdx)

      if (state.currentBlockType) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentBlockIndex },
        })
      }

      state.currentBlockType = 'thinking'
      state.currentBlockIndex = rsIdx
      events.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: rsIdx,
          content_block: { type: 'thinking', thinking: '' },
        },
      })
      break
    }

    case 'response.reasoning_summary_text.delta': {
      const rstItemId = (data.item_id ?? '') as string
      const rstContentIndex = (data.content_index ?? 0) as number
      const rstKey = `reasoning:${rstItemId}:${rstContentIndex}`
      let rstIdx = state.indexByKey.get(rstKey)
      if (rstIdx == null) {
        rstIdx = state.nextContentIndex++
        state.indexByKey.set(rstKey, rstIdx)
      }

      if (state.currentBlockType !== 'thinking' || state.currentBlockIndex !== rstIdx) {
        if (state.currentBlockType) {
          events.push({
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: state.currentBlockIndex },
          })
        }
        state.currentBlockType = 'thinking'
        state.currentBlockIndex = rstIdx
        events.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: rstIdx,
            content_block: { type: 'thinking', thinking: '' },
          },
        })
      }

      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: rstIdx,
          delta: { type: 'thinking_delta', thinking: data.delta as string || '' },
        },
      })
      break
    }

    case 'response.reasoning_summary_part.done': {
      const rsdItemId = (data.item_id ?? '') as string
      const rsdContentIndex = (data.content_index ?? 0) as number
      const rsdKey = `reasoning:${rsdItemId}:${rsdContentIndex}`
      const rsdIdx = state.indexByKey.get(rsdKey)
      if (rsdIdx != null) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: rsdIdx },
        })
        if (state.currentBlockIndex === rsdIdx) {
          state.currentBlockType = null
        }
      }
      break
    }

    case 'response.completed': {
      if (state.currentBlockType) {
        events.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentBlockIndex },
        })
        state.currentBlockType = null
      }

      const respStatus = (response?.status ?? data.status) as string
      const respStatusDetails = (response?.status_details ?? data.status_details) as { reason?: string } | undefined
      let stopReason = 'end_turn'
      if (respStatus === 'completed' && state.hasToolUse) {
        stopReason = 'tool_use'
      } else if (respStatus === 'incomplete') {
        const reason = respStatusDetails?.reason
        if (reason === 'max_output_tokens' || reason === 'max_tokens' || reason == null) {
          stopReason = 'max_tokens'
        }
      }

      const respUsage = (response?.usage ?? data.usage) as ResponsesApiResponse['usage']
      const usageData = mapResponsesUsage(respUsage)

      events.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: usageData,
        },
      })

      events.push({
        event: 'message_stop',
        data: { type: 'message_stop' },
      })
      break
    }
  }

  return events
}

// ===== API 格式选择 =====

export type ApiFormat = 'anthropic' | 'openai_chat' | 'openai_responses' | 'gemini_native'

export interface ProviderInfo {
  meta?: {
    providerType?: string
    apiFormat?: ApiFormat
  }
  settings_config?: {
    api_format?: ApiFormat
  }
  openrouter_compat_mode?: boolean | number | string
}

export function getClaudeApiFormat(provider: ProviderInfo): ApiFormat {
  if (provider.meta?.providerType === 'codex_oauth') return 'openai_responses'
  if (provider.meta?.apiFormat) return provider.meta.apiFormat
  if (provider.settings_config?.api_format) return provider.settings_config.api_format
  if (provider.openrouter_compat_mode) return 'openai_chat'
  return 'anthropic'
}

// ===== Auth 认证适配 =====

export interface AuthConfig {
  headers: Record<string, string>
}

export function buildAuthHeaders(
  providerType: string,
  apiKey: string,
  extraHeaders?: Record<string, string>,
): AuthConfig {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extraHeaders,
  }

  switch (providerType) {
    case 'anthropic':
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'claude_auth':
      headers['Authorization'] = `Bearer ${apiKey}`
      break
    case 'openrouter':
      headers['Authorization'] = `Bearer ${apiKey}`
      headers['HTTP-Referer'] = 'https://proma.app'
      headers['X-Title'] = 'Proma'
      break
    case 'copilot':
    case 'codex_oauth':
      headers['Authorization'] = `Bearer ${apiKey}`
      break
    default:
      headers['Authorization'] = `Bearer ${apiKey}`
  }

  return { headers }
}

// ===== SSE 流式转换辅助 =====

export function createAnthropicSseStream(
  upstream: ReadableStream<Uint8Array>,
  state: ChatSseState,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            const finalEvents = finalizeChatSseStream(state)
            for (const evt of finalEvents) {
              controller.enqueue(encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`))
            }
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })

          while (true) {
            const { block, remaining } = takeSseBlock(buffer)
            if (!block) break
            buffer = remaining

            if (!block.data || block.data === '[DONE]') {
              if (block.data === '[DONE]') {
                const finalEvents = finalizeChatSseStream(state)
                for (const evt of finalEvents) {
                  controller.enqueue(encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`))
                }
                controller.close()
                return
              }
              continue
            }

            try {
              const chunk = JSON.parse(block.data)
              const anthropicEvents = processChatSseChunk(chunk, state)
              for (const evt of anthropicEvents) {
                controller.enqueue(encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`))
              }
            } catch {
              // skip unparseable chunks
            }
          }
        }
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
    cancel() {
      upstream.cancel()
    },
  })
}

export function createAnthropicSseStreamFromResponses(
  upstream: ReadableStream<Uint8Array>,
  state: ResponsesSseState,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })

          while (true) {
            const { block, remaining } = takeSseBlock(buffer)
            if (!block) break
            buffer = remaining

            if (!block.data) continue

            try {
              const data = JSON.parse(block.data)
              const eventName = block.event || ''
              const anthropicEvents = processResponsesSseEvent(eventName, data, state)
              for (const evt of anthropicEvents) {
                controller.enqueue(encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`))
              }
            } catch {
              // skip unparseable chunks
            }
          }
        }
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
    cancel() {
      upstream.cancel()
    },
  })
}
