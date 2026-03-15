/**
 * 消息布局模式状态原子
 *
 * 管理会话消息显示模式：
 * - left-aligned: 消息气泡左对齐（当前应用中的形式）
 * - left-right: 消息气泡左右分布（类似微信，自己发在右边，AI发在左边）
 *
 * 使用 localStorage 作为缓存，避免页面加载时闪烁。
 */

import { atom } from 'jotai'
import type { ChatMessageLayout } from '../../types'

/** localStorage 缓存键 */
const LAYOUT_CACHE_KEY = 'proma-chat-message-layout'

/**
 * 从 localStorage 读取缓存的消息布局模式
 */
function getCachedLayout(): ChatMessageLayout {
  try {
    const cached = localStorage.getItem(LAYOUT_CACHE_KEY)
    if (cached === 'left-aligned' || cached === 'left-right') {
      return cached
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return 'left-aligned'
}

/**
 * 缓存消息布局模式到 localStorage
 */
function cacheLayout(layout: ChatMessageLayout): void {
  try {
    localStorage.setItem(LAYOUT_CACHE_KEY, layout)
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 消息布局模式原子 */
export const chatMessageLayoutAtom = atom<ChatMessageLayout>(getCachedLayout())

/**
 * 初始化消息布局设置
 *
 * 从主进程加载持久化设置。
 */
export async function initializeChatMessageLayout(
  setLayout: (layout: ChatMessageLayout) => void,
): Promise<void> {
  // 从主进程加载持久化设置
  const settings = await window.electronAPI.getSettings()
  const layout = settings.chatMessageLayout ?? 'left-aligned'
  setLayout(layout)
  cacheLayout(layout)
}

/**
 * 更新消息布局模式并持久化
 *
 * 同时更新 localStorage 缓存和主进程配置文件。
 */
export async function updateChatMessageLayout(layout: ChatMessageLayout): Promise<void> {
  cacheLayout(layout)
  await window.electronAPI.updateSettings({ chatMessageLayout: layout })
}
