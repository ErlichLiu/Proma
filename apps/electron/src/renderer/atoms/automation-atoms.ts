/**
 * 定时任务（Automation）状态管理
 *
 * - automationsAtom：任务列表（由初始化器从主进程加载并订阅变更刷新）
 * - automationFormAtom：创建/编辑表单的开关 + 草稿（表单复用中间内容区，非弹窗）
 */

import { atom } from 'jotai'
import type { Automation, AutomationScheduleType, AutomationPermissionMode, AutomationIntentSuggestion } from '@proma/shared'
import { AUTOMATION_DEFAULT_PERMISSION_MODE } from '@proma/shared'

/** 全部定时任务列表 */
export const automationsAtom = atom<Automation[]>([])

/**
 * 表单草稿
 * - 无 id：创建模式
 * - 有 id：编辑模式（预填已有任务字段）
 */
export interface AutomationDraft {
  /** 编辑模式下的任务 id；创建模式为空 */
  id?: string
  name: string
  prompt: string
  scheduleType: AutomationScheduleType
  intervalMinutes: number
  timeOfDay?: string
  dayOfWeek?: number
  channelId: string
  modelId?: string
  workspaceId?: string
  permissionMode: AutomationPermissionMode
  sourceSessionId?: string
  active: boolean
}

/** 表单视图状态（覆盖在中间内容区） */
export interface AutomationFormState {
  open: boolean
  draft: AutomationDraft | null
}

export const automationFormAtom = atom<AutomationFormState>({
  open: false,
  draft: null,
})

/** 创建一个空白草稿（用于「+ 新建」） */
export function createEmptyDraft(): AutomationDraft {
  return {
    name: '',
    prompt: '',
    scheduleType: 'interval',
    intervalMinutes: 10,
    timeOfDay: '09:00',
    dayOfWeek: 1,
    channelId: '',
    permissionMode: AUTOMATION_DEFAULT_PERMISSION_MODE,
    active: true,
  }
}

/** 固定间隔选项（分钟） */
export const AUTOMATION_INTERVAL_OPTIONS = [
  { label: '每 5 分钟', value: 5 },
  { label: '每 10 分钟', value: 10 },
  { label: '每 30 分钟', value: 30 },
  { label: '每 1 小时', value: 60 },
  { label: '每 3 小时', value: 180 },
  { label: '每 6 小时', value: 360 },
  { label: '每 12 小时', value: 720 },
] as const

/** 星期选项（0=周日） */
export const AUTOMATION_WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
] as const

/**
 * 意图判断 banner 待显示的数据（按 sessionId 隔离，支持多会话并行）
 * - draft_created：草稿已落库，banner 提示用户「打开调整 / 启用 / 丢弃」
 * - pending_schedule：意图明确但频率不明，banner 询问频率
 */
export type PendingAutomationIntent =
  | { kind: 'draft_created'; automationId: string }
  | { kind: 'pending_schedule'; suggestion: AutomationIntentSuggestion }

export const pendingAutomationIntentMapAtom = atom<Map<string, PendingAutomationIntent>>(new Map())

