/**
 * TabBar — 顶部标签栏
 *
 * 显示所有打开的标签页，支持：
 * - 点击切换标签
 * - 中键关闭标签
 * - 拖拽重排序
 * - Chrome 风格等分宽度（溢出时可横向滚动）
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import {
  tabsAtom,
  activeTabIdAtom,
  tabIndicatorMapAtom,
  SCRATCH_PAD_ID,
  reorderTabs,
} from '@/atoms/tab-atoms'
import type { TabItem } from '@/atoms/tab-atoms'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'
import { conversationsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
  unviewedCompletedSessionIdsAtom,
} from '@/atoms/agent-atoms'
import { appModeAtom } from '@/atoms/app-mode'
import { automationFormAtom } from '@/atoms/automation-atoms'
import { TabBarItem } from './TabBarItem'
import { useCloseTab } from '@/hooks/useCloseTab'
import { detectIsWindows } from '@/lib/platform'
import { cn } from '@/lib/utils'

export function TabBar(): React.ReactElement {
  const [tabs, setTabs] = useAtom(tabsAtom)
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom)
  const indicatorMap = useAtomValue(tabIndicatorMapAtom)
  const store = useStore()

  // Tab 切换时同步 sidebar 状态
  const appMode = useAtomValue(appModeAtom)
  const setAppMode = useSetAtom(appModeAtom)
  const setCurrentConversationId = useSetAtom(currentConversationIdAtom)
  const setCurrentAgentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setConversations = useSetAtom(conversationsAtom)
  const agentWorkspaces = useAtomValue(agentWorkspacesAtom)
  const setCurrentAgentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const setUnviewedCompleted = useSetAtom(unviewedCompletedSessionIdsAtom)
  const setAutomationForm = useSetAtom(automationFormAtom)

  // 统一关闭逻辑：关闭当前会话入口并回到 Scratch Pad，不停止后台 Agent
  const { requestClose } = useCloseTab()

  const workspaceNameBySessionId = React.useMemo(() => {
    const workspaceNameMap = new Map(agentWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    const sessionWorkspaceNameMap = new Map<string, string>()
    for (const session of agentSessions) {
      if (!session.workspaceId) continue
      const workspaceName = workspaceNameMap.get(session.workspaceId)
      if (workspaceName) sessionWorkspaceNameMap.set(session.id, workspaceName)
    }
    return sessionWorkspaceNameMap
  }, [agentSessions, agentWorkspaces])

  const automationSessionIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const s of agentSessions) {
      if (s.sourceAutomationId) ids.add(s.id)
    }
    return ids
  }, [agentSessions])

  // 拖拽状态
  const dragState = React.useRef<{
    dragging: boolean
    tabId: string
    startX: number
    startIndex: number
    offsetX: number
    pointerOffsetInTab: number
  } | null>(null)
  const [draggingTabId, setDraggingTabId] = React.useState<string | null>(null)
  const [dragOffsetX, setDragOffsetX] = React.useState(0)
  // 保持 tabs 的最新值供拖拽事件处理器使用
  const tabsRef = React.useRef(tabs)
  tabsRef.current = tabs

  const handleActivate = React.useCallback((tabId: string) => {
    setActiveTabId(tabId)
    // 点击任意 tab 都关闭定时任务编辑表单（overlay 否则会盖在内容区上）
    setAutomationForm({ open: false, draft: null })

    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    if (tab.type === 'chat') {
      setAppMode('chat')
      setCurrentConversationId(tab.sessionId)
    } else if (tab.type === 'agent' || tab.type === 'preview') {
      setAppMode('agent')
      setCurrentAgentSessionId(tab.sessionId)

      // 用户打开查看后只清除未读角标；是否完成由用户通过对勾确认。
      setUnviewedCompleted((prev) => {
        if (!prev.has(tab.sessionId)) return prev
        const next = new Set(prev)
        next.delete(tab.sessionId)
        return next
      })

      const session = agentSessions.find((s) => s.id === tab.sessionId)
      if (session?.workspaceId) {
        setCurrentAgentWorkspaceId(session.workspaceId)
        window.electronAPI.updateSettings({
          agentWorkspaceId: session.workspaceId,
        }).catch(console.error)
      }
    } else if (tab.type === 'scratch') {
      // Agent 模式下切到 Scratch Pad 时保持右侧文件面板不收起
      setCurrentConversationId(null)
      if (appMode !== 'agent') {
        setCurrentAgentSessionId(null)
      }
    }
  }, [setActiveTabId, setAutomationForm, tabs, agentSessions, appMode, setAppMode, setCurrentConversationId, setCurrentAgentSessionId, setCurrentAgentWorkspaceId, setUnviewedCompleted])

  /** 取消置顶标签（同步更新 session/conversation 元数据并移除标签） */
  const handleUnpinTab = React.useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab?.pinned) return

    // 从 tabs 数组中移除该标签，激活切换到其他标签
    let newActiveId: string | null = null
    setTabs((prev) => {
      const target = prev.find((t) => t.id === tabId)
      if (!target?.pinned) return prev
      const currentActive = store.get(activeTabIdAtom)
      if (currentActive === tabId) {
        const otherPinned = prev.filter((t) => t.pinned && t.id !== tabId)
        const nonPinned = prev.filter((t) => !t.pinned && t.id !== SCRATCH_PAD_ID && t.type !== 'preview')
        newActiveId = otherPinned.at(-1)?.id ?? nonPinned.at(0)?.id ?? SCRATCH_PAD_ID
      }
      return prev.filter((t) => t.id !== tabId)
    })
    if (newActiveId) setActiveTabId(newActiveId)

    // 同步更新 session/conversation 元数据并更新 atom
    if (tab.type === 'agent') {
      window.electronAPI.togglePinAgentSession(tab.sessionId).then((updated) => {
        setAgentSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s))
      }).catch(console.error)
    } else if (tab.type === 'chat') {
      window.electronAPI.togglePinConversation(tab.sessionId).then((updated) => {
        setConversations((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      }).catch(console.error)
    }
  }, [tabs, setTabs, setActiveTabId, store, setAgentSessions, setConversations])

  const handleDragStart = React.useCallback((tabId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return // 只处理左键
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return

    // 记录鼠标按下时在 tab 内部的偏移量
    const tabEl = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null
    if (!tabEl) return
    const tabRect = tabEl.getBoundingClientRect()
    const pointerOffsetInTab = e.clientX - tabRect.left

    dragState.current = {
      dragging: false,
      tabId,
      startX: e.clientX,
      startIndex: idx,
      offsetX: 0,
      pointerOffsetInTab,
    }

    const handleMove = (me: PointerEvent): void => {
      if (!dragState.current) return
      const dx = me.clientX - dragState.current.startX
      if (!dragState.current.dragging && Math.abs(dx) > 5) {
        dragState.current.dragging = true
        setDraggingTabId(tabId)
      }
      if (!dragState.current.dragging) return

      // 计算被拖 tab 的视觉中心位置
      const currentTabs = tabsRef.current
      const currentIdx = currentTabs.findIndex((t) => t.id === tabId)
      if (currentIdx === -1) return

      // 使用所有 tab 元素的当前位置计算拖拽中心
      const allTabEls = document.querySelectorAll('[data-tab-id]')
      const draggedEl = allTabEls[currentIdx] as HTMLElement | null
      if (!draggedEl) return
      const draggedRect = draggedEl.getBoundingClientRect()
      const dragCenterX = draggedRect.left + dragState.current.pointerOffsetInTab + dx

      // 确定 dragCenterX 落在哪个 tab 的范围内
      let targetIndex = currentIdx
      for (let i = 0; i < allTabEls.length; i++) {
        const el = allTabEls[i] as HTMLElement
        const rect = el.getBoundingClientRect()
        if (dragCenterX < rect.left + rect.width / 2) {
          targetIndex = i
          break
        }
        targetIndex = i
      }

      // 更新 transform 偏移量
      dragState.current.offsetX = dx
      setDragOffsetX(dx)

      // 实时交换
      if (targetIndex !== currentIdx) {
        const reordered = reorderTabs(currentTabs, currentIdx, targetIndex)
        if (reordered !== currentTabs) {
          // 记录交换前被拖 tab 的视觉位置
          const visualLeftBefore = draggedRect.left + dx
          setTabs(reordered)
          // 交换后 React 会重渲染，tab 在 DOM 中的位置变了
          // 需要修正 offset 使 tab 视觉位置不变
          // 在 requestAnimationFrame 中（React 已渲染）读取新 DOM 位置并修正
          requestAnimationFrame(() => {
            const newEl = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null
            if (newEl && dragState.current) {
              const newRect = newEl.getBoundingClientRect()
              const newDx = visualLeftBefore - newRect.left
              dragState.current.startX = me.clientX - newDx
              dragState.current.offsetX = newDx
              setDragOffsetX(newDx)
            }
          })
        }
      }
    }

    const handleUp = (): void => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      dragState.current = null
      setDraggingTabId(null)
      setDragOffsetX(0)
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }, [tabs, setTabs])

  if (tabs.length === 0) return <div className="h-[34px] titlebar-drag-region" />

  return (
    <>
      <TabBarInner
        tabs={tabs}
        activeTabId={activeTabId}
        streamingMap={indicatorMap}
        workspaceNameBySessionId={workspaceNameBySessionId}
        automationSessionIds={automationSessionIds}
        draggingTabId={draggingTabId}
        dragOffsetX={dragOffsetX}
        onActivate={handleActivate}
        onClose={requestClose}
        onDragStart={handleDragStart}
        onUnpin={handleUnpinTab}
      />
    </>
  )
}

