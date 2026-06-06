/**
 * Thinking 参数代理服务
 *
 * 在本地起一个 HTTP 代理服务器，拦截 CLI → API 的请求，
 * 将 thinking.type="adaptive" 替换为 thinking.type="enabled" + budget_tokens。
 *
 * 用于 anthropic-compatible 渠道（讯飞等兼容端点不支持 adaptive thinking），
 * 这些端点只接受 {type:"enabled", budget_tokens:N} 格式。
 *
 * 架构：
 *   CLI → localhost:PORT (本地代理) → 替换 thinking 参数 → 实际 API 端点
 *                                                      ↓ (如需)
 *                                                  Clash TUN 代理
 *
 * 多会话安全：
 *   使用引用计数管理代理生命周期。只有第一个会话启动代理，最后一个会话结束才关闭。
 *   config（targetBaseUrl / budgetTokens）按请求动态查找，不同会话可以有不同的配置。
 *
 * Clash TUN 兼容：
 *   CLI 连 127.0.0.1:PORT → 走本地回环，TUN 不劫持
 *   代理向外转发时：走 Proma 配置的代理（getEffectiveProxyUrl）或直连
 *   CLI 的 HTTPS_PROXY 不再生效（CLI 只和本地代理通信），代理自行管理出站代理
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { AddressInfo } from 'node:net'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { getEffectiveProxyUrl } from './proxy-settings-service'

/** 代理配置 */
export interface ThinkingProxyConfig {
  /** 实际 API 端点 URL（讯飞等兼容端点） */
  targetBaseUrl: string
  /** thinking token 预算，默认 16384 */
  budgetTokens: number
}

// 代理服务器实例（单例，多会话共享）
let proxyServer: Server | null = null
let proxyPort: number | null = null

// 引用计数：多会话并发时，只有最后一个会话结束才关闭代理
let refCount = 0

// 按 sessionId 存储每个会话的代理配置，请求时按来源查找
const sessionConfigs = new Map<string, ThinkingProxyConfig>()

/**
 * 启动 thinking 代理服务器（引用计数管理）
 *
 * @returns 本地代理 URL（如 http://127.0.0.1:34567）
 */
export async function startThinkingProxy(sessionId: string, config: ThinkingProxyConfig): Promise<string> {
  sessionConfigs.set(sessionId, config)
  refCount++

  if (proxyServer && proxyPort) {
    console.log(`[Thinking Proxy] 会话 ${sessionId} 复用代理 (refCount=${refCount})`)
    return `http://127.0.0.1:${proxyPort}`
  }

  proxyServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await handleProxyRequest(req, res)
    } catch (err) {
      console.error('[Thinking Proxy] 请求处理失败:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
      }
      res.end('Thinking proxy error')
    }
  })

  proxyPort = await new Promise<number>((resolve, reject) => {
    proxyServer!.listen(0, '127.0.0.1', () => {
      const addr = proxyServer!.address() as AddressInfo
      console.log(`[Thinking Proxy] 代理服务器启动，端口: ${addr.port}`)
      resolve(addr.port)
    })
    proxyServer!.on('error', reject)
  })

  return `http://127.0.0.1:${proxyPort}`
}

/**
 * 停止 thinking 代理（引用计数管理）
 *
 * 只有最后一个会话结束时才真正关闭代理服务器。
 */
export async function stopThinkingProxy(sessionId: string): Promise<void> {
  sessionConfigs.delete(sessionId)
  refCount = Math.max(0, refCount - 1)

  if (refCount > 0) {
    console.log(`[Thinking Proxy] 会话 ${sessionId} 释放代理引用 (refCount=${refCount})，代理保持运行`)
    return
  }

  // 引用计数归零，关闭代理
  if (proxyServer) {
    await new Promise<void>((resolve) => {
      proxyServer!.close(() => {
        console.log('[Thinking Proxy] 代理服务器已关闭（无活跃会话）')
        resolve()
      })
    })
    proxyServer = null
    proxyPort = null
  }
}

/**
 * 强制关闭代理（应用退出时调用）
 */
export async function forceStopThinkingProxy(): Promise<void> {
  sessionConfigs.clear()
  refCount = 0
  if (proxyServer) {
    await new Promise<void>((resolve) => {
      proxyServer!.close(() => {
        console.log('[Thinking Proxy] 代理服务器已强制关闭')
        resolve()
      })
    })
    proxyServer = null
    proxyPort = null
  }
}

/**
 * 处理代理请求
 */
