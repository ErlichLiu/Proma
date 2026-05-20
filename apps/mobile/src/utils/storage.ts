// ===== localStorage 统一 key 管理 =====

const PREFIX = 'proma_mobile_'

export const STORAGE_KEYS = {
  token: PREFIX + 'token',
  host: PREFIX + 'host',
  port: PREFIX + 'port',
  activeConv: PREFIX + 'active_conv',
  view: PREFIX + 'view',
} as const

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function removeStorage(key: string): void {
  localStorage.removeItem(key)
}
