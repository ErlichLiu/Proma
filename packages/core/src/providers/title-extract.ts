/**
 * 标题提取辅助函数（Provider-agnostic）
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readLastNonEmptyLine(value: string): string | null {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  const last = lines[lines.length - 1]
  if (!last) return null
  if (last.startsWith('- ')) return last.slice(2).trim() || null
  return last
}

/**
 * 从“文本或文本块数组”中提取文本。
 * 兼容 string / [{text}] / [{type:'text', text}] / [{thinking}] 等常见结构。
 */
export function extractTextFromContentLike(content: unknown): string | null {
  const text = readString(content)
  if (text) return text

  for (const item of asArray(content)) {
    const direct = readString(item)
    if (direct) return direct

    const rec = asRecord(item)
    if (!rec) continue

    const itemText = readString(rec.text)
    if (itemText) return itemText

    const outputText = readString(rec.output_text)
    if (outputText) return outputText

    const thinking = readString(rec.thinking)
    if (thinking) {
      const extracted = readLastNonEmptyLine(thinking)
      if (extracted) return extracted
    }

    const nestedContent = extractTextFromContentLike(rec.content)
    if (nestedContent) return nestedContent

    const nestedParts = extractTextFromContentLike(rec.parts)
    if (nestedParts) return nestedParts
  }

  return null
}

/**
 * 从常见 provider 响应体结构中提取标题文本。
 * adapter 的 parseTitleResponse 失败时，可作为通用兜底。
 */
export function extractTitleFromCommonResponse(responseBody: unknown): string | null {
  const direct = readString(responseBody)
  if (direct) return direct

  const root = asRecord(responseBody)
  if (!root) return null

  // OpenAI Responses API
  const outputText = readString(root.output_text)
  if (outputText) return outputText

  // OpenAI Chat Completions
  const firstChoice = asArray(root.choices)[0]
  if (firstChoice) {
    const choice = asRecord(firstChoice)
    if (choice) {
      const message = asRecord(choice.message)
      if (message) {
        const fromMessage = extractTextFromContentLike(message.content)
        if (fromMessage) return fromMessage
      }

      const fromChoiceText = readString(choice.text)
      if (fromChoiceText) return fromChoiceText

      const fromChoiceDelta = asRecord(choice.delta)
      if (fromChoiceDelta) {
        const fromDelta = readString(fromChoiceDelta.content)
        if (fromDelta) return fromDelta
      }
    }
  }

  // Anthropic Messages API (and compatible variants)
  const fromContent = extractTextFromContentLike(root.content)
  if (fromContent) return fromContent

  // Google Gemini style
  const firstCandidate = asArray(root.candidates)[0]
  if (firstCandidate) {
    const candidate = asRecord(firstCandidate)
    if (candidate) {
      const candidateContent = asRecord(candidate.content)
      if (candidateContent) {
        const fromParts = extractTextFromContentLike(candidateContent.parts)
        if (fromParts) return fromParts
      }

      const fromCandidateText = extractTextFromContentLike(candidate.text)
      if (fromCandidateText) return fromCandidateText
    }
  }

  // Some gateways wrap payload in `data`
  const wrappedData = root.data
  const fromWrappedData = extractTitleFromCommonResponse(wrappedData)
  if (fromWrappedData) return fromWrappedData

  return null
}
