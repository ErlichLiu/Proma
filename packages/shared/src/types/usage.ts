/**
 * Usage Statistics 相关类型定义
 *
 * 包含 Token 使用量统计、成本估算、统计聚合等类型。
 */

// ===== Token 使用量 =====

// ===== 使用量统计 =====

/**
 * 单条对话的使用量统计
 */
export interface ConversationUsage {
  /** 对话 ID */
  conversationId: string
  /** 对话标题 */
  title: string
  /** 使用的模型 ID */
  modelId: string
  /** 使用的渠道 ID */
  channelId: string
  /** 对话创建时间 */
  createdAt: number
  /** 消息数量 */
  messageCount: number
  /** 总 Token 数量 */
  totalTokens: number
  /** 输入 Token 数量 */
  promptTokens: number
  /** 输出 Token 数量 */
  completionTokens: number
  /** 应用模式：chat 或 agent */
  mode: 'chat' | 'agent'
}

/**
 * 每日使用量统计
 */
export interface DailyUsage {
  /** 日期 (YYYY-MM-DD) */
  date: string
  /** 总 Token 数量 */
  totalTokens: number
  /** 输入 Token 数量 */
  promptTokens: number
  /** 输出 Token 数量 */
  completionTokens: number
  /** 对话数量 */
  conversationCount: number
  /** 消息数量 */
  messageCount: number
  /** 预估成本 (USD) */
  estimatedCost: number
}

/**
 * 模型使用量统计
 */
export interface ModelUsage {
  /** 模型 ID */
  modelId: string
  /** 总 Token 数量 */
  totalTokens: number
  /** 输入 Token 数量 */
  promptTokens: number
  /** 输出 Token 数量 */
  completionTokens: number
  /** 对话数量 */
  conversationCount: number
  /** 预估成本 (USD) */
  estimatedCost: number
}

/**
 * 使用量统计总览
 */
export interface UsageStats {
  /** 总对话数量 */
  totalConversations: number
  /** 总消息数量 */
  totalMessages: number
  /** 总 Token 数量 */
  totalTokens: number
  /** 输入 Token 数量 */
  promptTokens: number
  /** 输出 Token 数量 */
  completionTokens: number
  /** 预估总成本 (USD) */
  estimatedCost: number
  /** 每日使用量分布 */
  dailyUsage: DailyUsage[]
  /** 模型使用量分布 */
  modelUsage: ModelUsage[]
  /** 最近对话列表（含使用量） */
  recentConversations: ConversationUsage[]
}

// ===== 成本计算 =====

/**
 * 模型定价配置
 */
export interface ModelPricing {
  /** 模型 ID 或匹配模式（如 'claude-3-5-sonnet*'） */
  modelId: string
  /** 每 1K 输入 Token 的价格 (USD) */
  promptPricePer1k: number
  /** 每 1K 输出 Token 的价格 (USD) */
  completionPricePer1k: number
}

/**
 * 使用统计设置
 */
export interface UsageSettings {
  /** 用户自定义定价 */
  pricing: ModelPricing[]
}

/**
 * 使用统计 IPC 通道常量
 */
export const USAGE_IPC_CHANNELS = {
  /** 获取使用量统计 */
  GET_USAGE_STATS: 'usage:getStats',
  /** 获取对话使用量详情 */
  GET_CONVERSATION_USAGE: 'usage:getConversationUsage',
  /** 获取使用统计设置 */
  GET_USAGE_SETTINGS: 'usage:getSettings',
  /** 更新使用统计设置 */
  UPDATE_USAGE_SETTINGS: 'usage:updateSettings',
} as const
