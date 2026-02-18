/**
 * 使用量统计服务
 *
 * 负责聚合和查询 Chat 和 Agent 模式的使用量数据，
 * 提供统计总览、每日分布、模型分布等功能。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import {
  getConfigDir,
  getConversationsIndexPath,
  getConversationMessagesPath,
  getAgentSessionsIndexPath,
  getAgentSessionMessagesPath,
} from './config-paths'
import type {
  UsageStats,
  DailyUsage,
  ModelUsage,
  ConversationUsage,
  ModelPricing,
  UsageSettings,
  ChatMessage,
  ConversationMeta,
  AgentSessionMeta,
  AgentMessage,
  AgentEvent,
  TokenUsage,
} from '@proma/shared'
import { listConversations, getConversationMessages } from './conversation-manager'
import { listAgentSessions, getAgentSessionMessages } from './agent-session-manager'

/** 使用统计设置文件路径 */
function getUsageSettingsPath(): string {
  return `${getConfigDir()}/usage-settings.json`
}

/** 内置默认定价（基于 2024 年主流供应商价格） */
const DEFAULT_PRICING: ModelPricing[] = [
  // Anthropic Claude 模型
  { modelId: 'claude-3-5-sonnet', promptPricePer1k: 0.003, completionPricePer1k: 0.015 },
  { modelId: 'claude-3-5-haiku', promptPricePer1k: 0.0008, completionPricePer1k: 0.004 },
  { modelId: 'claude-3-opus', promptPricePer1k: 0.015, completionPricePer1k: 0.075 },
  { modelId: 'claude-3-sonnet', promptPricePer1k: 0.003, completionPricePer1k: 0.015 },
  { modelId: 'claude-3-haiku', promptPricePer1k: 0.00025, completionPricePer1k: 0.00125 },

  // OpenAI 模型
  { modelId: 'gpt-4o', promptPricePer1k: 0.005, completionPricePer1k: 0.015 },
  { modelId: 'gpt-4o-mini', promptPricePer1k: 0.00015, completionPricePer1k: 0.0006 },
  { modelId: 'gpt-4-turbo', promptPricePer1k: 0.01, completionPricePer1k: 0.03 },
  { modelId: 'gpt-4', promptPricePer1k: 0.03, completionPricePer1k: 0.06 },
  { modelId: 'gpt-3.5-turbo', promptPricePer1k: 0.0005, completionPricePer1k: 0.0015 },

  // Google Gemini 模型
  { modelId: 'gemini-1.5-pro', promptPricePer1k: 0.0035, completionPricePer1k: 0.0105 },
  { modelId: 'gemini-1.5-flash', promptPricePer1k: 0.00035, completionPricePer1k: 0.00105 },
  { modelId: 'gemini-2.5-pro', promptPricePer1k: 0.0035, completionPricePer1k: 0.0105 },
  { modelId: 'gemini-2.5-flash', promptPricePer1k: 0.00035, completionPricePer1k: 0.00105 },

  // DeepSeek 模型
  { modelId: 'deepseek-chat', promptPricePer1k: 0.00027, completionPricePer1k: 0.0011 },
  { modelId: 'deepseek-reasoner', promptPricePer1k: 0.00055, completionPricePer1k: 0.00219 },
]

/** 获取使用统计设置 */
export function getUsageSettings(): UsageSettings {
  const filePath = getUsageSettingsPath()

  if (!existsSync(filePath)) {
    return { pricing: [] }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Partial<UsageSettings>
    return {
      pricing: data.pricing || [],
    }
  } catch (error) {
    console.error('[使用统计] 读取设置失败:', error)
    return { pricing: [] }
  }
}

/** 更新使用统计设置 */
export function updateUsageSettings(settings: UsageSettings): UsageSettings {
  const filePath = getUsageSettingsPath()

  try {
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    console.log('[使用统计] 设置已更新')
  } catch (error) {
    console.error('[使用统计] 写入设置失败:', error)
    throw new Error('写入使用统计设置失败')
  }

  return settings
}

