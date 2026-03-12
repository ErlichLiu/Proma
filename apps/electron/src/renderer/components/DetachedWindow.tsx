/**
 * DetachedWindow — 分离标签页的独立窗口视图
 *
 * 通过 URL 查询参数获取 type / sessionId，
 * 直接渲染对应的 ChatView 或 AgentView，不显示 TabBar 和侧边栏。
 */

import * as React from 'react'
import { TooltipProvider } from './ui/tooltip'
import { ChatView } from './chat/ChatView'
import { AgentView } from './agent/AgentView'

interface DetachedParams {
  type: string
  sessionId: string
  title: string
}

function parseDetachedParams(): DetachedParams | null {
  const params = new URLSearchParams(window.location.search)
  const type = params.get('type')
  const sessionId = params.get('sessionId')
  const title = params.get('title') ?? ''

  if (!type || !sessionId) return null
  return { type, sessionId, title }
}

export function DetachedWindow(): React.ReactElement {
  const params = React.useMemo(parseDetachedParams, [])

  if (!params) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        无效的窗口参数
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-screen bg-background">
        {/* macOS 标题栏拖拽区域 */}
        <div className="h-[34px] shrink-0 titlebar-drag-region flex items-center justify-center">
          <span className="text-xs text-muted-foreground select-none">{params.title}</span>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-h-0">
          {params.type === 'chat' ? (
            <ChatView conversationId={params.sessionId} />
          ) : (
            <AgentView sessionId={params.sessionId} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
