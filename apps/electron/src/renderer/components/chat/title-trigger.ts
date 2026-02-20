/**
 * 标题触发判定（纯函数，便于测试）
 */

export interface TitleTriggerInput {
  skipAutoTitle: boolean
  messageCountBeforeSend: number
  content: string
  alreadyTriggered: boolean
}

export interface TitleTriggerDecision {
  shouldQueue: boolean
  reason:
    | 'should_queue'
    | 'skip_auto_title_option'
    | 'not_first_message'
    | 'empty_user_message'
    | 'duplicate_first_turn_guard'
}

export function decideTitleTrigger(input: TitleTriggerInput): TitleTriggerDecision {
  if (input.skipAutoTitle) {
    return { shouldQueue: false, reason: 'skip_auto_title_option' }
  }

  if (input.messageCountBeforeSend !== 0) {
    return { shouldQueue: false, reason: 'not_first_message' }
  }

  if (!input.content.trim()) {
    return { shouldQueue: false, reason: 'empty_user_message' }
  }

  if (input.alreadyTriggered) {
    return { shouldQueue: false, reason: 'duplicate_first_turn_guard' }
  }

  return { shouldQueue: true, reason: 'should_queue' }
}
