/**
 * Chat → Agent 迁移服务
 *
 * 负责将 Chat 对话上下文迁移到新的 Agent 会话。
 * 核心流程：读取对话历史 → 过滤有效消息 → 创建 Agent 会话 → 逐条保存历史 → 返回会话
 */

import type { MigrateToAgentInput, MigrateToAgentResult, ChatMessage, AgentMessage } from '@proma/shared'
import { listConversations, getConversationMessages } from './conversation-manager'
import { createAgentSession, appendAgentMessage } from './agent-session-manager'
import { listAgentWorkspaces, ensureDefaultWorkspace } from './agent-workspace-manager'
import { randomUUID } from 'node:crypto'

/**
 * 过滤有效消息
 *
 * - 使用 contextDividers 只取最后一段有效上下文
 * - 过滤掉 stopped 的不完整消息
 * - 只保留 user/assistant 消息
 */
function filterValidMessages(
  messages: ChatMessage[],
  contextDividers?: string[],
): ChatMessage[] {
  let filtered = messages

  // 按 contextDivider 截取：只取最后一个分隔线之后的消息
  if (contextDividers && contextDividers.length > 0) {
    const lastDividerId = contextDividers[contextDividers.length - 1]
    const dividerIndex = filtered.findIndex(m => m.id === lastDividerId)
    if (dividerIndex >= 0) {
      filtered = filtered.slice(dividerIndex + 1)
    }
  }

  // 过滤 stopped 消息和 system 消息
  return filtered.filter(m => m.role !== 'system' && !m.stopped)
}

/**
 * 确定目标工作区 ID
 *
 * 优先使用已有工作区，无工作区时自动创建默认工作区
 */
function resolveWorkspaceId(): string {
  const workspaces = listAgentWorkspaces()
  if (workspaces.length > 0) {
    return workspaces[0]!.id
  }

  // 无工作区时确保默认工作区存在
  const defaultWs = ensureDefaultWorkspace()
  return defaultWs.id
}

/**
 * 将 Chat 消息转换为 Agent 消息
 */
function convertChatMessageToAgent(msg: ChatMessage): AgentMessage | null {
  // 只保留 user 和 assistant 消息
  if (msg.role !== 'user' && msg.role !== 'assistant') {
    return null
  }

  let content = msg.content

  // 附件信息转为文本描述
  if (msg.attachments && msg.attachments.length > 0) {
    const attachmentDesc = msg.attachments
      .map(a => `[附件: ${a.filename}]`)
      .join(' ')
    content = `${attachmentDesc}\n${content}`
  }

  return {
    id: randomUUID(),
    role: msg.role,
    content,
    createdAt: msg.createdAt,
    model: msg.model,
  }
}

/**
 * 将 Chat 历史逐条保存到 Agent 会话
 */
function migrateHistoryToAgent(sessionId: string, messages: ChatMessage[]): void {
  for (const msg of messages) {
    const agentMsg = convertChatMessageToAgent(msg)
    if (agentMsg) {
      appendAgentMessage(sessionId, agentMsg)
    }
  }
}

/**
 * 执行 Chat → Agent 迁移
 *
 * 1. 读取对话元数据和消息
 * 2. 过滤有效上下文（contextDividers + stopped）
 * 3. 创建 Agent 会话
 * 4. 将历史消息逐条保存到 Agent 会话
 * 5. 返回迁移结果
 */
export async function migrateToAgent(
  input: MigrateToAgentInput,
): Promise<MigrateToAgentResult> {
  const { conversationId, taskSummary } = input

  // 1. 读取对话元数据
  const conversations = listConversations()
  const meta = conversations.find(c => c.id === conversationId)
  if (!meta) {
    throw new Error(`对话不存在: ${conversationId}`)
  }

  // 2. 读取并过滤消息
  const allMessages = getConversationMessages(conversationId)
  const validMessages = filterValidMessages(allMessages, meta.contextDividers)

  if (validMessages.length === 0) {
    throw new Error('对话中没有可迁移的消息')
  }

  // 3. 确定工作区
  const workspaceId = input.workspaceId || resolveWorkspaceId()

  // 4. 确定渠道（优先使用指定的，其次继承 Chat 的）
  const channelId = input.channelId || meta.channelId

  // 5. 创建 Agent 会话
  const title = meta.title || '从 Chat 迁移的任务'
  const session = createAgentSession(title, channelId, workspaceId)

  // 6. 将 Chat 历史逐条保存到 Agent 会话
  migrateHistoryToAgent(session.id, validMessages)

  // 7. 构建用户继续对话的提示
  const followUpPrompt = taskSummary
    ? taskSummary
    : '请继续上面的对话，帮我完成这个任务。'

  console.log(`[迁移] Chat ${conversationId} → Agent ${session.id}，迁移消息 ${validMessages.length} 条`)

  return {
    sessionId: session.id,
    contextPrompt: followUpPrompt,
    title: session.title,
  }
}
