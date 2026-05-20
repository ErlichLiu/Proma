// ===== 统一的时间/模型格式化 + Provider 图标 =====

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const MODEL_ID_ICONS: Array<[RegExp, string]> = [
  [/gpt-image/i, '🟢'], [/gpt-3/i, '🟢'], [/gpt-4/i, '🟢'], [/gpt-5-mini/i, '🟢'],
  [/(claude|anthropic-)/i, '🟣'],
  [/deepseek/i, '🔵'], [/deepgemini/i, '🔷'], [/gemini/i, '🔷'], [/(qwen|qwq|qvq|wan-)/i, '🟠'],
  [/grok/i, '⚪'], [/kimi/i, '🌙'], [/(doubao|ep-202|seed)/i, '🟡'], [/zhipu/i, '💜'],
  [/minimax/i, '🟤'], [/mistral/i, '🟤'], [/llama/i, '🦙'],
]

const URL_ICONS: Array<[RegExp, string]> = [
  [/proma\.cool/i, '⭐'], [/moonshot\.cn|kimi/i, '🌙'], [/bigmodel\.cn|zhipuai/i, '💜'],
  [/dashscope|aliyuncs/i, '🟠'], [/deepseek/i, '🔵'], [/anthropic/i, '🟣'], [/openai\.com/i, '🟢'],
  [/googleapis|generativelanguage/i, '🔷'], [/grok|x\.ai/i, '⚪'], [/volcengine|volces/i, '🟡'],
]

export function getProviderIcon(modelId: string | null, baseUrl: string | null): string {
  if (modelId) { for (const [re, icon] of MODEL_ID_ICONS) { if (re.test(modelId)) return icon } }
  if (baseUrl) { for (const [re, icon] of URL_ICONS) { if (re.test(baseUrl)) return icon } }
  return '🤖'
}

export function formatModel(modelId: string | null): string {
  if (!modelId) return ''
  const map: Record<string, string> = { 'claude-sonnet-4-6': 'Sonnet 4.6', 'claude-opus-4-7': 'Opus 4.7', 'claude-haiku-4-5-20251001': 'Haiku 4.5' }
  if (map[modelId]) return map[modelId]
  const m = modelId.match(/claude-(sonnet|opus|haiku)-([\d-]+)/)
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2].replace(/-/g, '.')}`
  return modelId.length > 20 ? modelId.slice(0, 18) + '…' : modelId
}
