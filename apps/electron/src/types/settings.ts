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

/** 缩放模式 */
export type ZoomMode = 'message-area' | 'global'

/** 默认缩放模式 */
export const DEFAULT_ZOOM_MODE: ZoomMode = 'message-area'

/** 默认消息区域缩放级别 */
export const DEFAULT_MESSAGE_AREA_ZOOM_LEVEL = 1.0

/** 默认全局缩放级别 */
export const DEFAULT_GLOBAL_ZOOM_LEVEL = 1.0

/** 缩放级别范围 */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.0
export const ZOOM_STEP = 0.1

/** 应用设置 */
export interface AppSettings {
  /** 主题模式 */
  themeMode: ThemeMode
  /** 缩放模式 */
  zoomMode?: ZoomMode
  /** 消息区域缩放级别 */
  messageAreaZoomLevel?: number
  /** 全局缩放级别 */
  globalZoomLevel?: number
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
}

/** 设置 IPC 通道 */
export const SETTINGS_IPC_CHANNELS = {
  GET: 'settings:get',
  UPDATE: 'settings:update',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  ON_SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',
  SET_ZOOM_FACTOR: 'settings:set-zoom-factor',
  GET_ZOOM_FACTOR: 'settings:get-zoom-factor',
} as const
