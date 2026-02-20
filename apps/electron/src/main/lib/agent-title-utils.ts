/**
 * Agent 会话标题辅助工具
 */

import {
  MAX_CHAT_TITLE_LENGTH,
  normalizeTitleWhitespace,
  sanitizeTitleCandidate,
} from './title-utils'

/** Agent 默认会话标题（用于判断是否允许自动覆盖） */
export const DEFAULT_AGENT_SESSION_TITLE = '新 Agent 会话'

/** Agent 标题最大长度 */
export const MAX_AGENT_TITLE_LENGTH = MAX_CHAT_TITLE_LENGTH

/** Agent 兜底标题（用户首条消息为空时） */
const EMPTY_AGENT_FALLBACK_TITLE = '未命名会话'

/**
 * Agent 本地兜底标题：由首条用户消息确定性生成。
 * 即使用户消息为空，也返回非默认占位标题。
 */
export function deriveAgentFallbackTitle(
  userMessage: string,
  maxLength = MAX_AGENT_TITLE_LENGTH,
): string {
  const candidate = sanitizeTitleCandidate(userMessage, maxLength)
  return candidate ?? EMPTY_AGENT_FALLBACK_TITLE
}

/** 是否仍为 Agent 默认标题 */
export function isDefaultAgentTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return normalizeTitleWhitespace(title) === DEFAULT_AGENT_SESSION_TITLE
}