/** 根据模型 ID 查找定价（支持前缀匹配） */
function findPricing(modelId: string): ModelPricing | undefined {
  const settings = getUsageSettings()

  // 优先使用用户自定义定价
  const customPricing = settings.pricing.find((p) =>
    modelId.toLowerCase().includes(p.modelId.toLowerCase()),
  )
  if (customPricing) return customPricing

  // 使用内置默认定价（前缀匹配）
  return DEFAULT_PRICING.find((p) =>
    modelId.toLowerCase().includes(p.modelId.toLowerCase()),
  )
}

/** 计算 Token 使用量的预估成本（USD） */
function calculateCost(tokens: TokenUsage, modelId: string): number {
  const pricing = findPricing(modelId)
  if (!pricing) return 0

  const promptCost = (tokens.promptTokens / 1000) * pricing.promptPricePer1k
  const completionCost = (tokens.completionTokens / 1000) * pricing.completionPricePer1k

  return promptCost + completionCost
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const isoString = date.toISOString()
  const datePart = isoString.split('T')[0]
  return datePart ?? isoString
}

/** 获取日期范围的起始时间戳 */
function getStartTimestamp(days: number): number {
  const now = new Date()
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

/** 从 Chat 消息中提取使用量统计 */
function extractChatUsage(messages: ChatMessage[]): {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  modelId: string
} {
  let totalTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  let modelId = ''

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.usage) {
      totalTokens += msg.usage.totalTokens
      promptTokens += msg.usage.promptTokens
      completionTokens += msg.usage.completionTokens
      if (msg.model) {
        modelId = msg.model
      }
    }
  }

  return { totalTokens, promptTokens, completionTokens, modelId }
}

/** 从 Agent 事件中提取使用量统计 */
function extractAgentUsage(messages: AgentMessage[]): {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  modelId: string
} {
  let totalTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  let modelId = ''

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.events) {
      for (const event of msg.events) {
        if (event.type === 'complete' && event.usage) {
          promptTokens += event.usage.inputTokens
          completionTokens += event.usage.outputTokens || 0
          totalTokens += event.usage.inputTokens + (event.usage.outputTokens || 0)
        }
        if (event.type === 'usage_update') {
          promptTokens += event.usage.inputTokens
          totalTokens += event.usage.inputTokens
        }
      }
    }
  }

  return { totalTokens, promptTokens, completionTokens, modelId }
}

