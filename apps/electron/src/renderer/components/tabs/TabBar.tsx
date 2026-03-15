/**
 * TabBar — 顶部标签栏
 *
 * 显示所有打开的标签页，支持：
 * - 点击切换标签
 * - 中键关闭标签
 * - 拖拽重排序
 * - 溢出时水平滚动
 * - 分屏模式切换按钮
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  tabsAtom,
  splitLayoutAtom,
  tabStreamingMapAtom,
  activeTabIdAtom,
  openTab,
  closeTab,
  focusTab,
  reorderTabs,
} from '@/atoms/tab-atoms'
import {
  conversationModelsAtom,
  conversationContextLengthAtom,
  conversationThinkingEnabledAtom,
  conversationParallelModeAtom,
} from '@/atoms/chat-atoms'
import {
  agentSidePanelOpenMapAtom,
  agentSidePanelTabMapAtom,
} from '@/atoms/agent-atoms'
import { conversationPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { deleteMapEntry } from '@/lib/utils'
import { TabBarItem } from './TabBarItem'
import { SplitModeToggle } from './SplitModeToggle'

export function TabBar(): React.ReactElement {
  const [tabs, setTabs] = useAtom(tabsAtom)
  const [layout, setLayout] = useAtom(splitLayoutAtom)
  const activeTabId = useAtomValue(activeTabIdAtom)
  const streamingMap = useAtomValue(tabStreamingMapAtom)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const suppressClickRef = React.useRef<string | null>(null)
  const suppressClickTimerRef = React.useRef<number | null>(null)

  const suppressNextClick = React.useCallback((tabId: string): void => {
    suppressClickRef.current = tabId
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current)
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = null
      suppressClickTimerRef.current = null
    }, 0)
  }, [])

  const shouldSuppressClick = React.useCallback((tabId: string): boolean => {
    if (suppressClickRef.current !== tabId) return false
    suppressClickRef.current = null
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = null
    }
    return true
  }, [])

  React.useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current)
      }
    }
  }, [])

  const getTabIndexFromPointer = React.useCallback((clientX: number, fallbackIndex: number): number => {
    const elements = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]!
      const rect = element.getBoundingClientRect()
      if (clientX < rect.left + rect.width / 2) {
        return index
      }
    }
    return elements.length > 0 ? elements.length - 1 : fallbackIndex
  }, [])

  const handleTabDragMove = React.useCallback((clientX: number): void => {
    const current = dragState.current
    if (!current) return

    const dx = Math.abs(clientX - current.startX)
    if (!current.dragging && dx > 5) {
      current.dragging = true
    }
    if (!current.dragging) return

    const fromIndex = tabs.findIndex((t) => t.id === current.tabId)
    if (fromIndex === -1) return

    const toIndex = getTabIndexFromPointer(clientX, fromIndex)
    if (fromIndex === toIndex) return

    setTabs((prev) => {
      const latestFromIndex = prev.findIndex((t) => t.id === current.tabId)
      if (latestFromIndex === -1) return prev
      const latestToIndex = Math.max(0, Math.min(toIndex, prev.length - 1))
      if (latestFromIndex === latestToIndex) return prev
      return reorderTabs(prev, latestFromIndex, latestToIndex)
    })
  }, [getTabIndexFromPointer, setTabs, tabs])

  // per-conversation/session Map atoms（用于关闭标签时清理）
  const setConvModels = useSetAtom(conversationModelsAtom)
  const setConvContextLength = useSetAtom(conversationContextLengthAtom)
  const setConvThinking = useSetAtom(conversationThinkingEnabledAtom)
  const setConvParallel = useSetAtom(conversationParallelModeAtom)
  const setConvPromptId = useSetAtom(conversationPromptIdAtom)
  const setAgentSidePanelOpen = useSetAtom(agentSidePanelOpenMapAtom)
  const setAgentSidePanelTab = useSetAtom(agentSidePanelTabMapAtom)

  /** 清理关闭标签对应的 per-conversation/session Map atoms 条目 */
  const cleanupMapAtoms = React.useCallback((tabId: string) => {
    const deleteKey = <T,>(prev: Map<string, T>): Map<string, T> => deleteMapEntry(prev, tabId)

    // Chat per-conversation atoms
    setConvModels(deleteKey)
    setConvContextLength(deleteKey)
    setConvThinking(deleteKey)
    setConvParallel(deleteKey)
    setConvPromptId(deleteKey)
    // Agent per-session atoms
    setAgentSidePanelOpen(deleteKey)
    setAgentSidePanelTab(deleteKey)
  }, [setConvModels, setConvContextLength, setConvThinking, setConvParallel, setConvPromptId, setAgentSidePanelOpen, setAgentSidePanelTab])

  // 拖拽状态
  const dragState = React.useRef<{
    dragging: boolean
    tabId: string
    startX: number
  } | null>(null)

  const handleActivate = React.useCallback((tabId: string) => {
    setLayout((prev) => focusTab(prev, tabId))
  }, [setLayout])

  const handleClose = React.useCallback((tabId: string) => {
    setTabs((prevTabs) => {
      const result = closeTab(prevTabs, layout, tabId)
      // 需要同时更新 layout，使用 setTimeout 保证原子性
      setTimeout(() => setLayout(result.layout), 0)
      return result.tabs
    })
    // 清理 per-conversation/session Map atoms 条目，防止内存泄漏
    cleanupMapAtoms(tabId)
  }, [layout, setTabs, setLayout, cleanupMapAtoms])

  const handleDragStart = React.useCallback((tabId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return

    dragState.current = {
      dragging: false,
      tabId,
      startX: e.clientX,
    }

    const handleMove = (me: PointerEvent): void => {
      handleTabDragMove(me.clientX)
    }

    const handleUp = (): void => {
      const didDrag = dragState.current?.dragging ?? false
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
      dragState.current = null
      if (didDrag) suppressNextClick(tabId)
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
  }, [handleTabDragMove, suppressNextClick, tabs])

  const handleTabClick = React.useCallback((tabId: string) => {
    if (shouldSuppressClick(tabId)) return
    handleActivate(tabId)
  }, [handleActivate, shouldSuppressClick])

  const handleCloseClick = React.useCallback((tabId: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    handleClose(tabId)
  }, [handleClose])

  const handleMiddleClick = React.useCallback((tabId: string) => {
    handleClose(tabId)
  }, [handleClose])

  // 水平滚动支持
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY
    }
  }, [])

  if (tabs.length === 0) return <div className="h-[34px] titlebar-drag-region" />

  return (
    <div className="flex items-end h-[34px] bg-muted/30">
      {/* 标签区域（可滚动） */}
      <div
        ref={scrollRef}
        className="flex items-end shrink min-w-0 max-w-full overflow-x-auto scrollbar-none titlebar-no-drag"
        onWheel={handleWheel}
      >
        {tabs.map((tab) => (
          <TabBarItem
            key={tab.id}
            id={tab.id}
            type={tab.type}
            title={tab.title}
            isActive={tab.id === activeTabId}
            isStreaming={streamingMap.get(tab.id) ?? false}
            onActivate={() => handleTabClick(tab.id)}
            onClose={(e) => handleCloseClick(tab.id, e)}
            onMiddleClick={() => handleMiddleClick(tab.id)}
            onDragStart={(e) => handleDragStart(tab.id, e)}
          />
        ))}
      </div>

      {/* 空白拖拽区域：支持拖动窗口 */}
      <div className="flex-1 h-full titlebar-drag-region" />

      {/* 分屏模式切换 */}
      <SplitModeToggle />
    </div>
  )
}
