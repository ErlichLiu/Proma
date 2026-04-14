/**
 * 自动更新核心模块
 *
 * 支持检测新版本、下载更新和安装更新。
 * 用户可选择手动下载或自动下载安装。
 *
 * 仅在打包后的生产环境中工作。
 */

import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import type { UpdateStatus } from './updater-types'
import { UPDATER_IPC_CHANNELS } from './updater-types'

/** 当前更新状态 */
let currentStatus: UpdateStatus = { status: 'idle' }

/** 主窗口引用 */
let win: BrowserWindow | null = null

/** 定时检查定时器 */
let checkInterval: ReturnType<typeof setInterval> | null = null

/** 首次检查延迟定时器 */
let initialCheckTimeout: ReturnType<typeof setTimeout> | null = null

/** 自动更新开关 */
let autoUpdateEnabled = true

/** autoUpdater 事件监听器引用（用于清理） */
const eventListeners: {
  checkingForUpdate?: () => void
  updateAvailable?: (info: UpdateInfo) => void
  updateNotAvailable?: () => void
  error?: (error: Error) => void
  downloadProgress?: (progress: ProgressInfo) => void
  updateDownloaded?: (info: UpdateInfo) => void
} = {}

/** 窗口关闭监听器引用 */
let windowClosedListener: (() => void) | undefined = undefined

/** 更新状态并推送给渲染进程 */
function setStatus(status: UpdateStatus): void {
  currentStatus = status
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, status)
}

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

