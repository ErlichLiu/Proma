/**
 * useChatLayout - 聊天布局 Hook
 *
 * 统一处理会话显示模式的样式计算，简化组件中的条件判断。
 */

import { useAtomValue } from 'jotai'
import { chatMessageLayoutAtom } from '@/atoms/chat-message-layout'
import type { ChatMessageLayout } from '../../types'

export interface ChatLayoutStyles {
  /** 是否为左右分布模式 */
  isLeftRight: boolean
  /** 当前布局模式 */
  layout: ChatMessageLayout
  /** 用户消息是否右对齐 */
  isUserRightAligned: boolean
  /** Message 容器的对齐类名 */
  messageAlignClass: string
  /** 用户头像区域的 flex 方向类名 */
  userHeaderFlexClass: string
  /** 用户名/时间的对齐类名 */
  userInfoAlignClass: string
  /** MessageContent 的 padding 类名 */
  contentPaddingClass: string
  /** MessageContent 的 items 对齐类名 */
  contentItemsClass: string
  /** MessageActions 的类名 */
  actionsClass: string
  /** UserMessageContent 的文本对齐类名 */
  userContentTextClass: string
  /** 附件容器对齐类名 */
  attachmentsClass: string
}

/**
 * 获取聊天布局样式
 * @param isUserMessage 是否为用户消息
 * @param isParallelMode 是否为并排模式
 */
export function useChatLayout(
  isUserMessage: boolean,
  isParallelMode: boolean = false
): ChatLayoutStyles {
  const layout = useAtomValue(chatMessageLayoutAtom)
  const isLeftRight = layout === 'left-right'
  
  // 用户消息在左右分布模式下右对齐（并排模式强制左对齐）
  const isUserRightAligned = isUserMessage && isLeftRight && !isParallelMode

  return {
    isLeftRight,
    layout,
    isUserRightAligned,
    
    // Message 容器对齐
    messageAlignClass: isUserRightAligned ? 'items-end' : 'items-start',
    
    // 用户头像区域
    userHeaderFlexClass: isUserRightAligned ? 'flex-row-reverse' : '',
    userInfoAlignClass: isUserRightAligned ? 'items-end' : '',
    
    // MessageContent
    contentPaddingClass: isUserRightAligned ? 'pr-[46px] pl-0' : 'pl-[46px]',
    contentItemsClass: isUserRightAligned ? 'items-end' : '',
    
    // MessageActions
    actionsClass: isUserRightAligned 
      ? 'pr-[46px] justify-end' 
      : 'pl-[46px]',
    
    // UserMessageContent
    userContentTextClass: isUserRightAligned ? 'text-right' : '',
    
    // 附件
    attachmentsClass: isUserRightAligned ? 'items-end' : '',
  }
}

/**
 * 简化版 Hook - 仅用于 Agent 模式（无并排模式）
 */
export function useAgentLayout(isUserMessage: boolean): Omit<ChatLayoutStyles, 'isUserRightAligned'> {
  const layout = useAtomValue(chatMessageLayoutAtom)
  const isLeftRight = layout === 'left-right'
  const isRightAligned = isUserMessage && isLeftRight

  return {
    isLeftRight,
    layout,
    messageAlignClass: isRightAligned ? 'items-end' : 'items-start',
    userHeaderFlexClass: isRightAligned ? 'flex-row-reverse' : '',
    userInfoAlignClass: isRightAligned ? 'items-end' : '',
    contentPaddingClass: isRightAligned ? 'pr-[46px] pl-0' : 'pl-[46px]',
    contentItemsClass: isRightAligned ? 'items-end' : '',
    actionsClass: isRightAligned ? 'pr-[46px] justify-end' : 'pl-[46px]',
    userContentTextClass: isRightAligned ? 'text-right' : '',
    attachmentsClass: isRightAligned ? 'items-end' : '',
  }
}
