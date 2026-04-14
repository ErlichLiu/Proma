/**
 * 对话截图功能的状态管理
 */

import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

/** 按 sessionId 管理截图面板的开关状态 */
export const screenshotOpenAtomFamily = atomFamily((_sessionId: string) => atom(false))