/** 手动触发检查更新 */
export async function checkForUpdates(): Promise<void> {
  try {
    // 重置状态为 checking
    setStatus({ status: 'checking' })
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('[更新] 检查更新失败:', err)
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 手动触发下载更新 */
export async function downloadUpdate(): Promise<void> {
  try {
    // 保存当前状态用于判断
    const statusBeforeCheck = currentStatus.status

    // 如果没有可用更新信息，先检查一次
    if (statusBeforeCheck !== 'available') {
      console.warn('[更新] 当前状态不是 available，尝试先检查更新')
      await checkForUpdates()
      // 检查后如果状态变为 available，则继续下载
      // 否则直接返回
      if (currentStatus.status === 'available') {
        // 检查成功，继续下载
      } else {
        console.warn('[更新] 检查后仍无可用更新，无法下载')
        return
      }
    }

    setStatus({ status: 'downloading', info: currentStatus.info })
    await autoUpdater.downloadUpdate()
  } catch (err) {
    console.error('[更新] 下载更新失败:', err)
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 退出并安装更新 */
export async function quitAndInstall(): Promise<void> {
  try {
    // 确保状态为 downloaded
    if (currentStatus.status !== 'downloaded') {
      console.warn('[更新] 当前状态不是 downloaded，无法安装')
      return
    }

    console.log('[更新] 正在退出并安装更新...')
    // 设置更新退出标志（让窗口关闭事件正确处理）
    const { setQuittingForUpdate } = await import('../app-lifecycle')
    setQuittingForUpdate()

    // 执行退出安装
    autoUpdater.quitAndInstall()
  } catch (err) {
    console.error('[更新] 退出安装失败:', err)
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 设置自动更新开关 */
export function setAutoUpdateEnabled(enabled: boolean): void {
  autoUpdateEnabled = enabled
  autoUpdater.autoDownload = enabled
  autoUpdater.autoInstallOnAppQuit = enabled
  console.log(`[更新] 自动更新开关已设置为: ${enabled}`)
}

/** 获取自动更新开关状态 */
export function getAutoUpdateEnabled(): boolean {
  return autoUpdateEnabled
}

/** 清理更新器资源（定时器、事件监听器等） */
export function cleanupUpdater(): void {
  // 清理定时器
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  if (initialCheckTimeout) {
    clearTimeout(initialCheckTimeout)
    initialCheckTimeout = null
  }

  // 移除 autoUpdater 事件监听器
  if (eventListeners.checkingForUpdate) {
    autoUpdater.removeListener('checking-for-update', eventListeners.checkingForUpdate)
  }
  if (eventListeners.updateAvailable) {
    autoUpdater.removeListener('update-available', eventListeners.updateAvailable)
  }
  if (eventListeners.updateNotAvailable) {
    autoUpdater.removeListener('update-not-available', eventListeners.updateNotAvailable)
  }
  if (eventListeners.error) {
    autoUpdater.removeListener('error', eventListeners.error)
  }
  if (eventListeners.downloadProgress) {
    autoUpdater.removeListener('download-progress', eventListeners.downloadProgress)
  }
  if (eventListeners.updateDownloaded) {
    autoUpdater.removeListener('update-downloaded', eventListeners.updateDownloaded)
  }

  // 清理窗口关闭监听器
  if (win && windowClosedListener) {
    win.removeListener('closed', windowClosedListener)
  }

  win = null
  console.log('[更新] 更新器资源已清理')
}

/**
 * 初始化自动更新
 *
 * @param mainWindow - 主窗口实例，用于推送更新状态
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  // 配置 electron-updater 日志，转发到 console
  autoUpdater.logger = {
    info: (...args: unknown[]) => console.log('[更新-updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[更新-updater]', ...args),
    error: (...args: unknown[]) => console.error('[更新-updater]', ...args),
    debug: (...args: unknown[]) => console.log('[更新-updater:debug]', ...args),
  }

  // 开发模式：强制启用更新测试（使用 dev-app-update.yml）
  // 检测方式：窗口加载的不是本地文件（file://）
  const isDev = !mainWindow.webContents.getURL().startsWith('file://')
  if (isDev) {
    autoUpdater.forceDevUpdateConfig = true
    console.log('[更新] 开发模式：已启用 forceDevUpdateConfig，使用 dev-app-update.yml 配置')
  }

  // 根据 autoUpdateEnabled 设置自动下载和自动安装
  autoUpdater.autoDownload = autoUpdateEnabled
  autoUpdater.autoInstallOnAppQuit = autoUpdateEnabled

  // 注册事件监听器并保存引用（便于后续清理）
  eventListeners.checkingForUpdate = () => {
    console.log('[更新] 正在检查更新...')
    setStatus({ status: 'checking' })
  }
  autoUpdater.on('checking-for-update', eventListeners.checkingForUpdate)

  eventListeners.updateAvailable = (info: UpdateInfo) => {
    console.log('[更新] 发现新版本:', info.version)
    setStatus({
      status: 'available',
      info,
    })
    // 如果启用自动下载，electron-updater 会自动开始下载
    // 此处无需额外调用 downloadUpdate()
  }
  autoUpdater.on('update-available', eventListeners.updateAvailable)

  eventListeners.updateNotAvailable = () => {
    console.log('[更新] 已是最新版本')
    setStatus({ status: 'not-available' })
  }
  autoUpdater.on('update-not-available', eventListeners.updateNotAvailable)

  eventListeners.error = (error: Error) => {
    console.error('[更新] 更新出错:', error)
    setStatus({
      status: 'error',
      error: error.message,
    })
  }
  autoUpdater.on('error', eventListeners.error)

  eventListeners.downloadProgress = (progress: ProgressInfo) => {
    console.log(`[更新] 下载进度: ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total} bytes)`)
    setStatus({
      status: 'downloading',
      info: currentStatus.info,
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      },
    })
  }
  autoUpdater.on('download-progress', eventListeners.downloadProgress)

  eventListeners.updateDownloaded = (info: UpdateInfo) => {
    console.log('[更新] 下载完成:', info.version)
    setStatus({
      status: 'downloaded',
      info,
    })
  }
  autoUpdater.on('update-downloaded', eventListeners.updateDownloaded)

  // 启动后延迟 10 秒首次检查
  initialCheckTimeout = setTimeout(() => {
    console.log('[更新] 首次自动检查更新')
    checkForUpdates()
  }, 10_000)

  // 每 4 小时自动检查一次
  checkInterval = setInterval(() => {
    console.log('[更新] 定时自动检查更新')
    checkForUpdates()
  }, 4 * 60 * 60 * 1000)

  // 窗口关闭时清理定时器和监听器
  windowClosedListener = () => {
    cleanupUpdater()
  }
  mainWindow.on('closed', windowClosedListener)

  console.log('[更新] 更新模块已初始化（支持检测、下载、安装）')
}