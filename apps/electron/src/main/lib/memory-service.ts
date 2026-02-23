/**
 * 全局记忆配置服务
 *
 * 管理 MemOS Cloud 记忆配置的读写。
 * 存储在 ~/.proma/memory.json（全局共享，不再按工作区隔离）
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getMemoryConfigPath, getAgentWorkspacesDir } from './config-paths'
import type { MemoryConfig } from '@proma/shared'

/** 默认记忆配置 */
const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: false,
  apiKey: '',
  userId: '',
}

/**
 * 获取全局记忆配置
 *
 * 首次读取时，尝试从旧的工作区配置迁移。
 */
export function getMemoryConfig(): MemoryConfig {
  const filePath = getMemoryConfigPath()

  if (!existsSync(filePath)) {
    // 尝试从旧的工作区配置迁移
    const migrated = migrateFromWorkspaceConfig()
    if (migrated) {
      try {
        writeFileSync(filePath, JSON.stringify(migrated, null, 2), 'utf-8')
        console.log('[记忆服务] 已从工作区配置迁移到全局配置')
      } catch {
        // 写入失败不影响返回
      }
      return migrated
    }
    return { ...DEFAULT_MEMORY_CONFIG }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Partial<MemoryConfig>
    return {
      enabled: data.enabled ?? false,
      apiKey: data.apiKey ?? '',
      userId: data.userId ?? '',
      baseUrl: data.baseUrl,
    }
  } catch (error) {
    console.error('[记忆服务] 读取配置失败:', error)
    return { ...DEFAULT_MEMORY_CONFIG }
  }
}

/**
 * 保存全局记忆配置
 */
export function setMemoryConfig(config: MemoryConfig): void {
  const filePath = getMemoryConfigPath()
  try {
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`[记忆服务] 配置已更新 (enabled: ${config.enabled})`)
  } catch (error) {
    console.error('[记忆服务] 保存配置失败:', error)
    throw new Error('保存记忆配置失败')
  }
}

/**
 * 从旧的工作区配置迁移
 *
 * 扫描所有工作区的 config.json，找到第一个有效的 memory 配置并迁移。
 */
function migrateFromWorkspaceConfig(): MemoryConfig | null {
  try {
    const wsDir = getAgentWorkspacesDir()
    if (!existsSync(wsDir)) return null

    const entries = readdirSync(wsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const configPath = join(wsDir, entry.name, 'config.json')
      if (!existsSync(configPath)) continue

      try {
        const raw = readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw) as { memory?: MemoryConfig }
        if (config.memory && config.memory.apiKey) {
          return config.memory
        }
      } catch {
        continue
      }
    }
  } catch {
    // 迁移失败不影响正常流程
  }
  return null
}
