/**
 * LAN Bridge 认证管理
 *
 * PIN 码 + HMAC-SHA256 Token 认证。
 * PIN 在服务启动时生成，Token 绑定客户端 IP，24h 有效。
 */

import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from '../config-paths'

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
const PIN_LENGTH = 6

/** Token payload 结构 */
interface TokenPayload {
  /** 签发时间 (ms) */
  iat: number
  /** 绑定的客户端 IP */
  ip: string
}

let currentPin = ''
let hmacKey = ''

/** 初始化认证：生成 PIN 和 HMAC 密钥 */
export function initAuth(): string {
  currentPin = generatePin()
  hmacKey = randomBytes(32).toString('hex')
  console.log(`[LAN Bridge] PIN 码: ${currentPin}`)
  try { writeFileSync(join(getConfigDir(), 'lan-bridge-pin.txt'), currentPin) } catch {}
  return currentPin
}

/** 获取当前 PIN 码 */
export function getCurrentPin(): string {
  return currentPin
}

/** 刷新 PIN 码 */
export function refreshPin(): string {
  currentPin = generatePin()
  console.log(`[LAN Bridge] PIN 码已刷新: ${currentPin}`)
  return currentPin
}

/** 验证 PIN 码 */
export function verifyPin(pin: string): boolean {
  const a = Buffer.from(pin)
  const b = Buffer.from(currentPin)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 生成 Token */
export function generateToken(ip: string): { token: string; expiresIn: number } {
  const payload: TokenPayload = { iat: Date.now(), ip }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(payloadB64)
  return {
    token: `${payloadB64}.${signature}`,
    expiresIn: TOKEN_EXPIRY_MS,
  }
}

/** 验证 Token，返回是否有效 */
export function verifyToken(token: string, ip: string): boolean {
  try {
    const [payloadB64, signature] = token.split('.')
    if (!payloadB64 || !signature) return false

    // 验证签名
    const expectedSig = sign(payloadB64)
    const sigBuf = Buffer.from(signature)
    const expectBuf = Buffer.from(expectedSig)
    if (sigBuf.length !== expectBuf.length) return false
    if (!timingSafeEqual(sigBuf, expectBuf)) return false

    // 解析 payload
    const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))

    // 检查过期
    if (Date.now() - payload.iat > TOKEN_EXPIRY_MS) return false

    // 检查 IP 绑定
    if (payload.ip !== ip) return false

    return true
  } catch {
    return false
  }
}

/** 刷新 Token（验证旧 Token 后签发新的） */
export function refreshToken(token: string, ip: string): { token: string; expiresIn: number } | null {
  if (!verifyToken(token, ip)) return null
  return generateToken(ip)
}

// ===== 内部工具 =====

function generatePin(): string {
  const digits = '0123456789'
  let pin = ''
  const bytes = randomBytes(PIN_LENGTH)
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += digits[bytes[i]! % digits.length]
  }
  return pin
}

function sign(data: string): string {
  return createHmac('sha256', hmacKey).update(data).digest('base64url')
}
