/**
 * 定时任务意图判断（Automation Intent Detection）
 *
 * 在用户向 Agent 发送消息后异步运行，判断是否暗含"周期性任务"意图。
 *
 * 判断链（短路 fallback）：
 *   1. 关键词预过滤 —— 不含时间周期词直接 return null
 *   2. 优先用已启用的 DeepSeek V4 Pro 渠道做 JSON-mode 判断（最便宜准确）
 *   3. 没有 DeepSeek → fallback 到已启用的 Anthropic 渠道（claude-opus-4-7）
 *   4. 都没有 → 纯启发式：用正则从消息里提取频率（保守、只匹配明确表达）
 *
 * 所有失败路径一律 return null，不抛异常 —— 主流程绝不能被本模块影响。
 */

import { containsAutomationKeyword, type Automation } from '@proma/shared'
import type { AutomationIntentSuggestion, Channel } from '@proma/shared'
import { listChannels, decryptApiKey } from './channel-manager'
import { createAutomation } from './automation-manager'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { getFetchFn } from './proxy-fetch'

const DEEPSEEK_MODEL_ID = 'deepseek-v4-pro'
const CLAUDE_MODEL_ID = 'claude-opus-4-7'

const HIGH_CONFIDENCE_THRESHOLD = 0.8
const FETCH_TIMEOUT_MS = 15_000

const INTENT_SYSTEM_PROMPT = `你是一个意图分析器，专门判断用户消息是否表达"周期性/定时任务"需求。

你必须返回严格的 JSON 对象，字段如下：
{
  "isAutomation": boolean,        // 用户是否想要一个周期性执行的任务
  "confidence": number,           // 0~1 之间，对 isAutomation 的置信度
  "hasExplicitSchedule": boolean, // 用户是否明确说出了频率（如"每 10 分钟"）
  "suggestedName": string,        // 简短任务名（4-12 字，中文）
  "suggestedPrompt": string,      // 给定时任务每次运行时发送的消息（保留用户原意，去掉时间词，使用第二人称指令）
  "suggestedSchedule": {          // 仅当 hasExplicitSchedule=true 时给出，否则为 null
    "type": "interval" | "daily" | "weekly",
    "intervalMinutes": number,    // type=interval 时给
    "timeOfDay": string,          // type=daily|weekly 时给，格式"HH:MM"
    "dayOfWeek": number           // type=weekly 时给，0=周日…6=周六
  } | null,
  "reasoning": string             // 一句话解释为什么这么判断（不超过 30 字）
}

判断规则：
- "每隔 X 分钟/小时帮我…"、"每天 8 点…"、"每周一…" → isAutomation=true, hasExplicitSchedule=true, 高置信度
- "以后定期帮我看看…"、"持续关注…"、"周期性地…" → isAutomation=true, hasExplicitSchedule=false, 中高置信度
- "帮我看一下…"、"现在告诉我…"（一次性请求）→ isAutomation=false, confidence<0.3
- "每次打开 X 时…"、"每个人都…"（"每"作非时间用法）→ isAutomation=false

只返回 JSON 对象，不要任何额外文字、不要 markdown 代码块。`

export interface DetectAutomationIntentInput {
  sessionId: string
  userMessage: string
  workspaceId?: string
  conversationChannelId: string
  conversationModelId?: string
}

export type IntentResult =
  | { kind: 'draft_created'; automation: Automation }
  | { kind: 'pending_schedule'; suggestion: AutomationIntentSuggestion }

interface ModelResponse {
  isAutomation: boolean
  confidence: number
  hasExplicitSchedule: boolean
  suggestedName: string
  suggestedPrompt: string
  suggestedSchedule: {
    type: 'interval' | 'daily' | 'weekly'
    intervalMinutes?: number
    timeOfDay?: string
    dayOfWeek?: number
  } | null
  reasoning?: string
}

/**
 * 顶层入口：判断用户消息是否含定时任务意图。
 * 任何失败路径都 return null，调用方（orchestrator）不需要 try/catch。
 */
