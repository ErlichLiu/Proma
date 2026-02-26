/**
 * 缩放状态原子
 *
 * 管理应用缩放模式、消息区域缩放级别和全局缩放级别。
 * - zoomModeAtom: 缩放模式（消息区域/全局），持久化到 ~/.proma/settings.json
 * - messageAreaZoomLevelAtom: 消息区域缩放级别（0.5-2.0），持久化到 ~/.proma/settings.json
 * - globalZoomLevelAtom: 全局缩放级别（0.5-2.0），持久化到 ~/.proma/settings.json
 *
 * 使用 localStorage 作为缓存，避免页面加载时闪烁。
 */

import { atom } from 'jotai'
import type { ZoomMode } from '../../types'
import {
  DEFAULT_ZOOM_MODE,
  DEFAULT_MESSAGE_AREA_ZOOM_LEVEL,
  DEFAULT_GLOBAL_ZOOM_LEVEL,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
} from '../../types/settings'

/** localStorage 缓存键 */
const ZOOM_MODE_CACHE_KEY = 'proma-zoom-mode'
const MESSAGE_AREA_ZOOM_LEVEL_CACHE_KEY = 'proma-message-area-zoom-level'
const GLOBAL_ZOOM_LEVEL_CACHE_KEY = 'proma-global-zoom-level'

/**
 * 从 localStorage 读取缓存的缩放模式
 */
function getCachedZoomMode(): ZoomMode {
  try {
    const cached = localStorage.getItem(ZOOM_MODE_CACHE_KEY)
    if (cached === 'message-area' || cached === 'global') {
      return cached
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_ZOOM_MODE
}

/**
 * 从 localStorage 读取缓存的消息区域缩放级别
 */
function getCachedMessageAreaZoomLevel(): number {
  try {
    const cached = localStorage.getItem(MESSAGE_AREA_ZOOM_LEVEL_CACHE_KEY)
    if (cached) {
      const level = Number.parseFloat(cached)
      if (!Number.isNaN(level) && level >= ZOOM_MIN && level <= ZOOM_MAX) {
        return level
      }
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_MESSAGE_AREA_ZOOM_LEVEL
}

/**
 * 从 localStorage 读取缓存的全局缩放级别
 */
function getCachedGlobalZoomLevel(): number {
  try {
    const cached = localStorage.getItem(GLOBAL_ZOOM_LEVEL_CACHE_KEY)
    if (cached) {
      const level = Number.parseFloat(cached)
      if (!Number.isNaN(level) && level >= ZOOM_MIN && level <= ZOOM_MAX) {
        return level
      }
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_GLOBAL_ZOOM_LEVEL
}

/**
 * 缓存缩放模式到 localStorage
 */
function cacheZoomMode(mode: ZoomMode): void {
  try {
    localStorage.setItem(ZOOM_MODE_CACHE_KEY, mode)
  } catch {
    // localStorage 不可用时忽略
  }
}

/**
 * 缓存消息区域缩放级别到 localStorage
 */
function cacheMessageAreaZoomLevel(level: number): void {
  try {
    localStorage.setItem(MESSAGE_AREA_ZOOM_LEVEL_CACHE_KEY, level.toString())
  } catch {
    // localStorage 不可用时忽略
  }
}

/**
 * 缓存全局缩放级别到 localStorage
 */
function cacheGlobalZoomLevel(level: number): void {
  try {
    localStorage.setItem(GLOBAL_ZOOM_LEVEL_CACHE_KEY, level.toString())
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 缩放模式 */
export const zoomModeAtom = atom<ZoomMode>(getCachedZoomMode())

/** 消息区域缩放级别 */
export const messageAreaZoomLevelAtom = atom<number>(getCachedMessageAreaZoomLevel())

/** 全局缩放级别 */
export const globalZoomLevelAtom = atom<number>(getCachedGlobalZoomLevel())

/**
 * 初始化缩放系统
 *
 * 从主进程加载设置。
 */
export async function initializeZoom(
  setZoomMode: (mode: ZoomMode) => void,
  setMessageAreaZoomLevel: (level: number) => void,
  setGlobalZoomLevel: (level: number) => void,
): Promise<void> {
  // 从主进程加载持久化设置
  const settings = await window.electronAPI.getSettings()
  const mode = settings.zoomMode || DEFAULT_ZOOM_MODE
  const messageAreaLevel = settings.messageAreaZoomLevel || DEFAULT_MESSAGE_AREA_ZOOM_LEVEL
  const globalLevel = settings.globalZoomLevel || DEFAULT_GLOBAL_ZOOM_LEVEL

  setZoomMode(mode)
  setMessageAreaZoomLevel(messageAreaLevel)
  setGlobalZoomLevel(globalLevel)
  cacheZoomMode(mode)
  cacheMessageAreaZoomLevel(messageAreaLevel)
  cacheGlobalZoomLevel(globalLevel)
}

/**
 * 更新缩放模式并持久化
 */
export async function updateZoomMode(mode: ZoomMode): Promise<void> {
  cacheZoomMode(mode)
  await window.electronAPI.updateSettings({ zoomMode: mode })
}

/**
 * 更新消息区域缩放级别并持久化
 */
export async function updateMessageAreaZoomLevel(level: number): Promise<void> {
  // 确保级别在有效范围内
  const clampedLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level))
  cacheMessageAreaZoomLevel(clampedLevel)
  await window.electronAPI.updateSettings({ messageAreaZoomLevel: clampedLevel })
}

/**
 * 更新全局缩放级别并持久化
 */
export async function updateGlobalZoomLevel(level: number): Promise<void> {
  // 确保级别在有效范围内
  const clampedLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level))
  cacheGlobalZoomLevel(clampedLevel)
  await window.electronAPI.updateSettings({ globalZoomLevel: clampedLevel })
}

/**
 * 增加缩放级别
 */
export function zoomIn(currentLevel: number): number {
  const newLevel = currentLevel + ZOOM_STEP
  return Math.min(ZOOM_MAX, Math.round(newLevel * 10) / 10)
}

/**
 * 减少缩放级别
 */
export function zoomOut(currentLevel: number): number {
  const newLevel = currentLevel - ZOOM_STEP
  return Math.max(ZOOM_MIN, Math.round(newLevel * 10) / 10)
}

/**
 * 重置缩放级别到 100%
 */
export function resetZoom(): number {
  return 1.0
}
