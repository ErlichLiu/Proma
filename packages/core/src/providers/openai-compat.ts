/**
 * OpenAI 兼容服务探测工具
 *
 * 主要用于第三方 OpenAI 兼容服务的 Base URL 兼容性探测：
 * - 有的服务以 https://host/v1 作为根路径（OpenAI 官方）
 * - 有的服务以 https://host 作为根路径（不带 /v1）
 *
 * 这里提供一个轻量探测：并发请求 /models 与 /v1/models，通过结果选择更合适的 Base URL。
 * 仅用于“连接测试/辅助回填”，不影响实际请求构建逻辑。
 */

import { normalizeBaseUrl, normalizeOpenAIBaseUrl } from './url-utils.ts'

/** /models 探测结果（最小字段集） */
export interface OpenAIModelsProbe {
  baseUrl: string
  ok: boolean
  status: number
  bodyPreview?: string
  error?: string
}

/** 探测汇总结果 */
export interface OpenAIModelsProbeResult {
  /** 探测到的候选 baseUrl（去重后） */
  probes: OpenAIModelsProbe[]
  /** 最优探测结果 */
  best: OpenAIModelsProbe
  /** 推荐使用的 baseUrl */
  resolvedBaseUrl: string
}

export function scoreOpenAIModelsProbe(probe: OpenAIModelsProbe): number {
  if (probe.ok) return 3
  if (probe.status === 401) return 2
  if (probe.status === 404) return 0
  if (probe.status > 0) return 1
  return -1
}

export function chooseBestOpenAIModelsProbe(
  probes: OpenAIModelsProbe[],
  preferBaseUrl?: string,
): OpenAIModelsProbe {
  if (probes.length === 0) {
    throw new Error('No probes provided')
  }

  return probes.reduce((prev, cur) => {
    const sPrev = scoreOpenAIModelsProbe(prev)
    const sCur = scoreOpenAIModelsProbe(cur)
    if (sCur !== sPrev) return sCur > sPrev ? cur : prev
    if (preferBaseUrl && cur.baseUrl === preferBaseUrl && prev.baseUrl !== preferBaseUrl) return cur
    return prev
  })
}

async function probeOpenAIModels(
  baseUrl: string,
  apiKey: string,
  fetchFn: typeof globalThis.fetch,
): Promise<OpenAIModelsProbe> {
  try {
    const response = await fetchFn(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const bodyPreview = response.ok
      ? undefined
      : (await response.text().catch(() => '')).slice(0, 200)

    return { baseUrl, ok: response.ok, status: response.status, bodyPreview }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    return { baseUrl, ok: false, status: -1, error: msg }
  }
}

/**
 * 探测 OpenAI 兼容服务 Base URL（/models 与 /v1/models）
 *
 * @param baseUrl 用户输入的 Base URL（可能带/不带 /v1）
 * @param apiKey API Key（用于鉴权，401 也能用来判断 endpoint 存在）
 * @param fetchFn 可注入 fetch（默认使用全局 fetch）
 */
export async function probeOpenAICompatibleModelsBaseUrl(options: {
  baseUrl: string
  apiKey: string
  fetchFn?: typeof globalThis.fetch
}): Promise<OpenAIModelsProbeResult> {
  const { baseUrl, apiKey, fetchFn = fetch } = options
  const baseNoV1 = normalizeBaseUrl(baseUrl)
  const baseV1 = normalizeOpenAIBaseUrl(baseUrl)

  const candidates = Array.from(new Set([baseNoV1, baseV1]))
  const probes = await Promise.all(candidates.map((b) => probeOpenAIModels(b, apiKey, fetchFn)))

  // 同分时优先 /v1（baseV1）
  const best = chooseBestOpenAIModelsProbe(probes, baseV1)

  return {
    probes,
    best,
    resolvedBaseUrl: best.baseUrl,
  }
}

