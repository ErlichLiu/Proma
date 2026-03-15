/**
 * LeftSidebar - 左侧导航栏
 *
 * 包含：
 * - Chat/Agent 模式切换器
 * - 导航菜单项（点击切换主内容区视图）
 * - 置顶对话区域（可展开/收起）
 * - 对话列表（新对话按钮 + 右键菜单 + 按 updatedAt 降序排列）
 */

import * as React from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { Pin, PinOff, Settings, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Plug, Zap, PanelLeftClose, PanelLeftOpen, ArrowRightLeft } from 'lucide-react'
import { cn, deleteMapEntry } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ModeSwitcher } from './ModeSwitcher'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsTabAtom } from '@/atoms/settings-tab'
import {
  conversationsAtom,
  currentConversationIdAtom,
  selectedModelAtom,
  streamingConversationIdsAtom,
  conversationModelsAtom,
  conversationContextLengthAtom,
  conversationThinkingEnabledAtom,
  conversationParallelModeAtom,
} from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentRunningSessionIdsAtom,
  agentChannelIdAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  workspaceCapabilitiesVersionAtom,
  agentSidePanelOpenMapAtom,
  agentSidePanelTabMapAtom,
} from '@/atoms/agent-atoms'
import {
  tabsAtom,
  splitLayoutAtom,
  activeTabIdAtom,
  sidebarCollapsedAtom,
  openTab,
  closeTab,
  updateTabTitle,
} from '@/atoms/tab-atoms'
import { userProfileAtom } from '@/atoms/user-profile'
import { hasUpdateAtom } from '@/atoms/updater'
import { hasEnvironmentIssuesAtom } from '@/atoms/environment'
import { promptConfigAtom, selectedPromptIdAtom, conversationPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { WorkspaceSelector } from '@/components/agent/WorkspaceSelector'
import { MoveSessionDialog } from '@/components/agent/MoveSessionDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ActiveView } from '@/atoms/active-view'
import type { ConversationMeta, AgentSessionMeta, WorkspaceCapabilities } from '@proma/shared'

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  /** 右侧额外元素（如展开/收起箭头） */
  suffix?: React.ReactNode
  onClick?: () => void
}

function SidebarItem({ icon, label, active, suffix, onClick }: SidebarItemProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] transition-colors duration-100 titlebar-no-drag',
        active
          ? 'bg-foreground/[0.08] dark:bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'text-foreground/60 hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.04] hover:text-foreground'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-[18px] h-[18px]">{icon}</span>
        <span>{label}</span>
      </div>
      {suffix}
    </button>
  )
}

export interface LeftSidebarProps {
  /** 可选固定宽度，默认使用 CSS 响应式宽度 */
  width?: number
}

/** 侧边栏导航项标识 */
type SidebarItemId = 'pinned' | 'all-chats' | 'settings'

/** 导航项到视图的映射 */
const ITEM_TO_VIEW: Record<SidebarItemId, ActiveView> = {
  pinned: 'conversations',
  'all-chats': 'conversations',
  settings: 'settings',
}

type SidebarReorderSection = 'chat-pinned' | 'chat-normal' | 'agent-pinned' | 'agent-normal'

interface SidebarOrderState {
  chatPinned: string[]
  chatNormal: string[]
  agentPinned: string[]
  agentNormal: string[]
}

function resolveOrderedIds(itemIds: string[], rememberedOrder: string[]): string[] {
  const seen = new Set<string>()
  const availableIds = new Set(itemIds)
  const remembered = rememberedOrder.filter((id) => {
    if (seen.has(id)) return false
    if (!availableIds.has(id)) return false
    seen.add(id)
    return true
  })

  return [...remembered, ...itemIds.filter((id) => !seen.has(id))]
}

function orderItemsByIds<T extends { id: string }>(items: T[], rememberedOrder: string[]): T[] {
  const resolvedIds = resolveOrderedIds(items.map((item) => item.id), rememberedOrder)
  const itemMap = new Map(items.map((item) => [item.id, item]))
  return resolvedIds.map((id) => itemMap.get(id)).filter((item): item is T => item !== undefined)
}

function moveItemToIndex(ids: string[], itemId: string, toIndex: number): string[] {
  const fromIndex = ids.indexOf(itemId)
  if (fromIndex === -1) return ids

  const clampedIndex = Math.max(0, Math.min(toIndex, ids.length - 1))
  if (fromIndex === clampedIndex) return ids

  const next = [...ids]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(clampedIndex, 0, moved!)
  return next
}

