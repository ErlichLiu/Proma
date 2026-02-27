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
 * 每次触发时重新读取最新设置，确保使用最新的 behavior 配置
 */
function handleChatShortcut(): void {
  // 重新读取最新设置
  const settings = getSettings()
  const config = settings.chatShortcut

  if (!config || !config.enabled) {
    console.log('[快捷键] Chat 快捷键已禁用，忽略触发')
    return
  }

  console.log('[快捷键] Chat 快捷键触发:', config)

  showAndFocusWindow()

  // 发送 IPC 事件到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('shortcut:chat', config.behavior)
  }
}

/**
 * 处理 Agent 快捷键触发
 * 每次触发时重新读取最新设置，确保使用最新的 behavior 配置
 */
function handleAgentShortcut(): void {
  // 重新读取最新设置
  const settings = getSettings()
  const config = settings.agentShortcut

  if (!config || !config.enabled) {
    console.log('[快捷键] Agent 快捷键已禁用，忽略触发')
    return
  }

  console.log('[快捷键] Agent 快捷键触发:', config)

  showAndFocusWindow()

  // 发送 IPC 事件到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('shortcut:agent', config.behavior)
  }
}

/**
 * 注册全局快捷键
 * 注册前先注销所有旧的快捷键，确保配置更新生效
 */
export function registerShortcuts(): boolean {
  try {
    // 先注销所有旧的快捷键
    unregisterShortcuts()

    const settings = getSettings()

    // 注册 Chat 快捷键
    if (settings.chatShortcut?.enabled && settings.chatShortcut.accelerator) {
      const registered = globalShortcut.register(
        settings.chatShortcut.accelerator,
        handleChatShortcut
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
        handleAgentShortcut
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