/** 内部组件：管理全局 hover 状态，确保同一时刻只有一个预览面板 */
function TabBarInner({
  tabs,
  activeTabId,
  streamingMap,
  workspaceNameBySessionId,
  automationSessionIds,
  draggingTabId,
  dragOffsetX,
  onActivate,
  onClose,
  onDragStart,
  onUnpin,
}: {
  tabs: TabItem[]
  activeTabId: string | null
  streamingMap: Map<string, SessionIndicatorStatus>
  workspaceNameBySessionId: Map<string, string>
  automationSessionIds: Set<string>
  draggingTabId: string | null
  dragOffsetX: number
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onDragStart: (tabId: string, e: React.PointerEvent) => void
  onUnpin?: (tabId: string) => void
}): React.ReactElement {
  const [hoveredTabId, setHoveredTabId] = React.useState<string | null>(null)
  const [isLeaving, setIsLeaving] = React.useState(false)
  const enterTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const leaveTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const fadeTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const isWindows = React.useMemo(() => detectIsWindows(), [])

  // 滚动容器 ref
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // 鼠标滚轮横向滚动（使用原生事件监听器以支持 preventDefault）
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      el.scrollLeft += e.deltaY || e.deltaX
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // 新增 tab 时自动滚动到最右
  const prevTabCount = React.useRef(tabs.length)
  React.useEffect(() => {
    if (tabs.length > prevTabCount.current && scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' })
    }
    prevTabCount.current = tabs.length
  }, [tabs.length])

  React.useEffect(() => {
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  const handleTabHoverEnter = React.useCallback((tabId: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current)
    setIsLeaving(false)

    // 如果已经有面板打开（从一个 Tab 滑到另一个），立即切换
    if (hoveredTabId) {
      setHoveredTabId(tabId)
    } else {
      // 首次 hover，延迟 300ms
      enterTimerRef.current = setTimeout(() => setHoveredTabId(tabId), 300)
    }
  }, [hoveredTabId])

  const handleTabHoverLeave = React.useCallback(() => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      setIsLeaving(true)
      fadeTimerRef.current = setTimeout(() => {
        setHoveredTabId(null)
        setIsLeaving(false)
      }, 80)
    }, 200)
  }, [])

  // 面板的 hover 进入（阻止关闭）
  const handlePanelHoverEnter = React.useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    setIsLeaving(false)
  }, [])

  // 溢出检测：左右滚动指示器
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState, tabs])

  // tabs 变化时更新溢出状态
  React.useEffect(() => {
    updateScrollState()
  }, [tabs, updateScrollState])

  const scrollByTab = React.useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' })
  }, [])

  return (
    <div className={cn("flex items-end h-[34px] tabbar-bg relative", isWindows && "pr-[126px]")}>
      {/* 顶部 TabBar 的空白区域必须保持可拖拽，尤其是 macOS/Windows 自定义标题栏。
          Windows 上外层 pr-[126px] 让 TabBar 背景（tabbar-bg）不延伸到 WindowControls 区域，
          同时拖拽层也用 right-[126px] 避开按钮区，防止 hitmask 重叠。
          需要交互的单个 Tab 会在 TabBarItem 内部自己声明 titlebar-no-drag。 */}
      <div className={cn("absolute inset-0 titlebar-drag-region", isWindows && "right-[126px]")} />

      {/* 左侧滚动指示器 */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByTab('left')}
          className="absolute left-0 top-0 bottom-0 w-6 z-10 flex items-center justify-center bg-gradient-to-r from-tabbar-bg to-transparent titlebar-no-drag text-foreground/40 hover:text-foreground/70 transition-colors"
          aria-label="向左滚动标签栏"
        >
          ‹
        </button>
      )}

      <div
        ref={scrollRef}
        className={cn("relative flex items-end flex-1 min-w-0 overflow-x-auto scrollbar-none", canScrollLeft && "pl-5", canScrollRight && "pr-5")}
      >
        {tabs.map((tab) => (
          <TabBarItem
            key={tab.id}
            id={tab.id}
            type={tab.type}
            title={tab.title}
            workspaceName={
              tab.type === 'agent' ? workspaceNameBySessionId.get(tab.sessionId)
              : tab.type === 'chat' && tab.pinned ? 'Chat'
              : undefined
            }
            isAutomation={tab.type === 'agent' && automationSessionIds.has(tab.sessionId)}
            isPinned={!!tab.pinned}
            isActive={tab.id === activeTabId}
            isStreaming={streamingMap.get(tab.id) ?? 'idle'}
            isHovered={hoveredTabId === tab.id}
            isLeaving={hoveredTabId === tab.id && isLeaving}
            isDragging={draggingTabId === tab.id}
            dragOffsetX={draggingTabId === tab.id ? dragOffsetX : 0}
            onActivate={() => onActivate(tab.id)}
            onClose={() => onClose(tab.id)}
            onMiddleClick={() => onClose(tab.id)}
            onDragStart={(e) => onDragStart(tab.id, e)}
            onUnpin={onUnpin ? () => onUnpin(tab.id) : undefined}
            onHoverEnter={() => handleTabHoverEnter(tab.id)}
            onHoverLeave={handleTabHoverLeave}
            onPanelHoverEnter={handlePanelHoverEnter}
            onPanelHoverLeave={handleTabHoverLeave}
          />
        ))}
      </div>

      {/* 右侧滚动指示器 */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByTab('right')}
          className={cn(
            "absolute top-0 bottom-0 w-6 z-10 flex items-center justify-center bg-gradient-to-l from-tabbar-bg to-transparent titlebar-no-drag text-foreground/40 hover:text-foreground/70 transition-colors",
            isWindows ? "right-[126px]" : "right-0",
          )}
          aria-label="向右滚动标签栏"
        >
          ›
        </button>
      )}
    </div>
  )
}