function isStringArrayEqual(a: string[], b: string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function getSectionOrderKey(section: SidebarReorderSection): keyof SidebarOrderState {
  switch (section) {
    case 'chat-pinned':
      return 'chatPinned'
    case 'chat-normal':
      return 'chatNormal'
    case 'agent-pinned':
      return 'agentPinned'
    case 'agent-normal':
      return 'agentNormal'
  }
}

export function LeftSidebar({ width }: LeftSidebarProps): React.ReactElement {
  const [activeView, setActiveView] = useAtom(activeViewAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const [activeItem, setActiveItem] = React.useState<SidebarItemId>('all-chats')
  const [conversations, setConversations] = useAtom(conversationsAtom)
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [sidebarOrder, setSidebarOrder] = React.useState<SidebarOrderState>({
    chatPinned: [],
    chatNormal: [],
    agentPinned: [],
    agentNormal: [],
  })
  const dragStateRef = React.useRef<{
    section: SidebarReorderSection
    itemId: string
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
    moved: boolean
  } | null>(null)
  const suppressClickRef = React.useRef<string | null>(null)
  const clearSuppressClickTimerRef = React.useRef<number | null>(null)
  const suppressNextClick = React.useCallback((itemId: string): void => {
    suppressClickRef.current = itemId
    if (clearSuppressClickTimerRef.current !== null) {
      window.clearTimeout(clearSuppressClickTimerRef.current)
    }
    clearSuppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = null
      clearSuppressClickTimerRef.current = null
    }, 0)
  }, [])

  const shouldSuppressClick = React.useCallback((itemId: string): boolean => {
    if (suppressClickRef.current !== itemId) return false
    suppressClickRef.current = null
    if (clearSuppressClickTimerRef.current !== null) {
      window.clearTimeout(clearSuppressClickTimerRef.current)
      clearSuppressClickTimerRef.current = null
    }
    return true
  }, [])
  /** 待删除对话 ID，非空时显示确认弹窗 */
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  /** 待迁移会话 ID，非空时显示迁移对话框 */
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null)
  /** 置顶区域展开/收起 */
  const [pinnedExpanded, setPinnedExpanded] = React.useState(true)
  /** Agent 置顶区域展开/收起 */
  const [pinnedAgentExpanded, setPinnedAgentExpanded] = React.useState(true)
  const setUserProfile = useSetAtom(userProfileAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const streamingIds = useAtomValue(streamingConversationIdsAtom)
  const mode = useAtomValue(appModeAtom)
  const hasUpdate = useAtomValue(hasUpdateAtom)
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom)
  const promptConfig = useAtomValue(promptConfigAtom)
  const setSelectedPromptId = useSetAtom(selectedPromptIdAtom)

  // Agent 模式状态
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const [currentAgentSessionId, setCurrentAgentSessionId] = useAtom(currentAgentSessionIdAtom)
  const agentRunningIds = useAtomValue(agentRunningSessionIdsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)

  // 工作区能力（MCP + Skill 计数）
  const [capabilities, setCapabilities] = React.useState<WorkspaceCapabilities | null>(null)
  const capabilitiesVersion = useAtomValue(workspaceCapabilitiesVersionAtom)

  // Tab 状态
  const [tabs, setTabs] = useAtom(tabsAtom)
  const [layout, setLayout] = useAtom(splitLayoutAtom)
  const activeTabId = useAtomValue(activeTabIdAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)

  // per-conversation/session Map atoms（删除时清理）
  const setConvModels = useSetAtom(conversationModelsAtom)
  const setConvContextLength = useSetAtom(conversationContextLengthAtom)
  const setConvThinking = useSetAtom(conversationThinkingEnabledAtom)
  const setConvParallel = useSetAtom(conversationParallelModeAtom)
  const setConvPromptId = useSetAtom(conversationPromptIdAtom)
  const setAgentSidePanelOpen = useSetAtom(agentSidePanelOpenMapAtom)
  const setAgentSidePanelTab = useSetAtom(agentSidePanelTabMapAtom)

  /** 清理 per-conversation/session Map atoms 条目 */
  const cleanupMapAtoms = React.useCallback((id: string) => {
    const deleteKey = <T,>(prev: Map<string, T>): Map<string, T> => deleteMapEntry(prev, id)

    setConvModels(deleteKey)
    setConvContextLength(deleteKey)
    setConvThinking(deleteKey)
    setConvParallel(deleteKey)
    setConvPromptId(deleteKey)
    setAgentSidePanelOpen(deleteKey)
    setAgentSidePanelTab(deleteKey)
  }, [setConvModels, setConvContextLength, setConvThinking, setConvParallel, setConvPromptId, setAgentSidePanelOpen, setAgentSidePanelTab])

  const currentWorkspaceSlug = React.useMemo(() => {
    if (!currentWorkspaceId) return null
    return workspaces.find((w) => w.id === currentWorkspaceId)?.slug ?? null
  }, [currentWorkspaceId, workspaces])

  React.useEffect(() => {
    if (!currentWorkspaceSlug || mode !== 'agent') {
      setCapabilities(null)
      return
    }
    window.electronAPI
      .getWorkspaceCapabilities(currentWorkspaceSlug)
      .then(setCapabilities)
      .catch(console.error)
  }, [currentWorkspaceSlug, mode, activeView, capabilitiesVersion])

  const chatPinnedConversations = React.useMemo(
    () => conversations.filter((c) => c.pinned),
    [conversations]
  )

  const chatNormalConversations = React.useMemo(
    () => conversations.filter((c) => !c.pinned),
    [conversations]
  )

  /** 置顶 Agent 会话列表（跨工作区） */
  const pinnedAgentSessions = React.useMemo(
    () => agentSessions.filter((s) => s.pinned),
    [agentSessions]
  )

  const normalAgentSessions = React.useMemo(
    () => agentSessions.filter((s) => !s.pinned && s.workspaceId === currentWorkspaceId),
    [agentSessions, currentWorkspaceId]
  )

  const pinnedConversations = React.useMemo(
    () => orderItemsByIds(chatPinnedConversations, sidebarOrder.chatPinned),
    [chatPinnedConversations, sidebarOrder.chatPinned]
  )

  const normalConversations = React.useMemo(
    () => orderItemsByIds(chatNormalConversations, sidebarOrder.chatNormal),
    [chatNormalConversations, sidebarOrder.chatNormal]
  )

  const orderedPinnedAgentSessions = React.useMemo(
    () => orderItemsByIds(pinnedAgentSessions, sidebarOrder.agentPinned),
    [pinnedAgentSessions, sidebarOrder.agentPinned]
  )

  const orderedNormalAgentSessions = React.useMemo(
    () => orderItemsByIds(normalAgentSessions, sidebarOrder.agentNormal),
    [normalAgentSessions, sidebarOrder.agentNormal]
  )

  const applySidebarReorder = React.useCallback((section: SidebarReorderSection, itemId: string, toIndex: number): void => {
    setSidebarOrder((prev) => {
      const key = getSectionOrderKey(section)
      const nextOrder = moveItemToIndex(prev[key], itemId, toIndex)
      if (nextOrder === prev[key]) return prev
      return {
        ...prev,
        [key]: nextOrder,
      }
    })
  }, [])

  const startSidebarDrag = React.useCallback((section: SidebarReorderSection, itemId: string, pointerId: number, startX: number, startY: number): void => {
    dragStateRef.current = {
      section,
      itemId,
      pointerId,
      startX,
      startY,
      dragging: false,
      moved: false,
    }
  }, [])

  const markSidebarDragging = React.useCallback((section: SidebarReorderSection, itemId: string, clientX: number, clientY: number): boolean => {
    const current = dragStateRef.current
    if (!current || current.section !== section || current.itemId !== itemId) return false

    const dx = Math.abs(clientX - current.startX)
    const dy = Math.abs(clientY - current.startY)
    if (!current.dragging && Math.max(dx, dy) > 5) {
      current.dragging = true
    }

    return current.dragging
  }, [])

  const handleSidebarReorderHover = React.useCallback((section: SidebarReorderSection, itemId: string, toIndex: number): void => {
    const current = dragStateRef.current
    if (!current || current.section !== section || current.itemId !== itemId) return
    current.dragging = true
    current.moved = true
    applySidebarReorder(section, itemId, toIndex)
  }, [applySidebarReorder])

  const finishSidebarDrag = React.useCallback((section: SidebarReorderSection, itemId: string): boolean => {
    const current = dragStateRef.current
    if (!current || current.section !== section || current.itemId !== itemId) return false
    const didDrag = current.dragging || current.moved
    dragStateRef.current = null
    return didDrag
  }, [])

  const cancelSidebarDrag = React.useCallback((section: SidebarReorderSection, itemId: string): void => {
    const current = dragStateRef.current
    if (!current || current.section !== section || current.itemId !== itemId) return
    dragStateRef.current = null
  }, [])

  React.useEffect(() => {
    setSidebarOrder((prev) => {
      const next: SidebarOrderState = {
        chatPinned: resolveOrderedIds(chatPinnedConversations.map((item) => item.id), prev.chatPinned),
        chatNormal: resolveOrderedIds(chatNormalConversations.map((item) => item.id), prev.chatNormal),
        agentPinned: resolveOrderedIds(pinnedAgentSessions.map((item) => item.id), prev.agentPinned),
        agentNormal: resolveOrderedIds(normalAgentSessions.map((item) => item.id), prev.agentNormal),
      }

      if (
        isStringArrayEqual(prev.chatPinned, next.chatPinned)
        && isStringArrayEqual(prev.chatNormal, next.chatNormal)
        && isStringArrayEqual(prev.agentPinned, next.agentPinned)
        && isStringArrayEqual(prev.agentNormal, next.agentNormal)
      ) {
        return prev
      }

      return next
    })
  }, [chatPinnedConversations, chatNormalConversations, pinnedAgentSessions, normalAgentSessions])

  React.useEffect(() => {
    return () => {
      if (clearSuppressClickTimerRef.current !== null) {
        window.clearTimeout(clearSuppressClickTimerRef.current)
      }
    }
  }, [])

  // 初始加载对话列表 + 用户档案 + Agent 会话
  React.useEffect(() => {
    window.electronAPI
      .listConversations()
      .then((list) => {
        setConversations(list)
      })
      .catch(console.error)
    window.electronAPI
      .getUserProfile()
      .then(setUserProfile)
      .catch(console.error)
    window.electronAPI
      .listAgentSessions()
      .then(setAgentSessions)
      .catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConversations, setUserProfile, setAgentSessions])

  /** 处理导航项点击 */
  const handleItemClick = (item: SidebarItemId): void => {
    if (item === 'pinned') {
      // 置顶按钮仅切换展开/收起，不改变 activeView
      setPinnedExpanded((prev) => !prev)
      return
    }
    setActiveItem(item)
    setActiveView(ITEM_TO_VIEW[item])
  }

  // 当 activeView 从外部改变时，同步 activeItem
  React.useEffect(() => {
    if (activeView === 'conversations' && activeItem === 'settings') {
      setActiveItem('all-chats')
    }
  }, [activeView, activeItem])

  /** 创建新对话（继承当前选中的模型/渠道） */
  const handleNewConversation = async (): Promise<void> => {
    try {
      const meta = await window.electronAPI.createConversation(
        undefined,
        selectedModel?.modelId,
        selectedModel?.channelId,
      )
      setConversations((prev) => [meta, ...prev])
      setSidebarOrder((prev) => ({
        ...prev,
        chatNormal: [meta.id, ...prev.chatNormal.filter((id) => id !== meta.id)],
      }))
      // 打开新标签页
      const result = openTab(tabs, layout, { type: 'chat', sessionId: meta.id, title: meta.title })
      setTabs(result.tabs)
      setLayout(result.layout)
      setCurrentConversationId(meta.id)
      // 确保在对话视图
      setActiveView('conversations')
      setActiveItem('all-chats')
      // 根据默认提示词重置选中
      if (promptConfig.defaultPromptId) {
        setSelectedPromptId(promptConfig.defaultPromptId)
      }
    } catch (error) {
      console.error('[侧边栏] 创建对话失败:', error)
    }
  }

  /** 选择对话（打开或聚焦标签页） */
  const handleSelectConversation = (id: string, title: string): void => {
    const result = openTab(tabs, layout, { type: 'chat', sessionId: id, title })
    setTabs(result.tabs)
    setLayout(result.layout)
    setCurrentConversationId(id)
    setActiveView('conversations')
    setActiveItem('all-chats')
  }

  /** 请求删除对话（弹出确认框） */
  const handleRequestDelete = (id: string): void => {
    setPendingDeleteId(id)
  }

  /** 重命名对话标题 */
  const handleRename = async (id: string, newTitle: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateConversationTitle(id, newTitle)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 同步更新标签页标题
      setTabs((prev) => updateTabTitle(prev, id, newTitle))
    } catch (error) {
      console.error('[侧边栏] 重命名对话失败:', error)
    }
  }

  /** 切换对话置顶状态 */
  const handleTogglePin = async (id: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.togglePinConversation(id)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
    } catch (error) {
      console.error('[侧边栏] 切换置顶失败:', error)
    }
  }

  /** 确认删除对话 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!pendingDeleteId) return

    // 关闭对应的标签页
    const tabResult = closeTab(tabs, layout, pendingDeleteId)
    setTabs(tabResult.tabs)
    setLayout(tabResult.layout)

    // 清理 per-conversation/session Map atoms 条目
    cleanupMapAtoms(pendingDeleteId)

    if (mode === 'agent') {
      // Agent 模式：删除 Agent 会话
      try {
        await window.electronAPI.deleteAgentSession(pendingDeleteId)
        setAgentSessions((prev) => prev.filter((s) => s.id !== pendingDeleteId))
        if (currentAgentSessionId === pendingDeleteId) {
          setCurrentAgentSessionId(null)
        }
      } catch (error) {
        console.error('[侧边栏] 删除 Agent 会话失败:', error)
      } finally {
        setPendingDeleteId(null)
      }
      return
    }

    try {
      await window.electronAPI.deleteConversation(pendingDeleteId)
      setConversations((prev) => prev.filter((c) => c.id !== pendingDeleteId))
      if (currentConversationId === pendingDeleteId) {
        setCurrentConversationId(null)
      }
    } catch (error) {
      console.error('[侧边栏] 删除对话失败:', error)
    } finally {
      setPendingDeleteId(null)
    }
  }

  /** 创建新 Agent 会话 */
  const handleNewAgentSession = async (): Promise<void> => {
    try {
      const meta = await window.electronAPI.createAgentSession(
        undefined,
        agentChannelId || undefined,
        currentWorkspaceId || undefined,
      )
      setAgentSessions((prev) => [meta, ...prev])
      if (meta.pinned) {
        setSidebarOrder((prev) => ({
          ...prev,
          agentPinned: [meta.id, ...prev.agentPinned.filter((id) => id !== meta.id)],
        }))
      } else if (meta.workspaceId === currentWorkspaceId) {
        setSidebarOrder((prev) => ({
          ...prev,
          agentNormal: [meta.id, ...prev.agentNormal.filter((id) => id !== meta.id)],
        }))
      }
      // 打开新标签页
      const result = openTab(tabs, layout, { type: 'agent', sessionId: meta.id, title: meta.title })
      setTabs(result.tabs)
      setLayout(result.layout)
      setCurrentAgentSessionId(meta.id)
      setActiveView('conversations')
      setActiveItem('all-chats')
    } catch (error) {
      console.error('[侧边栏] 创建 Agent 会话失败:', error)
    }
  }

  /** 选择 Agent 会话（打开或聚焦标签页） */
  const handleSelectAgentSession = (id: string, title: string): void => {
    const result = openTab(tabs, layout, { type: 'agent', sessionId: id, title })
    setTabs(result.tabs)
    setLayout(result.layout)
    setCurrentAgentSessionId(id)
    setActiveView('conversations')
    setActiveItem('all-chats')
  }

  /** 重命名 Agent 会话标题 */
  const handleAgentRename = async (id: string, newTitle: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateAgentSessionTitle(id, newTitle)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 同步更新标签页标题
      setTabs((prev) => updateTabTitle(prev, id, newTitle))
    } catch (error) {
      console.error('[侧边栏] 重命名 Agent 会话失败:', error)
    }
  }

  /** 切换 Agent 会话置顶状态 */
  const handleTogglePinAgent = async (id: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.togglePinAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
    } catch (error) {
      console.error('[侧边栏] 切换 Agent 会话置顶失败:', error)
    }
  }

  /** 迁移会话到另一个工作区后的回调 */
  const handleSessionMoved = (updatedSession: AgentSessionMeta, targetWorkspaceName: string): void => {
    setAgentSessions((prev) =>
      prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
    )
    // 如果迁移的是当前选中的会话，取消选中并关闭标签页
    if (currentAgentSessionId === updatedSession.id) {
      const tabResult = closeTab(tabs, layout, updatedSession.id)
      setTabs(tabResult.tabs)
      setLayout(tabResult.layout)
      setCurrentAgentSessionId(null)
    }
    setMoveTargetId(null)
    toast.success('会话已迁移', {
      description: `已迁移到「${targetWorkspaceName}」，请切换工作区查看`,
    })
  }

  // 删除确认弹窗（collapsed/expanded 共享）
  const deleteDialog = (
    <AlertDialog
      open={pendingDeleteId !== null}
      onOpenChange={(open) => { if (!open) setPendingDeleteId(null) }}
    >
      <AlertDialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleConfirmDelete()
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除对话</AlertDialogTitle>
          <AlertDialogDescription>
            删除后将无法恢复，确定要删除这个对话吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // 迁移会话对话框（collapsed/expanded 共享）
  const moveDialog = (
    <MoveSessionDialog
      open={moveTargetId !== null}
      onOpenChange={(open) => { if (!open) setMoveTargetId(null) }}
      sessionId={moveTargetId ?? ''}
      currentWorkspaceId={currentWorkspaceId ?? undefined}
      workspaces={workspaces}
      onMoved={handleSessionMoved}
    />
  )

  // ===== 折叠状态：精简图标视图 =====
  if (sidebarCollapsed) {
    return (
      <div
        className="h-full flex flex-col items-center bg-background transition-[width] duration-300"
        style={{ width: 48, flexShrink: 0 }}
      >
        {/* 顶部留空，避开 macOS 红绿灯 */}
        <div className="pt-[50px]" />

        {/* 展开按钮 */}
        <div className="pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 rounded-[10px] text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground transition-colors titlebar-no-drag"
              >
                <PanelLeftOpen size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">展开侧边栏</TooltipContent>
          </Tooltip>
        </div>

        {/* 新对话/会话按钮 */}
        <div className="pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={mode === 'agent' ? handleNewAgentSession : handleNewConversation}
                className="p-2 rounded-[10px] text-foreground/70 bg-foreground/[0.04] hover:bg-foreground/[0.08] transition-colors titlebar-no-drag border border-dashed border-foreground/10 hover:border-foreground/20"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {mode === 'agent' ? '新会话' : '新对话'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 弹性空间 */}
        <div className="flex-1" />

        {/* 设置按钮 */}
        <div className="pb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleItemClick('settings')}
                className={cn(
                  'relative p-2 rounded-[10px] transition-colors titlebar-no-drag',
                  activeItem === 'settings'
                    ? 'bg-foreground/[0.08] text-foreground'
                    : 'text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground'
                )}
              >
                <Settings size={18} />
                {(hasUpdate || hasEnvironmentIssues) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </Tooltip>
        </div>

        {deleteDialog}
        {moveDialog}
      </div>
    )
  }

  // ===== 展开状态：完整侧边栏 =====
  return (
    <div
      className="h-full flex flex-col bg-background transition-[width] duration-300"
      style={{ width: width ?? 280, minWidth: 180, flexShrink: 1 }}
    >
      {/* 顶部留空，避开 macOS 红绿灯 */}
      <div className="pt-[50px]">
        {/* 模式切换器 + 折叠按钮 */}
        <div className="flex items-start gap-1 pr-1">
          <div className="flex-1 min-w-0">
            <ModeSwitcher />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="mt-2 size-10 flex items-center justify-center rounded-[10px] text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/60 transition-colors titlebar-no-drag"
              >
                <PanelLeftClose size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">收起侧边栏</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Agent 模式：工作区选择器 */}
      {mode === 'agent' && (
        <div className="px-3 pt-3">
          <WorkspaceSelector />
        </div>
      )}

      {/* 新对话/新会话按钮 */}
      <div className="px-3 pt-2">
        <button
          onClick={mode === 'agent' ? handleNewAgentSession : handleNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-medium text-foreground/70 bg-foreground/[0.04] hover:bg-foreground/[0.08] transition-colors duration-100 titlebar-no-drag border border-dashed border-foreground/10 hover:border-foreground/20"
        >
          <Plus size={14} />
          <span>{mode === 'agent' ? '新会话' : '新对话'}</span>
        </button>
      </div>

      {/* Chat 模式：导航菜单（置顶区域） */}
      {mode === 'chat' && (
        <div className="flex flex-col gap-1 pt-3 px-3">
          <SidebarItem
            icon={<Pin size={16} />}
            label="置顶对话"
            suffix={
              pinnedConversations.length > 0 ? (
                pinnedExpanded
                  ? <ChevronDown size={14} className="text-foreground/40" />
                  : <ChevronRight size={14} className="text-foreground/40" />
              ) : undefined
            }
            onClick={() => handleItemClick('pinned')}
          />
        </div>
      )}

      {/* Chat 模式：置顶对话区域 */}
      {mode === 'chat' && pinnedExpanded && pinnedConversations.length > 0 && (
        <div className="px-3 pt-1 pb-1">
          <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-primary/20 ml-2">
            {pinnedConversations.map((conv, index) => (
              <ConversationItem
                key={`pinned-${conv.id}`}
                conversation={conv}
                active={conv.id === activeTabId}
                hovered={conv.id === hoveredId}
                streaming={streamingIds.has(conv.id)}
                showPinIcon={false}
                reorderSection="chat-pinned"
                reorderIndex={index}
                onSelect={() => handleSelectConversation(conv.id, conv.title)}
                onRequestDelete={() => handleRequestDelete(conv.id)}
                onRename={handleRename}
                onTogglePin={handleTogglePin}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDragStart={startSidebarDrag}
                onDragMove={markSidebarDragging}
                onDragHover={handleSidebarReorderHover}
                onDragFinish={finishSidebarDrag}
                onDragCancel={cancelSidebarDrag}
                onSuppressClick={suppressNextClick}
                shouldSuppressClick={shouldSuppressClick}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'chat' && normalConversations.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none">
          <div className="flex flex-col gap-0.5">
            {normalConversations.map((conv, index) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                active={conv.id === activeTabId}
                hovered={conv.id === hoveredId}
                streaming={streamingIds.has(conv.id)}
                showPinIcon={false}
                reorderSection="chat-normal"
                reorderIndex={index}
                onSelect={() => handleSelectConversation(conv.id, conv.title)}
                onRequestDelete={() => handleRequestDelete(conv.id)}
                onRename={handleRename}
                onTogglePin={handleTogglePin}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDragStart={startSidebarDrag}
                onDragMove={markSidebarDragging}
                onDragHover={handleSidebarReorderHover}
                onDragFinish={finishSidebarDrag}
                onDragCancel={cancelSidebarDrag}
                onSuppressClick={suppressNextClick}
                shouldSuppressClick={shouldSuppressClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agent 模式：导航菜单（置顶区域） */}

      {mode === 'chat' && normalConversations.length === 0 && (
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none" />
      )}

      {/* Agent 模式：导航菜单（置顶区域） */}
      {mode === 'agent' && (
        <div className="flex flex-col gap-1 pt-3 px-3">
          <SidebarItem
            icon={<Pin size={16} />}
            label="置顶会话"
            suffix={
              pinnedAgentSessions.length > 0 ? (
                pinnedAgentExpanded
                  ? <ChevronDown size={14} className="text-foreground/40" />
                  : <ChevronRight size={14} className="text-foreground/40" />
              ) : undefined
            }
            onClick={() => setPinnedAgentExpanded((prev) => !prev)}
          />
        </div>
      )}

      {/* Agent 模式：置顶会话区域 */}
      {mode === 'agent' && pinnedAgentExpanded && pinnedAgentSessions.length > 0 && (
        <div className="px-3 pt-1 pb-1">
          <div className="flex flex-col gap-0.5 pl-1 border-l-2 border-primary/20 ml-2">
            {orderedPinnedAgentSessions.map((session, index) => (
              <AgentSessionItem
                key={`pinned-${session.id}`}
                session={session}
                active={session.id === activeTabId}
                hovered={session.id === hoveredId}
                running={agentRunningIds.has(session.id)}
                showPinIcon={false}
                reorderSection="agent-pinned"
                reorderIndex={index}
                onSelect={() => handleSelectAgentSession(session.id, session.title)}
                onRequestDelete={() => handleRequestDelete(session.id)}
                onRequestMove={() => setMoveTargetId(session.id)}
                onRename={handleAgentRename}
                onTogglePin={handleTogglePinAgent}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDragStart={startSidebarDrag}
                onDragMove={markSidebarDragging}
                onDragHover={handleSidebarReorderHover}
                onDragFinish={finishSidebarDrag}
                onDragCancel={cancelSidebarDrag}
                onSuppressClick={suppressNextClick}
                shouldSuppressClick={shouldSuppressClick}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'agent' && (
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none">
          <div className="flex flex-col gap-0.5">
            {orderedNormalAgentSessions.map((session, index) => (
              <AgentSessionItem
                key={session.id}
                session={session}
                active={session.id === activeTabId}
                hovered={session.id === hoveredId}
                running={agentRunningIds.has(session.id)}
                showPinIcon={false}
                reorderSection="agent-normal"
                reorderIndex={index}
                onSelect={() => handleSelectAgentSession(session.id, session.title)}
                onRequestDelete={() => handleRequestDelete(session.id)}
                onRequestMove={() => setMoveTargetId(session.id)}
                onRename={handleAgentRename}
                onTogglePin={handleTogglePinAgent}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDragStart={startSidebarDrag}
                onDragMove={markSidebarDragging}
                onDragHover={handleSidebarReorderHover}
                onDragFinish={finishSidebarDrag}
                onDragCancel={cancelSidebarDrag}
                onSuppressClick={suppressNextClick}
                shouldSuppressClick={shouldSuppressClick}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'agent' && orderedNormalAgentSessions.length === 0 && (
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none" />
      )}


      {/* Agent 模式：工作区能力指示器 */}
      {mode === 'agent' && capabilities && (
        <div className="px-3 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSettingsTab('agent'); handleItemClick('settings') }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-[12px] text-foreground/50 hover:bg-foreground/[0.04] hover:text-foreground/70 transition-colors titlebar-no-drag"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="flex items-center gap-1">
                    <Plug size={13} className="text-foreground/40" />
                    <span className="tabular-nums">{capabilities.mcpServers.filter((s) => s.enabled).length}</span>
                    <span className="text-foreground/30">MCP</span>
                  </span>
                  <span className="text-foreground/20">·</span>
                  <span className="flex items-center gap-1">
                    <Zap size={13} className="text-foreground/40" />
                    <span className="tabular-nums">{capabilities.skills.length}</span>
                    <span className="text-foreground/30">Skills</span>
                  </span>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">点击配置 MCP 与 Skills</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* 底部设置 */}
      <div className="px-3 pb-3">
        <SidebarItem
          icon={<Settings size={18} />}
          label="设置"
          active={activeItem === 'settings'}
          onClick={() => handleItemClick('settings')}
          suffix={
            (hasUpdate || hasEnvironmentIssues) ? (
              <span className="w-2 h-2 rounded-full bg-red-500" />
            ) : undefined
          }
        />
      </div>

      {deleteDialog}
      {moveDialog}
    </div>
  )
}

// ===== 对话列表项 =====

interface ConversationItemProps {
  conversation: ConversationMeta
  active: boolean
  hovered: boolean
  streaming: boolean
  /** 是否在标题旁显示 Pin 图标 */
  showPinIcon: boolean
  reorderSection: SidebarReorderSection
  reorderIndex: number
  onSelect: () => void
  onRequestDelete: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart: (section: SidebarReorderSection, itemId: string, pointerId: number, startX: number, startY: number) => void
  onDragMove: (section: SidebarReorderSection, itemId: string, clientX: number, clientY: number) => boolean
  onDragHover: (section: SidebarReorderSection, itemId: string, toIndex: number) => void
  onDragFinish: (section: SidebarReorderSection, itemId: string) => boolean
  onDragCancel: (section: SidebarReorderSection, itemId: string) => void
  onSuppressClick: (itemId: string) => void
  shouldSuppressClick: (itemId: string) => boolean
}

interface DragHoverTarget {
  section: SidebarReorderSection
  index: number
}

function getSidebarHoverTarget(clientX: number, clientY: number): DragHoverTarget | null {
  const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-sidebar-section][data-sidebar-index]')
  if (!target) return null

  const section = target.dataset.sidebarSection as SidebarReorderSection | undefined
  const indexValue = target.dataset.sidebarIndex
  if (!section || !indexValue) return null

  const index = Number(indexValue)
  if (Number.isNaN(index)) return null

  return { section, index }
}

function shouldIgnoreSidebarPointerDown(target: HTMLElement | null): boolean {
  if (!target) return false
  return target.closest('[data-sidebar-action="true"], input') !== null
}

function stopSidebarActionPointerDown(e: React.PointerEvent | React.MouseEvent): void {
  e.stopPropagation()
}

function stopSidebarActionClick(e: React.MouseEvent): void {
  e.stopPropagation()
}

function stopSidebarActionKeyDown(e: React.KeyboardEvent): void {
  e.stopPropagation()
}

function cancelSidebarItemClickIfNeeded(
  e: React.MouseEvent,
  itemId: string,
  shouldSuppressClick: (itemId: string) => boolean,
): boolean {
  if (!shouldSuppressClick(itemId)) return false
  e.preventDefault()
  e.stopPropagation()
  return true
}

function cleanupSidebarPointerListeners(cleanupRef: React.MutableRefObject<(() => void) | null>): void {
  cleanupRef.current?.()
  cleanupRef.current = null
}

function startSidebarPointerDrag(options: {
  section: SidebarReorderSection
  itemId: string
  pointerId: number
  startX: number
  startY: number
  onDragStart: (section: SidebarReorderSection, itemId: string, pointerId: number, startX: number, startY: number) => void
  onDragMove: (section: SidebarReorderSection, itemId: string, clientX: number, clientY: number) => boolean
  onDragHover: (section: SidebarReorderSection, itemId: string, toIndex: number) => void
  onDragFinish: (section: SidebarReorderSection, itemId: string) => boolean
  onDragCancel: (section: SidebarReorderSection, itemId: string) => void
  onSuppressClick: (itemId: string) => void
  cleanupRef: React.MutableRefObject<(() => void) | null>
}): void {
  const {
    section,
    itemId,
    pointerId,
    startX,
    startY,
    onDragStart,
    onDragMove,
    onDragHover,
    onDragFinish,
    onDragCancel,
    onSuppressClick,
    cleanupRef,
  } = options

  cleanupSidebarPointerListeners(cleanupRef)
  onDragStart(section, itemId, pointerId, startX, startY)

  const handleMove = (me: PointerEvent): void => {
    if (!onDragMove(section, itemId, me.clientX, me.clientY)) return
    me.preventDefault()
    const hoverTarget = getSidebarHoverTarget(me.clientX, me.clientY)
    if (!hoverTarget || hoverTarget.section !== section) return
    onDragHover(section, itemId, hoverTarget.index)
  }

  const stop = (): void => {
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    document.removeEventListener('pointercancel', handleCancel)
    cleanupRef.current = null
  }

  const handleUp = (): void => {
    const didDrag = onDragFinish(section, itemId)
    if (didDrag) onSuppressClick(itemId)
    stop()
  }

  const handleCancel = (): void => {
    onDragCancel(section, itemId)
    stop()
  }

  cleanupRef.current = stop
  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
  document.addEventListener('pointercancel', handleCancel)
}

function ConversationItem({
  conversation,
  active,
  hovered,
  streaming,
  showPinIcon,
  reorderSection,
  reorderIndex,
  onSelect,
  onRequestDelete,
  onRename,
  onTogglePin,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragMove,
  onDragHover,
  onDragFinish,
  onDragCancel,
  onSuppressClick,
  shouldSuppressClick,
}: ConversationItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)
  const dragCleanupRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => cleanupSidebarPointerListeners(dragCleanupRef)
  }, [])

  const startEdit = (): void => {
    setEditTitle(conversation.title)
    setEditing(true)
    justStartedEditing.current = true
    setTimeout(() => {
      justStartedEditing.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 300)
  }

  const saveTitle = async (): Promise<void> => {
    if (justStartedEditing.current) return
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === conversation.title) {
      setEditing(false)
      return
    }
    await onRename(conversation.id, trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  const handleClick = (e: React.MouseEvent): void => {
    if (cancelSidebarItemClickIfNeeded(e, conversation.id, shouldSuppressClick)) return
    if (editing) {
      e.preventDefault()
      return
    }
    onSelect()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || editing || shouldIgnoreSidebarPointerDown(e.target as HTMLElement | null)) return

    startSidebarPointerDrag({
      section: reorderSection,
      itemId: conversation.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      onDragStart,
      onDragMove,
      onDragHover,
      onDragFinish,
      onDragCancel,
      onSuppressClick,
      cleanupRef: dragCleanupRef,
    })
  }

  const isPinned = !!conversation.pinned

  return (
    <div
      role="button"
      tabIndex={0}
      data-sidebar-section={reorderSection}
      data-sidebar-index={reorderIndex}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation()
        startEdit()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-[7px] rounded-[10px] transition-colors duration-100 titlebar-no-drag text-left select-none',
        active
          ? 'bg-foreground/[0.08] dark:bg-foreground/[0.08] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.04]'
      )}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { void saveTitle() }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={stopSidebarActionPointerDown}
            className="w-full bg-transparent text-[13px] leading-5 text-foreground border-b border-primary/50 outline-none px-0 py-0"
            maxLength={100}
          />
        ) : (
          <div className={cn(
            'truncate text-[13px] leading-5 flex items-center gap-1.5',
            active ? 'text-foreground' : 'text-foreground/80'
          )}>
            {streaming && (
              <span className="relative flex-shrink-0 size-2">
                <span className="absolute inset-0 rounded-full bg-green-500/60 animate-ping" />
                <span className="relative block size-2 rounded-full bg-green-500" />
              </span>
            )}
            {showPinIcon && (
              <Pin size={11} className="flex-shrink-0 text-primary/60" />
            )}
            <span className="truncate">{conversation.title}</span>
          </div>
        )}
      </div>

      <div className={cn(
        'flex items-center gap-0.5 flex-shrink-0 transition-all duration-100',
        hovered && !editing ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                void onTogglePin(conversation.id)
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isPinned ? '取消置顶' : '置顶对话'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                startEdit()
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">重命名</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                onRequestDelete()
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">删除对话</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// ===== Agent 会话列表项 =====

interface AgentSessionItemProps {
  session: AgentSessionMeta
  active: boolean
  hovered: boolean
  running: boolean
  showPinIcon?: boolean
  reorderSection: SidebarReorderSection
  reorderIndex: number
  onSelect: () => void
  onRequestDelete: () => void
  onRequestMove: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart: (section: SidebarReorderSection, itemId: string, pointerId: number, startX: number, startY: number) => void
  onDragMove: (section: SidebarReorderSection, itemId: string, clientX: number, clientY: number) => boolean
  onDragHover: (section: SidebarReorderSection, itemId: string, toIndex: number) => void
  onDragFinish: (section: SidebarReorderSection, itemId: string) => boolean
  onDragCancel: (section: SidebarReorderSection, itemId: string) => void
  onSuppressClick: (itemId: string) => void
  shouldSuppressClick: (itemId: string) => boolean
}

function AgentSessionItem({
  session,
  active,
  hovered,
  running,
  showPinIcon,
  reorderSection,
  reorderIndex,
  onSelect,
  onRequestDelete,
  onRequestMove,
  onRename,
  onTogglePin,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragMove,
  onDragHover,
  onDragFinish,
  onDragCancel,
  onSuppressClick,
  shouldSuppressClick,
}: AgentSessionItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)
  const dragCleanupRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => cleanupSidebarPointerListeners(dragCleanupRef)
  }, [])

  const startEdit = (): void => {
    setEditTitle(session.title)
    setEditing(true)
    justStartedEditing.current = true
    setTimeout(() => {
      justStartedEditing.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 300)
  }

  const saveTitle = async (): Promise<void> => {
    if (justStartedEditing.current) return
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === session.title) {
      setEditing(false)
      return
    }
    await onRename(session.id, trimmed)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  const handleClick = (e: React.MouseEvent): void => {
    if (cancelSidebarItemClickIfNeeded(e, session.id, shouldSuppressClick)) return
    if (editing) {
      e.preventDefault()
      return
    }
    onSelect()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || editing || shouldIgnoreSidebarPointerDown(e.target as HTMLElement | null)) return

    startSidebarPointerDrag({
      section: reorderSection,
      itemId: session.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      onDragStart,
      onDragMove,
      onDragHover,
      onDragFinish,
      onDragCancel,
      onSuppressClick,
      cleanupRef: dragCleanupRef,
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-sidebar-section={reorderSection}
      data-sidebar-index={reorderIndex}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation()
        startEdit()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-[7px] rounded-[10px] transition-colors duration-100 titlebar-no-drag text-left select-none',
        active
          ? 'bg-foreground/[0.08] dark:bg-foreground/[0.08] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.04]'
      )}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { void saveTitle() }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={stopSidebarActionPointerDown}
            className="w-full bg-transparent text-[13px] leading-5 text-foreground border-b border-primary/50 outline-none px-0 py-0"
            maxLength={100}
          />
        ) : (
          <div className={cn(
            'truncate text-[13px] leading-5 flex items-center gap-1.5',
            active ? 'text-foreground' : 'text-foreground/80'
          )}>
            {running && (
              <span className="relative flex-shrink-0 size-4 flex items-center justify-center">
                <span className="absolute size-2 rounded-full bg-blue-500/60 animate-ping" />
                <span className="relative block size-2 rounded-full bg-blue-500" />
              </span>
            )}
            {showPinIcon && (
              <Pin size={11} className="flex-shrink-0 text-primary/60" />
            )}
            <span className="truncate">{session.title}</span>
          </div>
        )}
      </div>

      <div className={cn(
        'flex items-center gap-0.5 flex-shrink-0 transition-all duration-100',
        hovered && !editing ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                void onTogglePin(session.id)
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              {session.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{session.pinned ? '取消置顶' : '置顶会话'}</TooltipContent>
        </Tooltip>
        {!running && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                data-sidebar-action="true"
                onPointerDown={stopSidebarActionPointerDown}
                onClick={(e) => {
                  stopSidebarActionClick(e)
                  onRequestMove()
                }}
                onKeyDown={stopSidebarActionKeyDown}
                className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
              >
                <ArrowRightLeft size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">迁移到其他工作区</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                startEdit()
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/[0.08] hover:text-foreground/60 transition-colors"
            >
              <Pencil size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">重命名</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-sidebar-action="true"
              onPointerDown={stopSidebarActionPointerDown}
              onClick={(e) => {
                stopSidebarActionClick(e)
                onRequestDelete()
              }}
              onKeyDown={stopSidebarActionKeyDown}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">删除会话</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
