/**
 * 定时任务（Automation）管理器
 *
 * 负责定时任务的 CRUD 与运行历史持久化。
 * - 索引文件：~/.proma/automations.json
 *
 * 照搬 agent-session-manager.ts 的原子写模式（safe-file）。
 * 调度逻辑见 automation-scheduler.ts，本文件只管数据。
 */

import { randomUUID } from 'node:crypto'
import { writeJsonFileAtomic, readJsonFileSafe } from './safe-file'
import { getAutomationsPath } from './config-paths'
import {
  AUTOMATION_MAX_HISTORY,
  AUTOMATION_DEFAULT_PERMISSION_MODE,
  type Automation,
  type AutomationRun,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from '@proma/shared'

/** 索引文件格式 */
interface AutomationsIndex {
  version: number
  automations: Automation[]
}

const INDEX_VERSION = 1

function readIndex(): AutomationsIndex {
  const data = readJsonFileSafe<AutomationsIndex>(getAutomationsPath())
  if (data) return data
  return { version: INDEX_VERSION, automations: [] }
}

function writeIndex(index: AutomationsIndex): void {
  try {
    writeJsonFileAtomic(getAutomationsPath(), index)
  } catch (error) {
    console.error('[定时任务] 写入索引文件失败:', error)
    throw new Error('写入定时任务索引失败')
  }
}

/**
 * 计算下次触发时间戳（从基准时刻 from 起算）
 * - interval：from + 间隔分钟
 * - daily：今天/明天的 timeOfDay
 * - weekly：本周/下周 dayOfWeek 的 timeOfDay
 */
export function computeNextRunAt(
  a: Pick<Automation, 'scheduleType' | 'intervalMinutes' | 'timeOfDay' | 'dayOfWeek'>,
  from: number = Date.now(),
): number {
  if (a.scheduleType === 'interval') {
    return from + Math.max(1, a.intervalMinutes) * 60_000
  }

  const [hh, mm] = (a.timeOfDay ?? '09:00').split(':').map(Number)
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(hh ?? 9, mm ?? 0, 0, 0)

  if (a.scheduleType === 'daily') {
    if (next.getTime() <= from) next.setDate(next.getDate() + 1)
    return next.getTime()
  }

  // weekly
  const targetDow = a.dayOfWeek ?? 1
  let dayDiff = (targetDow - next.getDay() + 7) % 7
  if (dayDiff === 0 && next.getTime() <= from) dayDiff = 7
  next.setDate(next.getDate() + dayDiff)
  return next.getTime()
}

/** 获取全部定时任务（按 createdAt 升序，保持列表稳定） */
export function listAutomations(): Automation[] {
  return readIndex().automations.sort((a, b) => a.createdAt - b.createdAt)
}

/** 按 ID 获取单个定时任务 */
export function getAutomation(id: string): Automation | undefined {
  return readIndex().automations.find((a) => a.id === id)
}

/** 创建定时任务 */
export function createAutomation(input: CreateAutomationInput): Automation {
  const index = readIndex()
  const now = Date.now()
  const active = input.active ?? true

  const automation: Automation = {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    active,
    scheduleType: input.scheduleType,
    intervalMinutes: input.intervalMinutes,
    timeOfDay: input.timeOfDay,
    dayOfWeek: input.dayOfWeek,
    channelId: input.channelId,
    modelId: input.modelId,
    workspaceId: input.workspaceId,
    permissionMode: input.permissionMode ?? AUTOMATION_DEFAULT_PERMISSION_MODE,
    sourceSessionId: input.sourceSessionId,
    createdAt: now,
    updatedAt: now,
    nextRunAt: computeNextRunAt(input, now),
    runHistory: [],
  }

  index.automations.push(automation)
  writeIndex(index)
  console.log(`[定时任务] 已创建: ${automation.name} (${automation.id}), 模式 ${automation.scheduleType}`)
  return automation
}

/** 更新定时任务（部分字段） */
export function updateAutomation(input: UpdateAutomationInput): Automation | undefined {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === input.id)
  if (!target) return undefined

  const now = Date.now()
  if (input.name !== undefined) target.name = input.name
  if (input.prompt !== undefined) target.prompt = input.prompt
  if (input.channelId !== undefined) target.channelId = input.channelId
  if (input.modelId !== undefined) target.modelId = input.modelId
  // workspaceId 允许设为空字符串表示「无工作区」；用 undefined 区分「不修改」
  if (input.workspaceId !== undefined) {
    target.workspaceId = input.workspaceId || undefined
  }
  if (input.permissionMode !== undefined) target.permissionMode = input.permissionMode

  // 调度参数变化：重算下次运行时间（从现在起算，避免旧时间戳立即触发）
  const scheduleChanged =
    (input.scheduleType !== undefined && input.scheduleType !== target.scheduleType) ||
    (input.intervalMinutes !== undefined && input.intervalMinutes !== target.intervalMinutes) ||
    (input.timeOfDay !== undefined && input.timeOfDay !== target.timeOfDay) ||
    (input.dayOfWeek !== undefined && input.dayOfWeek !== target.dayOfWeek)
  if (input.scheduleType !== undefined) target.scheduleType = input.scheduleType
  if (input.intervalMinutes !== undefined) target.intervalMinutes = input.intervalMinutes
  if (input.timeOfDay !== undefined) target.timeOfDay = input.timeOfDay
  if (input.dayOfWeek !== undefined) target.dayOfWeek = input.dayOfWeek
  if (scheduleChanged) {
    target.nextRunAt = computeNextRunAt(target, now)
  }

  // 启用状态变化
  if (input.active !== undefined && input.active !== target.active) {
    target.active = input.active
    if (input.active) {
      // 重新启用：从现在起算下一次触发，清空连续失败计数
      target.nextRunAt = computeNextRunAt(target, now)
      target.consecutiveFailures = 0
    }
  }

  target.updatedAt = now
  writeIndex(index)
  return target
}

/** 删除定时任务 */
export function deleteAutomation(id: string): boolean {
  const index = readIndex()
  const before = index.automations.length
  index.automations = index.automations.filter((a) => a.id !== id)
  if (index.automations.length === before) return false
  writeIndex(index)
  console.log(`[定时任务] 已删除: ${id}`)
  return true
}

/**
 * 记录一次运行结果并推进下次触发时间
 *
 * 由调度器在运行完成/失败/跳过后调用。
 * - 成功/跳过：清零连续失败计数
 * - 失败：累加连续失败计数（调度器据此判断是否自动暂停）
 */
export function appendRun(id: string, run: AutomationRun): Automation | undefined {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return undefined

  const now = Date.now()
  target.runHistory.unshift(run)
  if (target.runHistory.length > AUTOMATION_MAX_HISTORY) {
    target.runHistory = target.runHistory.slice(0, AUTOMATION_MAX_HISTORY)
  }
  target.lastRunAt = run.runAt
  target.nextRunAt = computeNextRunAt(target, now)

  if (run.status === 'error') {
    target.consecutiveFailures = (target.consecutiveFailures ?? 0) + 1
  } else {
    target.consecutiveFailures = 0
  }

  target.updatedAt = now
  writeIndex(index)
  return target
}

/** 设置 nextRunAt（调度器恢复过期任务时用，避免重启雪崩触发） */
export function setNextRunAt(id: string, nextRunAt: number): void {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return
  target.nextRunAt = nextRunAt
  writeIndex(index)
}

/** 记录本任务复用的目标会话 ID */
export function setLastSessionId(id: string, sessionId: string): void {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return
  target.lastSessionId = sessionId
  writeIndex(index)
}