export async function detectAutomationIntent(input: DetectAutomationIntentInput): Promise<IntentResult | null> {
  const { userMessage } = input

  // 1. 关键词预过滤
  if (!containsAutomationKeyword(userMessage)) return null

  // 2. 运行判断链：DeepSeek → Anthropic → 关键词启发式
  const parsed = await runJudgmentChain(userMessage)
  if (!parsed) return null

  console.log('[意图判断] 模型/启发式返回:', {
    isAutomation: parsed.isAutomation,
    confidence: parsed.confidence,
    hasExplicitSchedule: parsed.hasExplicitSchedule,
  })

  if (!parsed.isAutomation || parsed.confidence < HIGH_CONFIDENCE_THRESHOLD) {
    return null
  }

  // 3. 分流：明确频率 → 直接落库；频率不明 → 返建议
  if (parsed.hasExplicitSchedule && parsed.suggestedSchedule) {
    try {
      const automation = createAutomation({
        name: parsed.suggestedName || '未命名任务',
        prompt: parsed.suggestedPrompt || userMessage,
        scheduleType: parsed.suggestedSchedule.type,
        intervalMinutes: parsed.suggestedSchedule.intervalMinutes ?? 10,
        timeOfDay: parsed.suggestedSchedule.timeOfDay,
        dayOfWeek: parsed.suggestedSchedule.dayOfWeek,
        channelId: input.conversationChannelId,
        modelId: input.conversationModelId,
        workspaceId: input.workspaceId,
        sourceSessionId: input.sessionId,
        active: false,
        permissionMode: 'bypassPermissions',
      })
      console.log('[意图判断] 已创建草稿:', { id: automation.id, name: automation.name })
      return { kind: 'draft_created', automation }
    } catch (err) {
      console.warn('[意图判断] 草稿创建失败:', err)
      return null
    }
  }

  return {
    kind: 'pending_schedule',
    suggestion: {
      name: parsed.suggestedName || '未命名任务',
      prompt: parsed.suggestedPrompt || userMessage,
      reasoning: parsed.reasoning,
    },
  }
}

// ===== 判断链 =====

async function runJudgmentChain(userMessage: string): Promise<ModelResponse | null> {
  const channels = listChannels()

  // 优先 DeepSeek
  const deepseekChannel = channels.find(
    (c) => c.enabled && (c.provider === 'deepseek' || c.baseUrl.includes('api.deepseek.com')),
  )
  if (deepseekChannel) {
    console.log('[意图判断] 尝试 DeepSeek 判断')
    const result = await tryDeepSeek(deepseekChannel, userMessage)
    if (result) return result
    console.log('[意图判断] DeepSeek 失败，继续 fallback')
  }

  // 次选 Anthropic
  const anthropicChannel = channels.find(
    (c) => c.enabled && c.provider === 'anthropic',
  )
  if (anthropicChannel) {
    console.log('[意图判断] 尝试 Anthropic 判断')
    const result = await tryAnthropic(anthropicChannel, userMessage)
    if (result) return result
    console.log('[意图判断] Anthropic 失败，继续 fallback')
  }

  // 兜底：纯关键词启发式
  console.log('[意图判断] 无可用 LLM 渠道，使用关键词启发式')
  return heuristicJudgment(userMessage)
}

async function tryDeepSeek(channel: Channel, userMessage: string): Promise<ModelResponse | null> {
  const apiKey = safeDecrypt(channel.id)
  if (!apiKey) return null

  const json = await fetchOpenAICompatJson({
    baseUrl: channel.baseUrl,
    apiKey,
    modelId: DEEPSEEK_MODEL_ID,
    systemPrompt: INTENT_SYSTEM_PROMPT,
    userMessage,
  })
  return json ? validateResponse(json) : null
}

async function tryAnthropic(channel: Channel, userMessage: string): Promise<ModelResponse | null> {
  const apiKey = safeDecrypt(channel.id)
  if (!apiKey) return null

  const json = await fetchAnthropicJson({
    baseUrl: channel.baseUrl,
    apiKey,
    modelId: CLAUDE_MODEL_ID,
    systemPrompt: INTENT_SYSTEM_PROMPT,
    userMessage,
  })
  return json ? validateResponse(json) : null
}

function safeDecrypt(channelId: string): string | null {
  try {
    const key = decryptApiKey(channelId)
    return key || null
  } catch (err) {
    console.warn('[意图判断] API Key 解密失败:', err)
    return null
  }
}

// ===== HTTP 客户端 =====

interface FetchJsonInput {
  baseUrl: string
  apiKey: string
  modelId: string
  systemPrompt: string
  userMessage: string
}

/**
 * OpenAI 兼容 chat/completions 调用（DeepSeek、OpenAI、智谱等）。
 * 强制 response_format=json_object，返回 message.content 中 JSON 解析后的对象。
 */
