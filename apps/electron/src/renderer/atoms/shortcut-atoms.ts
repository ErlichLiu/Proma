/**
 * 快捷键状态管理
 */

import { atom } from 'jotai'
import type { ShortcutConfig } from '../../types'

/**
 * Chat 快捷键配置
 */
export const chatShortcutAtom = atom<ShortcutConfig | null>(null)

/**
 * Agent 快捷键配置
 */
export const agentShortcutAtom = atom<ShortcutConfig | null>(null)

/**
 * 加载快捷键配置
 */
export const loadShortcutsAtom = atom(null, async (get, set) => {
  const settings = await window.electronAPI.getSettings()
  set(chatShortcutAtom, settings.chatShortcut || null)
  set(agentShortcutAtom, settings.agentShortcut || null)
})

/**
 * 更新 Chat 快捷键
 */
export const updateChatShortcutAtom = atom(
  null,
  async (get, set, config: ShortcutConfig) => {
    await window.electronAPI.updateSettings({ chatShortcut: config })
    set(chatShortcutAtom, config)

    // 重新注册快捷键
    await window.electronAPI.registerShortcuts()
  }
)

/**
 * 更新 Agent 快捷键
 */
export const updateAgentShortcutAtom = atom(
  null,
  async (get, set, config: ShortcutConfig) => {
    await window.electronAPI.updateSettings({ agentShortcut: config })
    set(agentShortcutAtom, config)

    // 重新注册快捷键
    await window.electronAPI.registerShortcuts()
  }
)

/**
 * 验证快捷键是否可用
 */
export const validateShortcutAtom = atom(
  null,
  async (get, set, accelerator: string): Promise<boolean> => {
    return window.electronAPI.validateShortcut(accelerator)
  }
)
