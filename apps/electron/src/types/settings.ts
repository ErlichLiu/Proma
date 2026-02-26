/**
 * 应用设置类型
 *
 * 主题模式、IPC 通道等设置相关定义。
 */

import type { EnvironmentCheckResult } from '@proma/shared'

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 默认主题模式 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark'

/** 快捷键行为模式 */
export type ShortcutBehavior = 'new-conversation' | 'current-conversation'

/** 快捷键配置 */
export interface ShortcutConfig {
  /** 快捷键组合（如 'CommandOrControl+Shift+C'） */
  accelerator: string
  /** 是否启用 */
  enabled: boolean
  /** 行为模式 */
  behavior: ShortcutBehavior
}

/** 默认 Chat 快捷键配置 */
export const DEFAULT_CHAT_SHORTCUT: ShortcutConfig = {
  accelerator: 'CommandOrControl+Shift+C',
  enabled: true,
  behavior: 'new-conversation',
}

/** 默认 Agent 快捷键配置 */
export const DEFAULT_AGENT_SHORTCUT: ShortcutConfig = {
  accelerator: 'CommandOrControl+Shift+A',
  enabled: true,
  behavior: 'new-conversation',
}

/** 应用设置 */
export interface AppSettings {
  /** 主题模式 */
  themeMode: ThemeMode
  /** Agent 默认渠道 ID（仅限 Anthropic 渠道） */
  agentChannelId?: string
  /** Agent 默认模型 ID */
  agentModelId?: string
  /** Agent 当前工作区 ID */
  agentWorkspaceId?: string
  /** 是否已完成 Onboarding 流程 */
  onboardingCompleted?: boolean
  /** 是否跳过了环境检测 */
  environmentCheckSkipped?: boolean
  /** 最后一次环境检测结果（缓存） */
  lastEnvironmentCheck?: EnvironmentCheckResult
  /** 是否启用桌面通知 */
  notificationsEnabled?: boolean
  /** Chat 模式快捷键配置 */
  chatShortcut?: ShortcutConfig
  /** Agent 模式快捷键配置 */
  agentShortcut?: ShortcutConfig
}

/** 设置 IPC 通道 */
export const SETTINGS_IPC_CHANNELS = {
  GET: 'settings:get',
  UPDATE: 'settings:update',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  ON_SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',
  REGISTER_SHORTCUTS: 'settings:register-shortcuts',
  UNREGISTER_SHORTCUTS: 'settings:unregister-shortcuts',
  VALIDATE_SHORTCUT: 'settings:validate-shortcut',
} as const
