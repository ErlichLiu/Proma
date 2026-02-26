/**
 * 全局快捷键服务
 *
 * 管理全局快捷键的注册、注销和触发处理。
 */

import { globalShortcut, BrowserWindow } from 'electron'
import { getSettings } from './settings-service'
import type { ShortcutConfig } from '../../types'

let mainWindow: BrowserWindow | null = null

/**
 * 设置主窗口引用
 */
export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

/**
 * 显示并聚焦窗口
 */
function showAndFocusWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

/**
 * 处理 Chat 快捷键触发
 */
function handleChatShortcut(config: ShortcutConfig): void {
  console.log('[快捷键] Chat 快捷键触发:', config)

  showAndFocusWindow()

  // 发送 IPC 事件到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('shortcut:chat', config.behavior)
  }
}

/**
 * 处理 Agent 快捷键触发
 */
function handleAgentShortcut(config: ShortcutConfig): void {
  console.log('[快捷键] Agent 快捷键触发:', config)

  showAndFocusWindow()

  // 发送 IPC 事件到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('shortcut:agent', config.behavior)
  }
}

/**
 * 注册全局快捷键
 */
export function registerShortcuts(): boolean {
  try {
    const settings = getSettings()

    // 注册 Chat 快捷键
    if (settings.chatShortcut?.enabled && settings.chatShortcut.accelerator) {
      const registered = globalShortcut.register(
        settings.chatShortcut.accelerator,
        () => handleChatShortcut(settings.chatShortcut!)
      )

      if (!registered) {
        console.error('[快捷键] Chat 快捷键注册失败:', settings.chatShortcut.accelerator)
        return false
      }

      console.log('[快捷键] Chat 快捷键已注册:', settings.chatShortcut.accelerator)
    }

    // 注册 Agent 快捷键
    if (settings.agentShortcut?.enabled && settings.agentShortcut.accelerator) {
      const registered = globalShortcut.register(
        settings.agentShortcut.accelerator,
        () => handleAgentShortcut(settings.agentShortcut!)
      )

      if (!registered) {
        console.error('[快捷键] Agent 快捷键注册失败:', settings.agentShortcut.accelerator)
        return false
      }

      console.log('[快捷键] Agent 快捷键已注册:', settings.agentShortcut.accelerator)
    }

    return true
  } catch (error) {
    console.error('[快捷键] 注册失败:', error)
    return false
  }
}

/**
 * 注销所有全局快捷键
 */
export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
  console.log('[快捷键] 所有快捷键已注销')
}

/**
 * 验证快捷键是否可用
 */
export function validateShortcut(accelerator: string): boolean {
  try {
    // 尝试注册并立即注销
    const registered = globalShortcut.register(accelerator, () => {})
    if (registered) {
      globalShortcut.unregister(accelerator)
      return true
    }
    return false
  } catch {
    return false
  }
}
