/**
 * MigrationSuggestionCard - Agent 模式迁移建议卡片
 *
 * 当 LLM 调用 suggest_agent_mode 工具时，在消息流末尾显示此卡片。
 * 用户可以接受（迁移到 Agent）或关闭建议。
 */

import * as React from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Bot, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentAgentModeSuggestionAtom, agentModeSuggestionsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import { useMigrateToAgent } from '@/hooks/useMigrateToAgent'

export function MigrationSuggestionCard(): React.ReactElement | null {
  const suggestion = useAtomValue(currentAgentModeSuggestionAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const setAgentModeSuggestions = useSetAtom(agentModeSuggestionsAtom)
  const { migrate, migrating } = useMigrateToAgent()

  if (!suggestion || !currentConversationId) return null

  /** 关闭建议 */
  const dismiss = (): void => {
    setAgentModeSuggestions((prev) => {
      const map = new Map(prev)
      map.delete(currentConversationId)
      return map
    })
  }

  /** 接受建议，执行迁移 */
  const accept = (): void => {
    migrate({
      conversationId: currentConversationId,
      taskSummary: suggestion.taskSummary,
    })
    dismiss()
  }

  return (
    <div className="mx-4 mb-3 p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-lg bg-primary/10">
          <Bot className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">建议切换到 Agent 模式</p>
          <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="关闭建议"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-10">
        <Button
          size="sm"
          onClick={accept}
          disabled={migrating}
          className="h-7 text-xs"
        >
          切换到 Agent 模式
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="h-7 text-xs text-muted-foreground"
        >
          不需要
        </Button>
      </div>
    </div>
  )
}
