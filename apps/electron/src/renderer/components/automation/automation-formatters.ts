/**
 * 定时任务（Automation）相关的纯展示格式化函数。
 *
 * - formatSchedule：把调度配置（interval / daily / weekly）格式化成可读文案
 * - formatNextRunAt：把下次运行时间格式化为相对/绝对时间（"3 分钟后"、"明天 09:00"）
 */

import type { Automation } from '@proma/shared'

/** 整数原样输出，非整数保留 1 位小数，避免显示形如 "1.0416666..." 的长串。 */
function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** 把调度配置格式化为可读文案。 */
export function formatSchedule(a: Automation): string {
  if (a.scheduleType === 'daily') return `每天 ${a.timeOfDay ?? '09:00'}`
  if (a.scheduleType === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每${names[a.dayOfWeek ?? 1]} ${a.timeOfDay ?? '09:00'}`
  }
  const min = a.intervalMinutes
  if (min < 60) return `每 ${min} 分钟`
  if (min < 1440) return `每 ${formatDecimal(min / 60)} 小时`
  return `每 ${formatDecimal(min / 1440)} 天`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 把下次运行时间格式化为人类可读字符串。
 * - 已过期 / < 1 分钟 → "马上"
 * - < 1 小时 → "N 分钟后"
 * - 同一天 → "今天 HH:MM"
 * - 明天 → "明天 HH:MM"
 * - 否则 → "MM-DD HH:MM"
 */
export function formatNextRunAt(nextRunAt: number, now: number): string {
  const diff = nextRunAt - now
  if (diff <= 60_000) return '马上'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟后`

  const target = new Date(nextRunAt)
  const today = new Date(now)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const tomorrowStart = todayStart + 86_400_000
  const dayAfterStart = tomorrowStart + 86_400_000

  const hhmm = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`
  if (nextRunAt < tomorrowStart) return `今天 ${hhmm}`
  if (nextRunAt < dayAfterStart) return `明天 ${hhmm}`
  return `${pad2(target.getMonth() + 1)}-${pad2(target.getDate())} ${hhmm}`
}