async function fetchOpenAICompatJson(input: FetchJsonInput): Promise<unknown | null> {
  const url = `${input.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body = JSON.stringify({
    model: input.modelId,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    stream: false,
  })

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body,
  })
  if (!response) return null

  try {
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content)
  } catch (err) {
    console.warn('[意图判断] OpenAI 响应解析失败:', err)
    return null
  }
}

/**
 * Anthropic Messages API 调用。
 * Anthropic 没有 response_format，靠 system prompt 引导 JSON；
 * 取第一个 text block 后再 JSON.parse（清洗常见前后 ```json 包裹）。
 */
async function fetchAnthropicJson(input: FetchJsonInput): Promise<unknown | null> {
  const url = `${input.baseUrl.replace(/\/+$/, '')}/messages`
  const body = JSON.stringify({
    model: input.modelId,
    max_tokens: 512,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userMessage }],
    temperature: 0.2,
    thinking: { type: 'disabled' },
  })

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  })
  if (!response) return null

  try {
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    const textBlock = data.content?.find((b) => b.type === 'text')
    const raw = textBlock?.text
    if (!raw) return null
    // 兼容 ```json … ``` 包裹
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.warn('[意图判断] Anthropic 响应解析失败:', err)
    return null
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl ?? undefined)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetchFn(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      console.warn('[意图判断] HTTP 失败:', response.status, await response.text().catch(() => ''))
      return null
    }
    return response
  } catch (err) {
    console.warn('[意图判断] 调用异常:', err)
    return null
  }
}

// ===== 启发式 fallback =====

/**
 * 没有任何 LLM 渠道时的纯本地启发式判断。
 * 保守策略：只对**明确表达**的频率给出高置信度，否则降级为 pending_schedule 或返 null。
 * 优点：零成本零延迟，离线可用。
 * 缺点：表达稍微复杂就识别不出来（如「以后每隔半小时」）。
 */
function heuristicJudgment(userMessage: string): ModelResponse | null {
  const text = userMessage.trim()

  // 1) 尝试匹配明确的 interval / daily / weekly 表达
  const schedule = extractScheduleFromText(text)
  if (schedule) {
    const cleanedPrompt = stripScheduleWords(text)
    const name = derivePromptName(cleanedPrompt) || '定时任务'
    return {
      isAutomation: true,
      confidence: 0.85,
      hasExplicitSchedule: true,
      suggestedName: name,
      suggestedPrompt: cleanedPrompt || text,
      suggestedSchedule: schedule,
      reasoning: '启发式：识别到明确频率表达',
    }
  }

  // 2) 否则只要 pre-filter 关键词命中、且整句不显式表示"一次性"，就给个 pending_schedule
  const isOneShot = /^(?:帮我|请|麻烦|可以|能不能)?\s*(?:现在|马上|立刻|这次|这一次|刚刚|刚才)/.test(text)
  if (!isOneShot) {
    const cleanedPrompt = stripScheduleWords(text)
    return {
      isAutomation: true,
      confidence: 0.85,
      hasExplicitSchedule: false,
      suggestedName: derivePromptName(cleanedPrompt) || '定时任务',
      suggestedPrompt: cleanedPrompt || text,
      suggestedSchedule: null,
      reasoning: '启发式：含周期关键词',
    }
  }

  return null
}

/** 从文本中尝试提取明确的调度参数 */
function extractScheduleFromText(text: string): ModelResponse['suggestedSchedule'] {
  // 中文数字 → 阿拉伯
  const normalized = normalizeChineseDigits(text)

  // 每 N 分钟 / 每 N 小时 / 每 N 天
  const interval = normalized.match(/每\s*[一]?\s*(\d+)\s*(分钟|分|小时|时|天|秒)/)
  if (interval) {
    const n = Number(interval[1])
    const unit = interval[2]
    if (n > 0) {
      if (unit === '秒') return { type: 'interval', intervalMinutes: Math.max(1, Math.round(n / 60)) }
      if (unit === '分钟' || unit === '分') return { type: 'interval', intervalMinutes: n }
      if (unit === '小时' || unit === '时') return { type: 'interval', intervalMinutes: n * 60 }
      if (unit === '天') return { type: 'interval', intervalMinutes: n * 60 * 24 }
    }
  }

  // 每分钟 / 每小时 / 每天（不带数字 = 1 单位）
  if (/每\s*[一]?\s*分钟/.test(normalized)) return { type: 'interval', intervalMinutes: 1 }
  if (/每\s*[一]?\s*小时/.test(normalized)) return { type: 'interval', intervalMinutes: 60 }

  // 每天 X:YY
  const dailyTime = normalized.match(/每天\s*(?:上午|下午|晚上|早上|早晨)?\s*(\d{1,2})(?:[:点]\s*(\d{1,2})?)?/)
  if (dailyTime) {
    const hour = Math.max(0, Math.min(23, Number(dailyTime[1])))
    const min = dailyTime[2] ? Math.max(0, Math.min(59, Number(dailyTime[2]))) : 0
    return { type: 'daily', timeOfDay: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` }
  }
  // 单纯 "每天" → 默认早 9 点
  if (/每天/.test(normalized)) return { type: 'daily', timeOfDay: '09:00' }

  // 每周 X
  const weekdayMap: Record<string, number> = {
    周日: 0, 周天: 0, 星期日: 0, 星期天: 0,
    周一: 1, 星期一: 1,
    周二: 2, 星期二: 2,
    周三: 3, 星期三: 3,
    周四: 4, 星期四: 4,
    周五: 5, 星期五: 5,
    周六: 6, 星期六: 6,
  }
  for (const [key, dow] of Object.entries(weekdayMap)) {
    if (normalized.includes(`每${key}`) || normalized.includes(key)) {
      // 进一步看时间
      const m = normalized.match(/(\d{1,2})(?:[:点]\s*(\d{1,2})?)?/)
      const hour = m ? Math.max(0, Math.min(23, Number(m[1]))) : 9
      const min = m && m[2] ? Math.max(0, Math.min(59, Number(m[2]))) : 0
      return { type: 'weekly', dayOfWeek: dow, timeOfDay: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` }
    }
  }

  return null
}

