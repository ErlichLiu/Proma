/**
 * 自动更新状态原子
 *
 * 管理应用更新状态，订阅主进程推送的更新事件。
 * 支持检测、下载和安装更新。
 * 优雅降级：如果 window.electronAPI.updater 不存在（开源构建），状态保持 idle。
 */

import { atom } from 'jotai'

/** 更新状态 */
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  error?: string
  progress?: {
    percent: number
    bytesPerSecond: number
    total: number
    transferred: number
  }
}

/** 更新状态 atom */
export const updateStatusAtom = atom<UpdateStatus>({ status: 'idle' })

/** 是否有可用更新（available 或 downloaded） */
export const hasUpdateAtom = atom((get) => {
  const { status } = get(updateStatusAtom)
  return status === 'available' || status === 'downloaded'
})

/** 是否正在下载更新 */
export const isDownloadingAtom = atom((get) => {
  const { status } = get(updateStatusAtom)
  return status === 'downloading'
})

/** 是否准备好安装（已下载完成） */
export const isReadyToInstallAtom = atom((get) => {
  const { status } = get(updateStatusAtom)
  return status === 'downloaded'
})

/** updater 是否可用 */
export const updaterAvailableAtom = atom<boolean>(() => {
  return !!window.electronAPI?.updater
})

/** 自动更新开关 atom */
export const autoUpdateEnabledAtom = atom<boolean>(true)

/**
 * 初始化更新状态订阅
 *
 * 订阅主进程推送的更新状态变化事件。
 * 返回清理函数。
 */
export function initializeUpdater(
  setStatus: (status: UpdateStatus) => void,
): () => void {
  const updater = window.electronAPI?.updater
  if (!updater) {
    // updater 不可用（开源构建），直接返回空清理函数
    return () => {}
  }

  // 获取初始状态
  updater.getStatus().then(setStatus).catch(() => {
    // IPC 调用失败（updater 主进程端未注册），保持 idle
  })

  // 订阅状态变化
  const cleanup = updater.onStatusChanged(setStatus)
  return cleanup
}

/** 手动检查更新 */
export async function checkForUpdates(): Promise<void> {
  await window.electronAPI?.updater?.checkForUpdates()
}

/** 手动下载更新 */
export async function downloadUpdate(): Promise<void> {
  await window.electronAPI?.updater?.downloadUpdate()
}

/** 退出并安装更新 */
export async function quitAndInstall(): Promise<void> {
  await window.electronAPI?.updater?.quitAndInstall()
}

/** 设置自动更新开关 */
export async function setAutoUpdateEnabled(enabled: boolean): Promise<void> {
  await window.electronAPI?.updater?.setAutoUpdateEnabled(enabled)
}
