/**
 * Agent Profile 服务
 *
 * 管理全局 Agent Profile 的 CRUD 操作。
 * 存储在 ~/.proma/agents.json
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { getAgentProfilesPath, getAgentProfilePluginDir } from './config-paths.ts'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
} from '@proma/shared'

/** 预置通用助手 Agent 的固定 ID */
const BUILTIN_AGENT_ID = 'builtin-general-assistant'

/** 创建预置通用助手 Agent */
function createBuiltinAgent(): AgentProfile {
  const now = Date.now()
  return {
    id: BUILTIN_AGENT_ID,
    name: '通用助手',
    description: '通用 AI 助手，适用于各类任务',
    icon: '🤖',
    isBuiltin: true,
    enabledMcpServers: [],
    enabledSkills: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** 读取所有 Agent Profile */
function readProfiles(): AgentProfile[] {
  const filePath = getAgentProfilesPath()
  if (!existsSync(filePath)) return []
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as AgentProfile[]
  } catch {
    console.error('[Agent Profile] 读取 agents.json 失败')
    return []
  }
}

/** 写入所有 Agent Profile */
function writeProfiles(profiles: AgentProfile[]): void {
  const filePath = getAgentProfilesPath()
  writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf-8')
}

/**
 * 初始化 Agent Profile 存储
 * 确保预置通用助手 Agent 存在
 */
export function initAgentProfiles(): void {
  const profiles = readProfiles()
  const hasBuiltin = profiles.some((p) => p.isBuiltin)
  if (!hasBuiltin) {
    profiles.unshift(createBuiltinAgent())
    writeProfiles(profiles)
    console.log('[Agent Profile] 已创建预置通用助手 Agent')
  }
}

/** 获取所有 Agent Profile */
export function listAgentProfiles(): AgentProfile[] {
  const profiles = readProfiles()
  // 确保预置 Agent 始终排在最前
  return profiles.sort((a, b) => {
    if (a.isBuiltin && !b.isBuiltin) return -1
    if (!a.isBuiltin && b.isBuiltin) return 1
    return 0
  })
}

/** 获取单个 Agent Profile */
export function getAgentProfile(id: string): AgentProfile | null {
  const profiles = readProfiles()
  return profiles.find((p) => p.id === id) ?? null
}

/** 创建 Agent Profile */
export function createAgentProfile(input: AgentProfileCreateInput): AgentProfile {
  const profiles = readProfiles()
  const now = Date.now()
  const profile: AgentProfile = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    icon: input.icon,
    defaultChannelId: input.defaultChannelId,
    defaultModelId: input.defaultModelId,
    thinking: input.thinking,
    effort: input.effort,
    maxBudgetUsd: input.maxBudgetUsd,
    maxTurns: input.maxTurns,
    enabledMcpServers: input.enabledMcpServers ?? [],
    enabledSkills: input.enabledSkills ?? [],
    additionalPrompt: input.additionalPrompt,
    defaultWorkspaceId: input.defaultWorkspaceId,
    createdAt: now,
    updatedAt: now,
  }
  profiles.push(profile)
  writeProfiles(profiles)
  console.log(`[Agent Profile] 已创建: ${profile.name} (${profile.id})`)
  return profile
}

/** 更新 Agent Profile */
export function updateAgentProfile(id: string, input: AgentProfileUpdateInput): AgentProfile | null {
  const profiles = readProfiles()
  const index = profiles.findIndex((p) => p.id === id)
  if (index === -1) return null

  const existing = profiles[index]!
  const updated: AgentProfile = {
    ...existing,
    ...input,
    id: existing.id,
    name: input.name ?? existing.name,
    isBuiltin: existing.isBuiltin,
    createdAt: existing.createdAt,
    enabledMcpServers: input.enabledMcpServers ?? existing.enabledMcpServers,
    enabledSkills: input.enabledSkills ?? existing.enabledSkills,
    updatedAt: Date.now(),
  }
  profiles[index] = updated
  writeProfiles(profiles)
  console.log(`[Agent Profile] 已更新: ${updated.name} (${updated.id})`)
  return updated
}

/** 删除 Agent Profile（预置 Agent 不可删除） */
export function deleteAgentProfile(id: string): boolean {
  const profiles = readProfiles()
  const target = profiles.find((p) => p.id === id)
  if (!target) return false
  if (target.isBuiltin) {
    console.warn('[Agent Profile] 预置 Agent 不可删除')
    return false
  }
  const filtered = profiles.filter((p) => p.id !== id)
  writeProfiles(filtered)
  // 清理临时 plugin 目录
  const pluginDir = getAgentProfilePluginDir(id)
  if (existsSync(pluginDir)) {
    rmSync(pluginDir, { recursive: true, force: true })
  }
  console.log(`[Agent Profile] 已删除: ${target.name} (${id})`)
  return true
}