/** 把"一二三四五六七八九十"等转换为对应阿拉伯数字（仅处理 1-99 的常见场景） */
function normalizeChineseDigits(text: string): string {
  const map: Record<string, string> = {
    一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5',
    六: '6', 七: '7', 八: '8', 九: '9', 十: '10',
  }
  // "十X" → 1X，"X十" → X0，"X十Y" → XY
  let s = text
    .replace(/十(\d)/g, '1$1')
    .replace(/(\d)十(\d)/g, '$1$2')
    .replace(/(\d)十/g, '$10')
  // 单字符替换
  for (const [zh, ar] of Object.entries(map)) s = s.replaceAll(zh, ar)
  return s
}

/** 去掉句子中"每 N 分钟/每天/以后每…"等调度词，只留任务本体 */
function stripScheduleWords(text: string): string {
  return text
    .replace(/(?:以后|今后|从现在起)\s*/g, '')
    .replace(/每\s*[一]?\s*\d*\s*(?:分钟|分|小时|时|天|秒|周|月)/g, '')
    .replace(/每\s*(?:周[日一二三四五六天]|星期[日一二三四五六天])/g, '')
    .replace(/定期|周期性?|一直|持续|长期/g, '')
    .replace(/^[，,。.、:：\s]+|[，,。.、:：\s]+$/g, '')
    .trim()
}

/** 从 prompt 提取一个短任务名（取前 12 字） */
function derivePromptName(prompt: string): string {
  if (!prompt) return ''
  const cleaned = prompt
    .replace(/^(?:请|帮我|麻烦|可以|能不能|能否)?\s*/g, '')
    .replace(/(?:建立|创建|设置|做|弄)\s*(?:一个|个)?\s*/g, '')
    .replace(/定时任务|自动任务|自动化任务/g, '')
    .replace(/[，,。.、:：!！?？\s]+/g, '')
    .trim()
  if (!cleaned) return ''
  return cleaned.slice(0, 12)
}

// ===== 响应校验 =====

function validateResponse(raw: unknown): ModelResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.isAutomation !== 'boolean') return null
  if (typeof r.confidence !== 'number') return null
  if (typeof r.hasExplicitSchedule !== 'boolean') return null
  if (typeof r.suggestedName !== 'string') return null
  if (typeof r.suggestedPrompt !== 'string') return null

  let suggestedSchedule: ModelResponse['suggestedSchedule'] = null
  if (r.suggestedSchedule && typeof r.suggestedSchedule === 'object') {
    const s = r.suggestedSchedule as Record<string, unknown>
    if (s.type === 'interval' || s.type === 'daily' || s.type === 'weekly') {
      suggestedSchedule = {
        type: s.type,
        intervalMinutes: typeof s.intervalMinutes === 'number' ? s.intervalMinutes : undefined,
        timeOfDay: typeof s.timeOfDay === 'string' ? s.timeOfDay : undefined,
        dayOfWeek: typeof s.dayOfWeek === 'number' ? s.dayOfWeek : undefined,
      }
    }
  }

  return {
    isAutomation: r.isAutomation,
    confidence: r.confidence,
    hasExplicitSchedule: r.hasExplicitSchedule,
    suggestedName: r.suggestedName,
    suggestedPrompt: r.suggestedPrompt,
    suggestedSchedule,
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
  }
}
