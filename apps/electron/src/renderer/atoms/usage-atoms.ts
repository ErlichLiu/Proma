/**
 * Usage Statistics 状态管理
 *
 * 使用 Jotai 管理使用统计相关的状态。
 */

import { atom } from 'jotai'
import type { UsageStats, UsageSettings } from '@proma/shared'

/** 使用量统计数据 */
export const usageStatsAtom = atom<UsageStats | null>(null)

/** 加载状态 */
export const usageLoadingAtom = atom<boolean>(false)

/** 错误信息 */
export const usageErrorAtom = atom<string | null>(null)

/** 时间范围（天数） */
export const usageTimeRangeAtom = atom<number>(30)

/** 使用统计设置 */
export const usageSettingsAtom = atom<UsageSettings>({ pricing: [] })

/** 加载使用统计 */
export const loadUsageStatsAtom = atom(
  null,
  async (get, set, days: number = 30) => {
    set(usageLoadingAtom, true)
    set(usageErrorAtom, null)

    try {
      const stats = await window.electronAPI.getUsageStats(days)
      set(usageStatsAtom, stats)
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载使用统计失败'
      set(usageErrorAtom, message)
      console.error('[使用统计] 加载失败:', error)
    } finally {
      set(usageLoadingAtom, false)
    }
  },
)

/** 加载使用统计设置 */
export const loadUsageSettingsAtom = atom(
  null,
  async (_get, set) => {
    try {
      const settings = await window.electronAPI.getUsageSettings()
      set(usageSettingsAtom, settings)
    } catch (error) {
      console.error('[使用统计] 加载设置失败:', error)
    }
  },
)

/** 更新使用统计设置 */
export const updateUsageSettingsAtom = atom(
  null,
  async (_get, set, settings: UsageSettings) => {
    try {
      const updated = await window.electronAPI.updateUsageSettings(settings)
      set(usageSettingsAtom, updated)
      return updated
    } catch (error) {
      console.error('[使用统计] 更新设置失败:', error)
      throw error
    }
  },
)

/** 格式化 Token 数量（转换为 K/M） */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

/** 格式化成本（USD） */
export function formatCost(cost: number): string {
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`
  }
  return `$${cost.toFixed(4)}`
}

/** 格式化日期 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}
