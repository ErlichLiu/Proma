/**
 * AppShell - 应用主布局容器
 *
 * 布局结构：[LeftSidebar 可折叠] | [MainArea: TabBar + TabContent] | [RightSidePanel 可折叠]
 *
 * MainArea 支持多标签页，Settings 视图为独立覆盖。
 */

import * as React from 'react'
import { useAtomValue, useAtom } from 'jotai'
import { LeftSidebar } from './LeftSidebar'
import { RightSidePanel } from './RightSidePanel'
import { MainArea } from '@/components/tabs/MainArea'
import { AppShellProvider, type AppShellContextType } from '@/contexts/AppShellContext'
import { appModeAtom } from '@/atoms/app-mode'
import { currentAgentSessionIdAtom, currentSessionSidePanelOpenAtom } from '@/atoms/agent-atoms'
import { sidebarCollapsedAtom } from '@/atoms/tab-atoms'
import { cn } from '@/lib/utils'

export interface AppShellProps {
  /** Context 值，用于传递给子组件 */
  contextValue: AppShellContextType
}

export function AppShell({ contextValue }: AppShellProps): React.ReactElement {
  const appMode = useAtomValue(appModeAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const isPanelOpen = useAtomValue(currentSessionSidePanelOpenAtom)
  const [sidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const showRightPanel = appMode === 'agent' && !!currentSessionId

  // 可拖拽调整左侧栏宽度（localStorage 持久化）
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    try {
      const saved = localStorage.getItem('proma-sidebar-width')
      if (saved) { const n = parseInt(saved, 10); if (n >= 200 && n <= 520) return n }
    } catch {}
    return appMode === 'agent' ? 420 : 280
  })
  const isResizingRef = React.useRef(false)

  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      setSidebarWidth((w) => {
        const next = Math.min(520, Math.max(200, w + e.movementX))
        try { localStorage.setItem('proma-sidebar-width', String(next)) } catch {}
        return next
      })
    }
    const handleUp = () => {
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [])

  return (
    <AppShellProvider value={contextValue}>
      {/* 可拖动标题栏区域，用于窗口拖动 */}
      <div className="titlebar-drag-region fixed top-0 left-0 right-0 h-[50px] z-50" />

      <div className="shell-bg h-screen w-screen flex overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
        {/* 左侧边栏：可折叠 + 可拖拽宽度 + 带圆角和内边距 */}
        <div
          className="p-2 pr-0 relative z-[60] flex-shrink-0 overflow-hidden"
          style={sidebarCollapsed ? { width: 56 } : { width: sidebarWidth + 8 }}
        >
          <LeftSidebar width={sidebarCollapsed ? 48 : sidebarWidth} />
          {/* 拖拽手柄 — 仅展开状态显示 */}
          {!sidebarCollapsed && (
            <div
              className="absolute right-0 top-8 bottom-8 w-[5px] cursor-col-resize z-50 opacity-0 hover:opacity-100 transition-opacity bg-primary/20 hover:bg-primary/40 rounded-full"
              onMouseDown={(e) => {
                e.preventDefault()
                isResizingRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            />
          )}
        </div>

        {/* 中间容器：relative z-[60] 使其在 z-50 拖动区域之上 */}
        <div className="flex-1 min-w-0 p-2 relative z-[60]">
          {/* 主内容区域（TabBar + TabContent） */}
          <MainArea />
        </div>

        {/* 右侧边栏：Agent 文件面板，带圆角和内边距 */}
        {showRightPanel && (
          <div className={cn('relative z-[60] transition-[padding] duration-300 ease-in-out', isPanelOpen ? 'p-2 pl-0' : 'p-0')}>
            <RightSidePanel />
          </div>
        )}
      </div>
    </AppShellProvider>
  )
}