async function handleProxyRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 查找匹配的会话配置
  // CLI 发请求时会带上原始请求头，通过 authorization 头关联到会话
  // 由于多会话可能共用同一个代理，需要根据请求特征找到正确的 config
  // 简化策略：所有 isCompatThinking 会话的 targetBaseUrl 通常相同（同一个讯飞端点），
  // 取任意一个存活的 config 即可。如果不同会话有不同的端点，需要更精确的路由。
  const config = sessionConfigs.values().next().value as ThinkingProxyConfig | undefined
  if (!config) {
    res.writeHead(500)
    res.end('No proxy config')
    return
  }

  // 1. 收集请求体
  const bodyChunks: Buffer[] = []
  for await (const chunk of req) {
    bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const rawBody = Buffer.concat(bodyChunks).toString('utf-8')

  // 2. 转换 thinking 参数：adaptive → enabled + budget_tokens
  let modifiedBody = rawBody
  if (rawBody.includes('"adaptive"')) {
    modifiedBody = rawBody.replace(
      /"type"\s*:\s*"adaptive"/g,
      `"type":"enabled","budget_tokens":${config.budgetTokens}`,
    )
    // 移除 thinking 对象内的 display 字段（兼容端点可能不支持）
    modifiedBody = modifiedBody.replace(
      /"thinking"\s*:\s*\{[^}]*"type"\s*:\s*"enabled"[^}]*"display"\s*:\s*"[^"]*"[^}]*\}/g,
      (match) => match.replace(/,?\s*"display"\s*:\s*"[^"]*"/g, ''),
    )
    console.log(`[Thinking Proxy] 替换 thinking: adaptive → enabled (budget_tokens=${config.budgetTokens})`)
  }

  // 3. 构建转发目标 URL
  // req.url 可能是相对路径（/v1/messages）或完整 URL（http://127.0.0.1:PORT/v1/messages）
  // 提取 pathname + search，直接拼接到 targetBaseUrl 末尾
  // 不能用 new URL(pathname, base) 因为绝对路径会覆盖 base 的路径部分
  const reqUrl = new URL(req.url || '/', 'http://localhost')
  const targetUrlStr = config.targetBaseUrl.replace(/\/+$/, '') + reqUrl.pathname + reqUrl.search
  const targetUrl = new URL(targetUrlStr)

  // 4. 构建转发请求头
  const forwardHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value && key.toLowerCase() !== 'host' && key.toLowerCase() !== 'connection') {
      forwardHeaders[key] = Array.isArray(value) ? value.join(', ') : value
    }
  }
  forwardHeaders['content-length'] = String(Buffer.byteLength(modifiedBody))
  forwardHeaders['host'] = targetUrl.host

  // 5. 转发请求
  // 代理需要自行管理出站代理：CLI 的 HTTPS_PROXY 对本地代理无效
  const proxyUrl = await getEffectiveProxyUrl()
  const isHttps = targetUrl.protocol === 'https:'

  if (proxyUrl && isHttps) {
    await forwardWithUndiciProxy(targetUrl, forwardHeaders, modifiedBody, req.method!, proxyUrl, res)
  } else if (proxyUrl && !isHttps) {
    const proxyOptions = {
      method: req.method!,
      hostname: new URL(proxyUrl).hostname,
      port: new URL(proxyUrl).port,
      path: targetUrl.href,
      headers: forwardHeaders,
    }
    const proxyReq = httpRequest(proxyOptions, (proxyRes) => {
      pipeResponse(proxyRes, res)
    })
    proxyReq.on('error', (err) => {
      console.error('[Thinking Proxy] HTTP 代理转发失败:', err)
      if (!res.headersSent) res.writeHead(502)
      res.end('Proxy forward error')
    })
    proxyReq.write(modifiedBody)
    proxyReq.end()
  } else {
    const requestFn = isHttps ? httpsRequest : httpRequest
    const directOptions = {
      method: req.method!,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? '443' : '80'),
      path: targetUrl.pathname + targetUrl.search,
      headers: forwardHeaders,
    }
    const directReq = requestFn(directOptions, (directRes) => {
      pipeResponse(directRes, res)
    })
    directReq.on('error', (err) => {
      console.error('[Thinking Proxy] 直连转发失败:', err)
      if (!res.headersSent) res.writeHead(502)
      res.end('Direct forward error')
    })
    directReq.write(modifiedBody)
    directReq.end()
  }
}

/**
 * 使用 undici ProxyAgent 转发 HTTPS 请求（支持 Clash TUN HTTP CONNECT）
 */
async function forwardWithUndiciProxy(
  targetUrl: URL,
  headers: Record<string, string>,
  body: string,
  method: string,
  proxyUrl: string,
  clientRes: ServerResponse,
): Promise<void> {
  const dispatcher = new ProxyAgent(proxyUrl)
  try {
    const response = await undiciFetch(targetUrl.href, {
      method,
      headers,
      body,
      dispatcher,
    })

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    // 删除 transfer-encoding 和 content-length，让 Node.js 自动处理 chunked 编码
    delete responseHeaders['transfer-encoding']
    delete responseHeaders['content-length']

    clientRes.writeHead(response.status, responseHeaders)

    // 管道透传响应体（SSE 流）
    if (response.body) {
      const reader = response.body.getReader()
      let aborted = false
      // 客户端断开时中止读取，避免无限循环
      clientRes.on('close', () => { aborted = true })
      try {
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          clientRes.write(value)
        }
      } finally {
        reader.releaseLock()
      }
    }
    clientRes.end()
  } catch (err) {
    console.error('[Thinking Proxy] undici 代理转发失败:', err)
    if (!clientRes.headersSent) clientRes.writeHead(502)
    clientRes.end('Proxy forward error')
  }
}

/**
 * 管道透传响应（node:http/https 模块的 response）
 */
function pipeResponse(proxyRes: IncomingMessage, clientRes: ServerResponse): void {
  const responseHeaders: Record<string, string | string[]> = {}
  const hopByHop = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade']
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (!hopByHop.includes(key.toLowerCase()) && value) {
      responseHeaders[key] = value
    }
  }
  clientRes.writeHead(proxyRes.statusCode!, responseHeaders)
  proxyRes.pipe(clientRes)
}