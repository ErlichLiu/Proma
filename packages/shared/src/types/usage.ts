/**
 * 用量统计相关类型定义
 *
 * 包含用量记录、查询参数、汇总结果等类型，
 * 以及用量统计模块的 IPC 通道常量。
 */

import type { ProviderType } from './channel'

// ===== 用量记录 =====

/** 单次 API 调用的 Token 用量记录 */
export interface UsageRecord {
  /** 记录唯一标识 */
  id: string
  /** 时间戳 */
  timestamp: number
  /** 渠道 ID */
  channelId: string
  /** 供应商类型 */
  provider: ProviderType
  /** 模型 ID */
  modelId: string
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** 来源模式 */
  mode: 'chat' | 'agent'
}

// ===== 查询参数 =====

/** 用量查询时间范围 */
export interface UsageQueryRange {
  /** 起始时间戳 */
  from: number
  /** 结束时间戳 */
  to: number
}

// ===== 汇总结果 =====

/** 每日用量汇总 */
export interface DailyUsage {
  /** 日期字符串 (YYYY-MM-DD) */
  date: string
  /** 当日输入 token 总数 */
  inputTokens: number
  /** 当日输出 token 总数 */
  outputTokens: number
  /** 当日请求次数 */
  requestCount: number
}

/** 按模型汇总的用量 */
export interface ModelUsage {
  /** 模型 ID */
  modelId: string
  /** 供应商类型 */
  provider: ProviderType
  /** 输入 token 总数 */
  inputTokens: number
  /** 输出 token 总数 */
  outputTokens: number
  /** 请求次数 */
  requestCount: number
}

/** 用量统计汇总 */
export interface UsageSummary {
  /** 查询范围内的每日用量 */
  daily: DailyUsage[]
  /** 按模型汇总 */
  byModel: ModelUsage[]
  /** 总输入 token */
  totalInputTokens: number
  /** 总输出 token */
  totalOutputTokens: number
  /** 总请求次数 */
  totalRequests: number
}

// ===== IPC 通道常量 =====

/** 用量统计 IPC 通道 */
export const USAGE_IPC_CHANNELS = {
  /** 记录一条用量（主进程内部调用，不暴露给渲染进程） */
  RECORD: 'usage:record',
  /** 查询用量汇总 */
  GET_SUMMARY: 'usage:get-summary',
  /** 清除用量记录 */
  CLEAR: 'usage:clear',
} as const
