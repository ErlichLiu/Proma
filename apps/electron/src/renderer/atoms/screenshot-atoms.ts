/**
 * 对话截图功能的状态管理
 */

import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

interface ScreenshotState {
  open: boolean
  /** 触发截图的消息 ID，截图面板将默认选中该消息及之前所有消息 */
  triggerMessageId?: string
}

/** 按 sessionId 管理截图面板的开关状态 */
export const screenshotOpenAtomFamily = atomFamily((_sessionId: string) =>
  atom<ScreenshotState>({ open: false }),
)

/** 截图正在生成中（全局，用于隐藏迷你地图等 UI 元素） */
export const screenshotGeneratingAtom = atom(false)
