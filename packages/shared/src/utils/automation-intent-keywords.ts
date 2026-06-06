/**
 * 定时任务意图判断关键词
 *
 * 用作"含此类关键词时才触发 LLM 判断用户是否要建定时任务"的预过滤器。
 * 仅作粗筛，避免对所有用户消息都调 LLM 浪费成本；
 * 真正的意图识别由 main/lib/intent-detection.ts 中的 LLM 判断负责。
 *
 * 关键词刻意宽松：宁可多触发后续 LLM 二次过滤，也不漏掉典型表达。
 */

/** 关键词清单（中文为主，按使用频次粗略排序） */
export const AUTOMATION_INTENT_KEYWORDS: readonly string[] = [
  // 时间周期类（核心）
  '每天', '每周', '每月', '每小时', '每分钟', '每秒',
  '每隔', '隔一段时间',
  // 「每一X / 每个X / 每 N X」之类的非紧贴写法：用 '每一' 这个前缀覆盖
  // 例：'每一分钟'、'每一小时'、'每一天'
  '每一',
  // 模糊周期类
  '定期', '周期', '周期性',
  // "以后/今后"前缀
  '以后每', '从现在起每', '今后每',
  // 长期持续
  '一直', '持续', '长期',
  // 英文
  'every minute', 'every hour', 'every day', 'every week',
  'each minute', 'each hour', 'each day', 'each week',
  'periodically', 'recurring', 'schedule',
]

/**
 * 检查文本是否含定时任务意图关键词。
 * 简单 includes 不分词；大小写无关（仅对英文部分有意义）。
 */
export function containsAutomationKeyword(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return AUTOMATION_INTENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}
