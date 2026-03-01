/**
 * useMigrateToAgent — Chat → Agent 迁移 Hook
 *
 * 封装完整迁移流程：IPC 调用 → 刷新会话列表 → 设置 pending prompt → 切换模式
 */

import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import type { MigrateToAgentInput } from '@proma/shared'
import { appModeAtom } from '@/atoms/app-mode'
import { migratingToAgentAtom, selectedModelAtom } from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentPendingPromptAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'

interface UseMigrateToAgentReturn {
  /** 执行迁移 */
  migrate: (input: Omit<MigrateToAgentInput, 'conversationId'> & { conversationId: string }) => Promise<void>
  /** 是否正在迁移中 */
  migrating: boolean
}

export function useMigrateToAgent(): UseMigrateToAgentReturn {
  const [migrating, setMigrating] = useAtom(migratingToAgentAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setPendingPrompt = useSetAtom(agentPendingPromptAtom)
  const setAppMode = useSetAtom(appModeAtom)
  const setAgentChannelId = useSetAtom(agentChannelIdAtom)
  const setAgentModelId = useSetAtom(agentModelIdAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)

  const migrate = async (input: MigrateToAgentInput): Promise<void> => {
    if (migrating) return

    setMigrating(true)
    try {
      // 1. 调用主进程迁移服务（使用当前选中的工作区）
      const result = await window.electronAPI.migrateToAgent({
        ...input,
        workspaceId: currentWorkspaceId ?? undefined,
      })

      // 2. 刷新 Agent 会话列表
      const sessions = await window.electronAPI.listAgentSessions()
      setAgentSessions(sessions)

      // 3. 设置当前会话
      setCurrentSessionId(result.sessionId)

      // 4. 如果没有配置 Agent 渠道，使用 Chat 的渠道作为 fallback
      // 这样 AgentView 的 pending prompt 自动发送逻辑才能正常工作
      const { agentChannelId, agentModelId } = await window.electronAPI.getSettings()
      if (!agentChannelId && selectedModel) {
        setAgentChannelId(selectedModel.channelId)
        setAgentModelId(selectedModel.modelId)
      }

      // 5. 写入 pending prompt（AgentView 自动发送）
      setPendingPrompt({
        sessionId: result.sessionId,
        message: result.contextPrompt,
      })

      // 6. 切换到 Agent 模式
      setAppMode('agent')

      toast.success('已切换到 Agent 模式')
    } catch (error) {
      const msg = error instanceof Error ? error.message : '迁移失败'
      toast.error(msg)
    } finally {
      setMigrating(false)
    }
  }

  return { migrate, migrating }
}
