/**
 * Usage Atoms - 用量统计状态
 *
 * 管理用量统计数据的加载和缓存。
 */

import { atom } from 'jotai'
import type { UsageSummary } from '@proma/shared'

/** 用量汇总数据 */
export const usageSummaryAtom = atom<UsageSummary | null>(null)

/** 用量数据加载状态 */
export const usageLoadingAtom = atom<boolean>(false)
