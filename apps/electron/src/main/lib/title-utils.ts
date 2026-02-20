/**
 * 标题生成辅助工具
 */

/** 聊天默认标题（用于判断是否允许自动覆盖） */
export const DEFAULT_CHAT_TITLE = '新对话'

/** 远端标题或本地兜底标题的最大长度 */
export const MAX_CHAT_TITLE_LENGTH = 20

/** 兜底标题（用户首条消息为空时） */
const EMPTY_FALLBACK_TITLE = '未命名对话'

/** 清理首尾包裹引号/书名号/括号等符号 */
function stripWrappingPunctuation(value: string): string {
  return value
    .replace(/^[\s"'“”‘’「」《》()\[\]{}【】]+/, '')
    .replace(/[\s"'“”‘’「」《》()\[\]{}【】]+$/, '')
}

/** 统一空白字符并裁剪 */
export function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * 清洗并裁剪标题候选文本。
 * 返回 null 表示候选文本无效。
 */
export function sanitizeTitleCandidate(raw: string, maxLength = MAX_CHAT_TITLE_LENGTH): string | null {
  const normalized = normalizeTitleWhitespace(raw)
  if (!normalized) return null

  const stripped = stripWrappingPunctuation(normalized)
  const cleaned = normalizeTitleWhitespace(stripped)
  if (!cleaned) return null

  const truncated = cleaned.slice(0, maxLength).trim()
  return truncated || null
}

/**
 * 本地兜底标题：由首条用户消息确定性生成。
 * 即使用户消息为空，也返回非默认占位标题。
 */
export function deriveFallbackTitle(userMessage: string, maxLength = MAX_CHAT_TITLE_LENGTH): string {
  const candidate = sanitizeTitleCandidate(userMessage, maxLength)
  return candidate ?? EMPTY_FALLBACK_TITLE
}

/** 是否仍为默认聊天标题 */
export function isDefaultChatTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return normalizeTitleWhitespace(title) === DEFAULT_CHAT_TITLE
}
