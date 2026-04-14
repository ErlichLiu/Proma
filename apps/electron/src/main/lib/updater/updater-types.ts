/**
 * 自动更新相关类型定义
 *
 * 支持检测新版本、下载更新和安装更新。
 */

import type { UpdateInfo } from 'electron-updater'

/** 更新状态 */
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: UpdateInfo
  progress?: {
    percent: number
    bytesPerSecond: number
    total: number
    transferred: number
  }
  error?: string
}

/** 更新 IPC 通道常量 */
export const UPDATER_IPC_CHANNELS = {
  CHECK_FOR_UPDATES: 'updater:check',
  GET_STATUS: 'updater:get-status',
  ON_STATUS_CHANGED: 'updater:status-changed',
  DOWNLOAD_UPDATE: 'updater:download',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
  SET_AUTO_UPDATE_ENABLED: 'updater:set-auto-enabled',
} as const
