/**
 * 自动更新 IPC 处理器
 *
 * 注册更新相关的 IPC 通道，供渲染进程调用。
 * 支持检查更新、下载更新、安装更新和设置自动更新开关。
 */

import { ipcMain } from 'electron'
import { UPDATER_IPC_CHANNELS } from './updater-types'
import type { UpdateStatus } from './updater-types'
import {
  checkForUpdates,
  getUpdateStatus,
  downloadUpdate,
  quitAndInstall,
  setAutoUpdateEnabled,
  getAutoUpdateEnabled,
} from './auto-updater'

/** 平台检测：判断是否允许启用 updater */
function isUpdaterEnabled(): boolean {
  // macOS / Windows: 均启用
  if (process.platform !== 'linux') {
    return true
  }
  // Linux: 仅 AppImage 启用（deb/rpm 包不启用，避免 GTK 崩溃）
  return !!process.env.APPIMAGE
}

/** 注册更新 IPC 处理器 */
export function registerUpdaterIpc(): void {
  console.log('[更新 IPC] 正在注册更新 IPC 处理器...')

  // 检查更新
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES,
    async (): Promise<void> => {
      if (!isUpdaterEnabled()) return
      await checkForUpdates()
    }
  )

  // 获取当前更新状态
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.GET_STATUS,
    async (): Promise<UpdateStatus> => {
      if (!isUpdaterEnabled()) {
        return { status: 'idle' }
      }
      return getUpdateStatus()
    }
  )

  // 下载更新
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.DOWNLOAD_UPDATE,
    async (): Promise<void> => {
      if (!isUpdaterEnabled()) return
      await downloadUpdate()
    }
  )

  // 退出并安装更新
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.QUIT_AND_INSTALL,
    async (): Promise<void> => {
      if (!isUpdaterEnabled()) return
      await quitAndInstall()
    }
  )

  // 设置自动更新开关
  ipcMain.handle(
    UPDATER_IPC_CHANNELS.SET_AUTO_UPDATE_ENABLED,
    async (_, enabled: boolean): Promise<void> => {
      if (!isUpdaterEnabled()) return
      setAutoUpdateEnabled(enabled)
    }
  )

  console.log('[更新 IPC] 更新 IPC 处理器注册完成')
}