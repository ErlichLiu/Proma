/**
 * 窗口管理模块
 *
 * 负责创建分离的标签页窗口
 */

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Get the appropriate app icon path for the current platform
 */
function getIconPath(): string {
  // esbuild 将所有代码打包到 dist/main.cjs，__dirname 始终为 dist/
  const resourcesDir = join(__dirname, 'resources')

  if (process.platform === 'darwin') {
    return join(resourcesDir, 'icon.icns')
  } else if (process.platform === 'win32') {
    return join(resourcesDir, 'icon.ico')
  } else {
    return join(resourcesDir, 'icon.png')
  }
}

/**
 * 创建分离的标签页窗口
 * @param tabType - 标签页类型 (chat | agent)
 * @param sessionId - 会话 ID
 * @param title - 窗口标题
 * @param screenX - 鼠标释放时的屏幕 X 坐标
 * @param screenY - 鼠标释放时的屏幕 Y 坐标
 */
export function createDetachedWindow(
  tabType: string,
  sessionId: string,
  title: string,
  screenX: number,
  screenY: number
): void {
  const iconPath = getIconPath()
  const iconExists = existsSync(iconPath)

  const width = 1000
  const height = 750

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 600,
    minHeight: 400,
    x: Math.round(screenX - width / 2),
    y: Math.round(screenY - 40),
    icon: iconExists ? iconPath : undefined,
    show: false,
    title,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
  })

  // 构造带查询参数的 URL，渲染进程据此进入单标签模式
  const query = `?detached=1&type=${encodeURIComponent(tabType)}&sessionId=${encodeURIComponent(sessionId)}&title=${encodeURIComponent(title)}`

  const isDev = !app.isPackaged
  if (isDev) {
    win.loadURL(`http://localhost:5174${query}`)
  } else {
    win.loadFile(join(__dirname, 'renderer', 'index.html'), {
      search: query,
    })
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  // 拦截外部链接
  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:')) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}
