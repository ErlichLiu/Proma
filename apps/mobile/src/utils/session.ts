// ===== 对话创建 + 活跃对话持久化（统一从 Drawer/ConvDropdown 提取）=====

import type { ConvItem } from '../atoms'
import { wsReq } from '../lib/ws-client'
import { STORAGE_KEYS, writeStorage } from './storage'

export function saveActiveConv(conv: ConvItem): void {
  writeStorage(STORAGE_KEYS.activeConv, conv)
}

export async function createAgentConversation(
  token: string,
  workspaceId?: string,
): Promise<ConvItem> {
  const data: Record<string, string> = { token }
  if (workspaceId) data.workspaceId = workspaceId
  const r = await wsReq('agent.session.create', data) as any
  const session = r.session
  return {
    id: session.id,
    title: session.title || '新对话',
    type: 'agent',
    workspaceId,
    updatedAt: Date.now(),
  }
}
