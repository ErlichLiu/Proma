/**
 * 用量统计服务
 *
 * 管理 Token 用量记录的读写和聚合查询。
 * 数据存储在 ~/.proma/usage-stats.json，JSON 格式。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { ProviderType, UsageRecord, UsageQueryRange, UsageSummary, DailyUsage, ModelUsage } from '@proma/shared'
import { getUsageStatsPath } from './config-paths'

// ===== 存储结构 =====

/** 用量统计文件结构 */
interface UsageStatsFile {
  version: number
  records: UsageRecord[]
}

/** 默认空数据 */
const DEFAULT_STATS: UsageStatsFile = {
  version: 1,
  records: [],
}

// ===== 读写操作 =====

/** 读取用量统计文件 */
function readStats(): UsageStatsFile {
  const filePath = getUsageStatsPath()

  if (!existsSync(filePath)) {
    return { ...DEFAULT_STATS, records: [] }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Partial<UsageStatsFile>
    return {
      version: data.version ?? 1,
      records: data.records ?? [],
    }
  } catch (error) {
    console.warn('[用量统计] 读取失败，使用默认值:', error)
    return { ...DEFAULT_STATS, records: [] }
  }
}

/** 写入用量统计文件 */
function writeStats(stats: UsageStatsFile): void {
  const filePath = getUsageStatsPath()
  writeFileSync(filePath, JSON.stringify(stats, null, 2), 'utf-8')
}

// ===== 公开 API =====

/**
 * 记录一条 Token 用量
 */
export function recordUsage(input: {
  channelId: string
  provider: ProviderType
  modelId: string
  inputTokens: number
  outputTokens: number
  mode: 'chat' | 'agent'
}): void {
  const stats = readStats()

  const record: UsageRecord = {
    id: randomUUID(),
    timestamp: Date.now(),
    channelId: input.channelId,
    provider: input.provider,
    modelId: input.modelId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    mode: input.mode,
  }

  stats.records.push(record)
  writeStats(stats)
}

/**
 * 查询用量汇总
 *
 * @param range 时间范围（可选，默认最近 30 天）
 */
export function getUsageSummary(range?: UsageQueryRange): UsageSummary {
  const stats = readStats()

  // 默认最近 30 天
  const now = Date.now()
  const from = range?.from ?? now - 30 * 24 * 60 * 60 * 1000
  const to = range?.to ?? now

  // 过滤范围内的记录
  const filtered = stats.records.filter(
    (r) => r.timestamp >= from && r.timestamp <= to
  )

  // 按日期聚合
  const dailyMap = new Map<string, DailyUsage>()
  for (const r of filtered) {
    const date = new Date(r.timestamp).toISOString().slice(0, 10)
    const existing = dailyMap.get(date)
    if (existing) {
      existing.inputTokens += r.inputTokens
      existing.outputTokens += r.outputTokens
      existing.requestCount += 1
    } else {
      dailyMap.set(date, {
        date,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        requestCount: 1,
      })
    }
  }

  // 按模型聚合
  const modelMap = new Map<string, ModelUsage>()
  for (const r of filtered) {
    const key = `${r.provider}:${r.modelId}`
    const existing = modelMap.get(key)
    if (existing) {
      existing.inputTokens += r.inputTokens
      existing.outputTokens += r.outputTokens
      existing.requestCount += 1
    } else {
      modelMap.set(key, {
        modelId: r.modelId,
        provider: r.provider,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        requestCount: 1,
      })
    }
  }

  // 每日数据按日期排序
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // 模型数据按总 token 降序
  const byModel = [...modelMap.values()].sort(
    (a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens)
  )

  // 总计
  let totalInputTokens = 0
  let totalOutputTokens = 0
  for (const r of filtered) {
    totalInputTokens += r.inputTokens
    totalOutputTokens += r.outputTokens
  }

  return {
    daily,
    byModel,
    totalInputTokens,
    totalOutputTokens,
    totalRequests: filtered.length,
  }
}

/**
 * 清除所有用量记录
 */
export function clearUsageStats(): void {
  writeStats({ ...DEFAULT_STATS, records: [] })
  console.log('[用量统计] 已清除所有记录')
}