/** 获取使用量统计总览 */
export async function getUsageStats(days: number = 30): Promise<UsageStats> {
  const startTimestamp = getStartTimestamp(days)

  // 获取所有对话和会话
  const conversations = listConversations()
  const sessions = listAgentSessions()


  // 初始化统计数据
  let totalConversations = 0
  let totalMessages = 0
  let totalTokens = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let estimatedCost = 0

  // 按日期聚合
  const dailyMap = new Map<string, DailyUsage>()

  // 按模型聚合
  const modelMap = new Map<string, ModelUsage>()

  // 最近对话列表
  const recentConversations: ConversationUsage[] = []

  // 处理 Chat 对话
  let processedChatConvs = 0
  for (const conv of conversations) {
    if (conv.createdAt < startTimestamp) continue

    const messages = getConversationMessages(conv.id)
    const usage = extractChatUsage(messages)


    if (usage.totalTokens === 0) continue
    processedChatConvs++

    totalConversations++
    totalMessages += messages.length
    totalTokens += usage.totalTokens
    totalPromptTokens += usage.promptTokens
    totalCompletionTokens += usage.completionTokens

    const modelId = usage.modelId || conv.modelId || 'unknown'
    const cost = calculateCost(
      {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
      modelId,
    )
    estimatedCost += cost

    // 按日期聚合
    const date = formatDate(conv.createdAt)
    const existing = dailyMap.get(date)
    if (existing) {
      existing.totalTokens += usage.totalTokens
      existing.promptTokens += usage.promptTokens
      existing.completionTokens += usage.completionTokens
      existing.conversationCount++
      existing.messageCount += messages.length
      existing.estimatedCost += cost
    } else {
      dailyMap.set(date, {
        date,
        totalTokens: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        conversationCount: 1,
        messageCount: messages.length,
        estimatedCost: cost,
      })
    }

    // 按模型聚合
    const model = modelMap.get(modelId)
    if (model) {
      model.totalTokens += usage.totalTokens
      model.promptTokens += usage.promptTokens
      model.completionTokens += usage.completionTokens
      model.conversationCount++
      model.estimatedCost += cost
    } else {
      modelMap.set(modelId, {
        modelId,
        totalTokens: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        conversationCount: 1,
        estimatedCost: cost,
      })
    }

    // 添加到最近对话列表
    recentConversations.push({
      conversationId: conv.id,
      title: conv.title,
      modelId: modelId || conv.modelId || 'unknown',
      channelId: conv.channelId || '',
      createdAt: conv.createdAt,
      messageCount: messages.length,
      totalTokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      mode: 'chat',
    })
  }

  // 处理 Agent 会话
  for (const session of sessions) {
    if (session.createdAt < startTimestamp) continue

    const messages = getAgentSessionMessages(session.id)
    const usage = extractAgentUsage(messages)

    if (usage.totalTokens === 0) continue

    totalConversations++
    totalMessages += messages.length
    totalTokens += usage.totalTokens
    totalPromptTokens += usage.promptTokens
    totalCompletionTokens += usage.completionTokens

    const modelId = usage.modelId || 'unknown'
    const cost = calculateCost(
      {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
      modelId,
    )
    estimatedCost += cost

    // 按日期聚合
    const date = formatDate(session.createdAt)
    const existing = dailyMap.get(date)
    if (existing) {
      existing.totalTokens += usage.totalTokens
      existing.promptTokens += usage.promptTokens
      existing.completionTokens += usage.completionTokens
      existing.conversationCount++
      existing.messageCount += messages.length
      existing.estimatedCost += cost
    } else {
      dailyMap.set(date, {
        date,
        totalTokens: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        conversationCount: 1,
        messageCount: messages.length,
        estimatedCost: cost,
      })
    }

    // 按模型聚合
    const model = modelMap.get(modelId)
    if (model) {
      model.totalTokens += usage.totalTokens
      model.promptTokens += usage.promptTokens
      model.completionTokens += usage.completionTokens
      model.conversationCount++
      model.estimatedCost += cost
    } else {
      modelMap.set(modelId, {
        modelId,
        totalTokens: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        conversationCount: 1,
        estimatedCost: cost,
      })
    }

    // 添加到最近对话列表
    recentConversations.push({
      conversationId: session.id,
      title: session.title,
      modelId: modelId || 'unknown',
      channelId: session.channelId || '',
      createdAt: session.createdAt,
      messageCount: messages.length,
      totalTokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      mode: 'agent',
    })
  }

  // 按日期排序（从近到远）
  const dailyUsage = Array.from(dailyMap.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  // 按 Token 数量排序（从多到少）
  const modelUsage = Array.from(modelMap.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens,
  )

  // 按创建时间排序（从近到远）
  recentConversations.sort((a, b) => b.createdAt - a.createdAt)

  return {
    totalConversations,
    totalMessages,
    totalTokens,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    estimatedCost,
    dailyUsage,
    modelUsage,
    recentConversations: recentConversations.slice(0, 20), // 只返回最近 20 条
  }
}

/** 获取指定对话的使用量详情 */
export function getConversationUsage(conversationId: string): ConversationUsage | null {
  // 先尝试从 Chat 对话中查找
  const conversations = listConversations()
  const conv = conversations.find((c) => c.id === conversationId)

  if (conv) {
    const messages = getConversationMessages(conv.id)
    const usage = extractChatUsage(messages)

    if (usage.totalTokens === 0) return null

    return {
      conversationId: conv.id,
      title: conv.title,
      modelId: usage.modelId || conv.modelId || 'unknown',
      channelId: conv.channelId || '',
      createdAt: conv.createdAt,
      messageCount: messages.length,
      totalTokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      mode: 'chat',
    }
  }

  // 再尝试从 Agent 会话中查找
  const sessions = listAgentSessions()
  const session = sessions.find((s) => s.id === conversationId)

  if (session) {
    const messages = getAgentSessionMessages(session.id)
    const usage = extractAgentUsage(messages)

    if (usage.totalTokens === 0) return null

    return {
      conversationId: session.id,
      title: session.title,
      modelId: usage.modelId || 'unknown',
      channelId: session.channelId || '',
      createdAt: session.createdAt,
      messageCount: messages.length,
      totalTokens: usage.totalTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      mode: 'agent',
    }
  }

  return null
}

/** 获取默认定价列表 */
export function getDefaultPricing(): ModelPricing[] {
  return [...DEFAULT_PRICING]
}
