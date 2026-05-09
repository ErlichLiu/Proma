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
import { Pin, PinOff, Settings, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Plug, Zap, PanelLeftClose, PanelLeftOpen, ArrowRightLeft, Search, Archive, ArchiveRestore, ArrowLeft, Hammer, GitFork, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ModeSwitcher } from './ModeSwitcher'
import { SearchDialog } from './SearchDialog'
import { UserAvatar } from '@/components/chat/UserAvatar'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsTabAtom, settingsOpenAtom } from '@/atoms/settings-tab'
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
  agentSessionIndicatorMapAtom,
  unviewedCompletedSessionIdsAtom,
  workingDoneSessionIdsAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  agentSessionChannelMapAtom,
  agentSessionModelMapAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  workspaceCapabilitiesVersionAtom,
  agentSidePanelOpenMapAtom,
} from '@/atoms/agent-atoms'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'
import {
  tabsAtom,
  activeTabIdAtom,
  sidebarCollapsedAtom,
  closeTab,
  updateTabTitle,
} from '@/atoms/tab-atoms'
import { userProfileAtom } from '@/atoms/user-profile'
import { sidebarViewModeAtom, agentSidebarTopHeightAtom } from '@/atoms/sidebar-atoms'
import { searchDialogOpenAtom } from '@/atoms/search-atoms'
import { hasUpdateAtom } from '@/atoms/updater'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import { workingSessionGroupsAtom, workingSessionIdsSetAtom } from '@/atoms/working-atoms'
import { hasEnvironmentIssuesAtom } from '@/atoms/environment'
import { promptConfigAtom, selectedPromptIdAtom, conversationPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import { useSyncActiveTabSideEffects } from '@/hooks/useSyncActiveTabSideEffects'
import { WorkspaceSelector } from '@/components/agent/WorkspaceSelector'
import { MoveSessionDialog } from '@/components/agent/MoveSessionDialog'
import { detectIsMac } from '@/lib/platform'
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
          ? 'bg-primary/10 text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'text-foreground/60 hover:bg-primary/5 hover:text-foreground'
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
type SidebarItemId = 'pinned' | 'all-chats'

/** 导航项到视图的映射 */
const ITEM_TO_VIEW: Record<SidebarItemId, ActiveView> = {
  pinned: 'conversations',
  'all-chats': 'conversations',
}

/** 日期分组标签 */
type DateGroup = '今天' | '昨天' | '更早'

/** 按 updatedAt 将项目分为 今天 / 昨天 / 更早 三组 */
function groupByDate<T extends { updatedAt: number }>(items: T[]): Array<{ label: DateGroup; items: T[] }> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000

  const today: T[] = []
  const yesterday: T[] = []
  const earlier: T[] = []

  for (const item of items) {
    if (item.updatedAt >= todayStart) {
      today.push(item)
    } else if (item.updatedAt >= yesterdayStart) {
      yesterday.push(item)
    } else {
      earlier.push(item)
    }
  }

  const groups: Array<{ label: DateGroup; items: T[] }> = []
  if (today.length > 0) groups.push({ label: '今天', items: today })
  if (yesterday.length > 0) groups.push({ label: '昨天', items: yesterday })
  if (earlier.length > 0) groups.push({ label: '更早', items: earlier })
  return groups
}

export function LeftSidebar({ width }: LeftSidebarProps): React.ReactElement {
  const [activeView, setActiveView] = useAtom(activeViewAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const [activeItem, setActiveItem] = React.useState<SidebarItemId>('all-chats')
  const [conversations, setConversations] = useAtom(conversationsAtom)
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom)
  const draftSessionIds = useAtomValue(draftSessionIdsAtom)
  const setDraftSessionIds = useSetAtom(draftSessionIdsAtom)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)

  // 窗口失焦时清除 hover 状态，防止 Tooltip 残留
  React.useEffect(() => {
    const handleBlur = (): void => setHoveredId(null)
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  /** 待删除对话 ID，非空时显示确认弹窗 */
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  /** 待迁移会话 ID，非空时显示迁移对话框 */
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null)
  /** 内联搜索文本 */
  const [searchQuery, setSearchQuery] = React.useState('')
  /** 置顶区域展开/收起 */
  const [pinnedExpanded, setPinnedExpanded] = React.useState(true)
  /** Agent 上区子 Tab：'working' | 'pinned'，默认 working 在前 */
  const [agentSubTab, setAgentSubTab] = React.useState<'working' | 'pinned'>('working')
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const streamingIds = useAtomValue(streamingConversationIdsAtom)
  const mode = useAtomValue(appModeAtom)
  const isMac = React.useMemo(() => detectIsMac(), [])
  const hasUpdate = useAtomValue(hasUpdateAtom)
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom)
  const promptConfig = useAtomValue(promptConfigAtom)
  const setSelectedPromptId = useSetAtom(selectedPromptIdAtom)

  // Agent 模式状态
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const [currentAgentSessionId, setCurrentAgentSessionId] = useAtom(currentAgentSessionIdAtom)
  const agentIndicatorMap = useAtomValue(agentSessionIndicatorMapAtom)
  const unviewedCompletedSessionIds = useAtomValue(unviewedCompletedSessionIdsAtom)
  const setUnviewedCompleted = useSetAtom(unviewedCompletedSessionIdsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const setSessionChannelMap = useSetAtom(agentSessionChannelMapAtom)
  const setSessionModelMap = useSetAtom(agentSessionModelMapAtom)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(currentAgentWorkspaceIdAtom)
  const [workspaces, setWorkspaces] = useAtom(agentWorkspacesAtom)

  // 工作区能力（MCP + Skill 计数）
  const [capabilities, setCapabilities] = React.useState<WorkspaceCapabilities | null>(null)
  const capabilitiesVersion = useAtomValue(workspaceCapabilitiesVersionAtom)

  // Tab 状态
  const [tabs, setTabs] = useAtom(tabsAtom)
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const openSession = useOpenSession()
  const syncActiveTabSideEffects = useSyncActiveTabSideEffects()

  // 归档 & 搜索状态
  const [viewMode, setViewMode] = useAtom(sidebarViewModeAtom)
  const setSearchDialogOpen = useSetAtom(searchDialogOpenAtom)

  // Agent 模式上区（Working/置顶）可拖拽高度
  /** -1 表示未初始化，首次渲染时按容器 40% 计算 */
  const [agentTopHeight, setAgentTopHeight] = useAtom(agentSidebarTopHeightAtom)
  const agentSplitContainerRef = React.useRef<HTMLDivElement>(null)
  const agentTopResizing = React.useRef(false)
  const agentTopResizeCleanup = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => { agentTopResizeCleanup.current?.() }
  }, [])

  React.useEffect(() => {
    if (agentTopHeight > 0) return
    const el = agentSplitContainerRef.current
    if (!el) return
    const h = el.getBoundingClientRect().height
    if (h > 0) {
      setAgentTopHeight(Math.round(h * 0.4))
    }
  }, [agentTopHeight, setAgentTopHeight, mode, viewMode])

  const handleAgentTopResizeStart = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = agentSplitContainerRef.current
      if (!container) return
      agentTopResizing.current = true
      const startY = e.clientY
      const startH = Math.max(0, agentTopHeight)
      const containerHeight = container.getBoundingClientRect().height
      const minH = 80
      const maxH = Math.max(minH, Math.floor(containerHeight * 0.7))

      const onMove = (ev: MouseEvent): void => {
        if (!agentTopResizing.current) return
        const delta = ev.clientY - startY
        const next = Math.min(maxH, Math.max(minH, startH + delta))
        setAgentTopHeight(next)
      }
      const onUp = (): void => {
        agentTopResizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        agentTopResizeCleanup.current = null
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      agentTopResizeCleanup.current = onUp
    },
    [agentTopHeight, setAgentTopHeight],
  )

  // 当 activeTabId 变化时，自动滚动侧边栏使选中项可见
  React.useEffect(() => {
    if (!activeTabId) return
    requestAnimationFrame(() => {
      const el = document.querySelector('.session-item-selected')
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [activeTabId])

  // per-conversation/session Map atoms（删除时清理）
  const setConvModels = useSetAtom(conversationModelsAtom)
  const setConvContextLength = useSetAtom(conversationContextLengthAtom)
  const setConvThinking = useSetAtom(conversationThinkingEnabledAtom)
  const setConvParallel = useSetAtom(conversationParallelModeAtom)
  const setConvPromptId = useSetAtom(conversationPromptIdAtom)
  const setAgentSidePanelOpen = useSetAtom(agentSidePanelOpenMapAtom)
  const setWorkingDone = useSetAtom(workingDoneSessionIdsAtom)

  /** 清理 per-conversation/session Map atoms 条目 */
  const cleanupMapAtoms = React.useCallback((id: string) => {
    const deleteKey = <T,>(prev: Map<string, T>): Map<string, T> => {
      if (!prev.has(id)) return prev
      const map = new Map(prev)
      map.delete(id)
      return map
    }
    setConvModels(deleteKey)
    setConvContextLength(deleteKey)
    setConvThinking(deleteKey)
    setConvParallel(deleteKey)
    setConvPromptId(deleteKey)
    setAgentSidePanelOpen(deleteKey)
    setSessionChannelMap(deleteKey)
    setSessionModelMap(deleteKey)
  }, [setConvModels, setConvContextLength, setConvThinking, setConvParallel, setConvPromptId, setAgentSidePanelOpen, setSessionChannelMap, setSessionModelMap])

  const currentWorkspaceSlug = React.useMemo(() => {
    if (!currentWorkspaceId) return null
    return workspaces.find((w) => w.id === currentWorkspaceId)?.slug ?? null
  }, [currentWorkspaceId, workspaces])

  const workspaceNameMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workspaces) map.set(w.id, w.name)
    return map
  }, [workspaces])

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

  /** 置顶对话列表（仅活跃模式显示，排除 draft） */
  const pinnedConversations = React.useMemo(
    () => viewMode === 'active' ? conversations.filter((c) => c.pinned && !draftSessionIds.has(c.id)) : [],
    [conversations, viewMode, draftSessionIds]
  )

  /** Working 区域状态 */
  const workingGroups = useAtomValue(workingSessionGroupsAtom)
  const workingSessionIds = useAtomValue(workingSessionIdsSetAtom)
  const hasWorkingSessions = workingGroups.todo.length > 0 || workingGroups.running.length > 0 || workingGroups.done.length > 0

  /** 置顶 Agent 会话列表（仅活跃模式显示，按当前工作区过滤，排除 draft 和 Working） */
  const pinnedAgentSessions = React.useMemo(
    () => viewMode === 'active' ? agentSessions.filter((s) => s.pinned && !draftSessionIds.has(s.id) && !workingSessionIds.has(s.id) && (!currentWorkspaceId || s.workspaceId === currentWorkspaceId)) : [],
    [agentSessions, viewMode, draftSessionIds, currentWorkspaceId, workingSessionIds]
  )

  /** 顶部 TabBar 切换 tab 时，自动同步上区子 Tab 到对应分类 */
  const prevActiveTabIdForSubTab = React.useRef<string | null>(activeTabId)
  React.useEffect(() => {
    if (activeTabId === prevActiveTabIdForSubTab.current) return
    prevActiveTabIdForSubTab.current = activeTabId
    if (mode !== 'agent' || viewMode !== 'active' || !activeTabId) return
    if (pinnedAgentSessions.some((s) => s.id === activeTabId)) {
      setAgentSubTab('pinned')
    } else if (workingSessionIds.has(activeTabId)) {
      setAgentSubTab('working')
    }
  }, [activeTabId, mode, viewMode, pinnedAgentSessions, workingSessionIds])

  /** 对话按日期分组（根据 viewMode 过滤归档状态，排除 draft，搜索过滤） */
  const conversationGroups = React.useMemo(
    () => {
      let filtered = viewMode === 'archived'
        ? conversations.filter((c) => c.archived && !draftSessionIds.has(c.id))
        : conversations.filter((c) => !c.archived && !c.pinned && !draftSessionIds.has(c.id))
      // 搜索过滤
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        filtered = filtered.filter((c) => c.title.toLowerCase().includes(q))
      }
      return groupByDate(filtered)
    },
    [conversations, viewMode, draftSessionIds, searchQuery]
  )

  /** 已归档对话数量 */
  const archivedConversationCount = React.useMemo(
    () => conversations.filter((c) => c.archived).length,
    [conversations]
  )

  /** 已归档 Agent 会话数量（当前工作区） */
  const archivedAgentSessionCount = React.useMemo(
    () => agentSessions.filter((s) => s.archived && (!currentWorkspaceId || s.workspaceId === currentWorkspaceId)).length,
    [agentSessions, currentWorkspaceId]
  )

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

  // 窗口聚焦时重新同步列表，修复长时间后前后端不一致
  React.useEffect(() => {
    const handleFocus = (): void => {
      window.electronAPI.listConversations().then(setConversations).catch(console.error)
      window.electronAPI.listAgentSessions().then(setAgentSessions).catch(console.error)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [setConversations, setAgentSessions])

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

  // 切换模式时重置归档视图
  React.useEffect(() => {
    setViewMode('active')
  }, [mode, setViewMode])

  /** 创建新对话（继承当前选中的模型/渠道） */
  const handleNewConversation = async (): Promise<void> => {
    try {
      const meta = await window.electronAPI.createConversation(
        undefined,
        selectedModel?.modelId,
        selectedModel?.channelId,
      )
      setConversations((prev) => [meta, ...prev])
      // 打开新标签页
      openSession('chat', meta.id, meta.title)
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
    openSession('chat', id, title)
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
      const original = conversations.find((c) => c.id === id)
      const updated = await window.electronAPI.togglePinConversation(id)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 归档会话被置顶时会自动取消归档
      if (original?.archived && updated.pinned && !updated.archived) {
        toast.success('已取消归档并置顶')
      }
    } catch (error) {
      console.error('[侧边栏] 切换置顶失败:', error)
    }
  }

  /** 切换对话归档状态 */
  const handleToggleArchive = async (id: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.toggleArchiveConversation(id)
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      )
      // 归档时自动关闭该对话的标签页，并同步新激活标签的副作用
      // （appMode、currentXxxId 等），避免文件面板/工具栏等 per-tab
      // 状态被遗留为旧值或被错误地置 null。
      if (updated.archived) {
        const wasActive = activeTabId === id
        const tabResult = closeTab(tabs, activeTabId, id)
        setTabs(tabResult.tabs)
        setActiveTabId(tabResult.activeTabId)
        cleanupMapAtoms(id)
        if (wasActive) {
          const newActiveTab = tabResult.activeTabId
            ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
            : null
          syncActiveTabSideEffects(newActiveTab)
        }
      }
      toast.success(updated.archived ? '已归档' : '已取消归档')
    } catch (error) {
      console.error('[侧边栏] 切换归档失败:', error)
    }
  }

  /** 确认删除对话 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!pendingDeleteId) return

    // 关闭对应的标签页：setTabs 与 setActiveTabId 成组更新，便于阅读，
    // 也避免将来在两者之间意外插入 await 导致跨渲染状态不一致。
    // （React 18 在同一事件回调中会自动批处理多次 setState，所以单次渲染
    // 的一致性由 React 保证，这里只是保持代码组织清晰。）
    const wasActive = activeTabId === pendingDeleteId
    const tabResult = closeTab(tabs, activeTabId, pendingDeleteId)
    setTabs(tabResult.tabs)
    setActiveTabId(tabResult.activeTabId)

    // 若关闭的是当前活跃标签，同步新激活标签的副作用（appMode、
    // currentXxxId、以及右侧文件面板等 per-tab 状态），保持与 TabBar
    // 关闭逻辑一致，避免删除/归档当前会话后新标签状态缺失。
    if (wasActive) {
      const newActiveTab = tabResult.activeTabId
        ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
        : null
      syncActiveTabSideEffects(newActiveTab)
    }

    // 清理 draft 标记（如有）
    setDraftSessionIds((prev: Set<string>) => {
      if (!prev.has(pendingDeleteId)) return prev
      const next = new Set(prev)
      next.delete(pendingDeleteId)
      return next
    })

    // 清理 per-conversation/session Map atoms 条目
    cleanupMapAtoms(pendingDeleteId)

    // 从 Working Done 集合移除
    setWorkingDone((prev) => {
      if (!prev.has(pendingDeleteId)) return prev
      const next = new Set(prev)
      next.delete(pendingDeleteId)
      return next
    })

    if (mode === 'agent') {
      // Agent 模式：删除 Agent 会话
      // 注意：当前会话指针（currentAgentSessionId）已由上面的
      // syncActiveTabSideEffects 在 wasActive 分支同步到新激活标签，
      // 这里不要再按旧闭包值强制置 null，否则会覆盖新 sessionId，
      // 导致 RightSidePanel 消失（依赖 currentAgentSessionIdAtom）。
      try {
        await window.electronAPI.deleteAgentSession(pendingDeleteId)
        // 全量刷新确保与后端同步
        const sessions = await window.electronAPI.listAgentSessions()
        setAgentSessions(sessions)
      } catch (error) {
        console.error('[侧边栏] 删除 Agent 会话失败:', error)
        // 即使后端报错，也从本地列表移除（可能是会话已不存在）
        setAgentSessions((prev) => prev.filter((s) => s.id !== pendingDeleteId))
      } finally {
        setPendingDeleteId(null)
      }
      return
    }

    try {
      await window.electronAPI.deleteConversation(pendingDeleteId)
      // 全量刷新确保与后端同步
      const conversations = await window.electronAPI.listConversations()
      setConversations(conversations)
    } catch (error) {
      console.error('[侧边栏] 删除对话失败:', error)
      // 即使后端报错，也从本地列表移除（可能是对话已不存在）
      setConversations((prev) => prev.filter((c) => c.id !== pendingDeleteId))
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
      // 从全局默认值初始化 per-session 渠道/模型配置
      if (agentChannelId) {
        setSessionChannelMap((prev) => {
          const map = new Map(prev)
          map.set(meta.id, agentChannelId)
          return map
        })
      }
      if (agentModelId) {
        setSessionModelMap((prev) => {
          const map = new Map(prev)
          map.set(meta.id, agentModelId)
          return map
        })
      }
      // 打开新标签页
      openSession('agent', meta.id, meta.title)
      setActiveView('conversations')
      setActiveItem('all-chats')
    } catch (error) {
      console.error('[侧边栏] 创建 Agent 会话失败:', error)
    }
  }

  /** 选择 Agent 会话（打开或聚焦标签页） */
  const handleSelectAgentSession = (id: string, title: string): void => {
    openSession('agent', id, title)
    setActiveView('conversations')
    setActiveItem('all-chats')
    // 清除该会话的"已完成未查看"标记
    setUnviewedCompleted((prev: Set<string>) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
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
      const original = agentSessions.find((s) => s.id === id)
      const updated = await window.electronAPI.togglePinAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 归档会话被置顶时会自动取消归档
      if (original?.archived && updated.pinned && !updated.archived) {
        toast.success('已取消归档并置顶')
      }
    } catch (error) {
      console.error('[侧边栏] 切换 Agent 会话置顶失败:', error)
    }
  }

  /** 切换 Agent 会话手动工作中状态 */
  const handleToggleManualWorkingAgent = async (id: string): Promise<void> => {
    try {
      const isCurrentlyInWorking = workingSessionIds.has(id)
      if (isCurrentlyInWorking) {
        // 从工作中移出：清除 manualWorking + 清除 workingDone
        const session = agentSessions.find((s) => s.id === id)
        if (session?.manualWorking) {
          const updated = await window.electronAPI.toggleManualWorkingAgentSession(id)
          setAgentSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          )
        }
        setWorkingDone((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        // 加入工作中
        const original = agentSessions.find((s) => s.id === id)
        const updated = await window.electronAPI.toggleManualWorkingAgentSession(id)
        setAgentSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        )
        if (original?.archived && updated.manualWorking && !updated.archived) {
          toast.success('已取消归档并标记为工作中')
        }
      }
    } catch (error) {
      console.error('[Sidebar] Failed to toggle manual working:', error)
      toast.error('操作失败')
    }
  }

  /** 切换 Agent 会话归档状态 */
  const handleToggleArchiveAgent = async (id: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.toggleArchiveAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      // 归档时自动关闭该会话的标签页，并同步新激活标签的副作用，
      // 否则 RightSidePanel（依赖 currentAgentSessionIdAtom）会因为
      // 指针被错误置 null 而消失。
      if (updated.archived) {
        const wasActive = activeTabId === id
        const tabResult = closeTab(tabs, activeTabId, id)
        setTabs(tabResult.tabs)
        setActiveTabId(tabResult.activeTabId)
        cleanupMapAtoms(id)
        // 从 Working Done 集合移除
        setWorkingDone((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        if (wasActive) {
          const newActiveTab = tabResult.activeTabId
            ? tabResult.tabs.find((t) => t.id === tabResult.activeTabId) ?? null
            : null
          syncActiveTabSideEffects(newActiveTab)
        }
      }
      toast.success(updated.archived ? '已归档' : '已取消归档')
    } catch (error) {
      console.error('[侧边栏] 切换 Agent 会话归档失败:', error)
    }
  }

  /** Fork（分叉）Agent 会话 — 创建新会话包含历史，从当前位置继续 */
  const handleForkSession = async (id: string): Promise<void> => {
    try {
      const forked = await window.electronAPI.forkAgentSession({ sessionId: id })
      setAgentSessions((prev) => [forked, ...prev])
      openSession('agent', forked.id, forked.title)
      setActiveView('conversations')
      setActiveItem('all-chats')
      toast.success('已分叉会话', { description: `新会话：${forked.title}` })
    } catch (error) {
      console.error('[侧边栏] Fork 会话失败:', error)
      toast.error('Fork 会话失败')
    }
  }

  /** 迁移会话到另一个工作区后的回调 */
  const handleSessionMoved = (updatedSession: AgentSessionMeta, targetWorkspaceName: string): void => {
    setAgentSessions((prev) =>
      prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
    )
    // 如果迁移的是当前选中的会话，取消选中并关闭标签页
    if (currentAgentSessionId === updatedSession.id) {
      const tabResult = closeTab(tabs, activeTabId, updatedSession.id)
      setTabs(tabResult.tabs)
      setActiveTabId(tabResult.activeTabId)
      setCurrentAgentSessionId(null)
      // 从 Working Done 集合移除
      setWorkingDone((prev) => {
        if (!prev.has(updatedSession.id)) return prev
        const next = new Set(prev)
        next.delete(updatedSession.id)
        return next
      })
    }
    setMoveTargetId(null)
    toast.success('会话已迁移', {
      description: `已迁移到「${targetWorkspaceName}」，请切换工作区查看`,
    })
  }

  /** Agent 会话按工作区过滤 + 归档过滤 + 排除 draft + 排除 Working + 搜索过滤 */
  /** 1code 风格：扁平列表 — 所有会话按 updatedAt 排序，pinned 优先 */
  const filteredAgentSessions = React.useMemo(
    () => {
      let byWorkspace = agentSessions.filter((s) => s.workspaceId === currentWorkspaceId && !draftSessionIds.has(s.id))
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        byWorkspace = byWorkspace.filter((s) => s.title.toLowerCase().includes(q))
      }
      byWorkspace = viewMode === 'archived'
        ? byWorkspace.filter((s) => s.archived)
        : byWorkspace.filter((s) => !s.archived)
      // Sort: pinned first, then by updatedAt desc
      byWorkspace.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      })
      return byWorkspace
    },
    [agentSessions, currentWorkspaceId, viewMode, draftSessionIds, searchQuery]
  )

  /** Agent 会话按日期分组（Chat 模式保留） */
  const agentSessionGroups = React.useMemo(
    () => groupByDate(filteredAgentSessions),
    [filteredAgentSessions]
  )

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
        className="h-full flex flex-col items-center bg-background rounded-2xl shadow-xl transition-[width] duration-300"
        style={{ width: 48, flexShrink: 0 }}
      >
        {/* macOS 需要避开左上角红绿灯，其他平台保留紧凑呼吸感。 */}
        <div className={cn(isMac ? 'pt-[50px]' : 'pt-2')} />

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
                onClick={handleNewAgentSession}
                className="p-2 rounded-[10px] text-foreground/70 bg-primary/5 hover:bg-primary/10 transition-colors titlebar-no-drag border border-dashed border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]"
              >
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              新会话
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 弹性空间 */}
        <div className="flex-1" />

        {/* 用户头像（点击打开设置） */}
        <div className="pb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(true)}
                className="relative p-1 rounded-[10px] transition-colors titlebar-no-drag hover:bg-foreground/5"
              >
                <UserAvatar avatar={userProfile.avatar} size={28} />
                {(hasUpdate || hasEnvironmentIssues) && (
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </Tooltip>
        </div>

        {deleteDialog}
        {moveDialog}
        <SearchDialog />
      </div>
    )
  }

  // ===== 展开状态：完整侧边栏 =====
  return (
    <div
      className="h-full flex flex-col bg-background rounded-2xl shadow-xl transition-[width] duration-300"
      style={{ width: width ?? 280, minWidth: 180, flexShrink: 1 }}
    >
      {/* 1code-style top bar */}
      <div className={cn('flex items-center justify-between px-3 py-2 border-b border-border/40 flex-shrink-0', isMac && 'pt-[30px]')}>
        <div className="flex items-center gap-2.5">
          <span className="w-[6px] h-[6px] rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,.4)]" />
          <span className="text-[13px] font-bold text-foreground/80 tracking-tight">Proma</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="size-[28px] flex-shrink-0 flex items-center justify-center rounded-md text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-colors titlebar-no-drag"
            >
              <PanelLeftClose size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">收起侧边栏</TooltipContent>
        </Tooltip>
      </div>

      {/* 双列布局 — 左 workspace / 右 sessions */}
        <div className="flex-1 flex min-h-0">
          {/* LEFT COLUMN: Resizable workspace panel */}
          <ResizableWorkspacePanel>
            <WorkspaceSelector />
          </ResizableWorkspacePanel>

          {/* RIGHT COLUMN: Session list (flex-1) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Search */}
            <div className="px-2.5 pt-2 pb-1 flex-shrink-0">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-foreground/25" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索会话…"
                  className="w-full h-7 pl-7 pr-5 rounded-md bg-foreground/[0.04] text-[11px] text-foreground/60 placeholder:text-foreground/25 border border-transparent focus:border-primary/30 focus:bg-foreground/[0.06] outline-none transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-foreground/25 hover:text-foreground/50">
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* New session button */}
            <div className="px-2.5 pb-1.5 flex-shrink-0">
              <button
                onClick={handleNewAgentSession}
                className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-dashed border-border/60 bg-primary/5 hover:bg-primary/10 text-[12px] font-medium text-foreground/60 hover:text-foreground/80 transition-colors titlebar-no-drag"
              >
                <Plus size={12} />
                <span>新会话</span>
              </button>
            </div>

            {/* 1code-style flat session list — all sessions together, sorted by updatedAt */}
            <div className="flex-1 overflow-y-auto px-2.5 pb-2 scrollbar-none min-h-0">
              {/* Working indicator: dot accents for running/completed sessions */}
              {filteredAgentSessions.length > 0 ? (
                filteredAgentSessions.map((session) => (
                  <AgentSessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeTabId}
                    hovered={session.id === hoveredId}
                    indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
                    isInWorkingSection={workingSessionIds.has(session.id)}
                    leftAccent={
                      agentIndicatorMap.get(session.id) === 'running' ? 'blue'
                      : unviewedCompletedSessionIds.has(session.id) ? 'green'
                      : workingSessionIds.has(session.id) && agentIndicatorMap.get(session.id) !== 'completed' ? 'orange'
                      : undefined
                    }
                    showPinIcon={!!session.pinned}
                    onSelect={() => handleSelectAgentSession(session.id, session.title)}
                    onRequestDelete={() => handleRequestDelete(session.id)}
                    onRequestMove={() => setMoveTargetId(session.id)}
                    onFork={() => handleForkSession(session.id)}
                    onRename={handleAgentRename}
                    onTogglePin={handleTogglePinAgent}
                    onToggleManualWorking={handleToggleManualWorkingAgent}
                    onToggleArchive={handleToggleArchiveAgent}
                    onMouseEnter={() => setHoveredId(session.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ))
              ) : (
                <div className="px-2 py-4 text-[11px] text-foreground/30 text-center">暂无会话</div>
              )}
            </div>
          </div>
        </div>

      {/* 已归档入口 */}
      <div className="px-3 pb-1">
        {viewMode === 'active' ? (
          <>
            {archivedAgentSessionCount > 0 && (
              <button onClick={() => setViewMode('archived')} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/60 transition-colors titlebar-no-drag">
                <Archive size={13} className="text-foreground/30" />
                <span>已归档 ({archivedAgentSessionCount})</span>
              </button>
            )}
          </>
        ) : (
          <button onClick={() => setViewMode('active')} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] text-foreground/60 bg-foreground/[0.04] hover:bg-foreground/[0.07] hover:text-foreground/80 transition-colors titlebar-no-drag">
            <ArrowLeft size={13} className="text-foreground/50" />
            <span>返回活跃会话</span>
          </button>
        )}
      </div>

      {/* 工作区能力指示器 */}
      {capabilities && (
        <div className="px-3 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSettingsTab('agent'); setSettingsOpen(true) }}
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
            <TooltipContent side="top">点击配置 MCP 与 Skills</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* 底部：用户资料 + 设置入口 */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] transition-colors titlebar-no-drag text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <UserAvatar avatar={userProfile.avatar} size={28} />
          <span className="flex-1 text-sm truncate text-left">{userProfile.userName}</span>
          <div className="relative flex-shrink-0 text-foreground/40">
            <Settings size={16} />
            {(hasUpdate || hasEnvironmentIssues) && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
            )}
          </div>
        </button>
      </div>

      {deleteDialog}
      {moveDialog}
      <SearchDialog />
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
  onSelect: () => void
  onRequestDelete: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function ConversationItem({
  conversation,
  active,
  hovered,
  streaming,
  showPinIcon,
  onSelect,
  onRequestDelete,
  onRename,
  onTogglePin,
  onToggleArchive,
  onMouseEnter,
  onMouseLeave,
}: ConversationItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

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
    if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
    else if (e.key === 'Escape') { setEditing(false) }
  }

  const isPinned = !!conversation.pinned

  // 相对时间
  const timeAgo = React.useMemo(() => {
    const now = Date.now()
    const diff = now - conversation.updatedAt
    if (diff < 60_000) return 'now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
    return new Date(conversation.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }, [conversation.updatedAt])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); startEdit() }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'relative w-full text-left py-1.5 cursor-pointer group transition-colors duration-75 rounded-md',
        active
          ? 'session-item-selected bg-foreground/5 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
      )}
    >
      {/* 流式状态左侧竖条 */}
      {streaming && (
        <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-emerald-500 animate-pulse pointer-events-none" />
      )}

      <div className="flex items-start gap-2.5 pl-2">
        {/* Icon — 对话气泡 + 流式脉冲 */}
        <div className="pt-0.5 flex-shrink-0">
          <div className={cn(
            'h-2.5 w-2.5 rounded-full',
            streaming ? 'bg-emerald-500 animate-pulse' : 'bg-sky-400',
          )} />
        </div>

        {/* 文本区域 */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
          {editing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveTitle}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-[13px] leading-tight text-foreground border-b border-primary/50 outline-none px-0 py-0"
              maxLength={100}
            />
          ) : (
            <>
              <span className="truncate text-[13px] leading-tight block">
                {showPinIcon && <Pin size={10} className="inline-block mr-1 text-primary/60 -mt-0.5" />}
                {conversation.title || 'Untitled'}
              </span>
              <span className="text-[11px] text-muted-foreground/60 truncate block leading-tight">
                {timeAgo}
              </span>
            </>
          )}
        </div>

        {/* Hover — Archive */}
        <div
          className={cn(
            'flex-shrink-0 flex items-center transition-opacity duration-150',
            hovered && !editing ? 'opacity-100' : 'opacity-0',
          )}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onToggleArchive(conversation.id) }}
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={conversation.archived ? '取消归档' : '归档'}
          >
            {conversation.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Agent 会话列表项 =====

/** 会话行左侧状态色块的颜色 — 与 SessionIndicatorStatus 呼应 */
type SessionLeftAccent = 'orange' | 'blue' | 'green'
const SESSION_LEFT_ACCENT_CLASS: Record<SessionLeftAccent, string> = {
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
}

interface AgentSessionItemProps {
  session: AgentSessionMeta
  active: boolean
  hovered: boolean
  indicatorStatus: SessionIndicatorStatus
  showPinIcon?: boolean
  /** 是否在工作中分区（auto 或 manual） */
  isInWorkingSection?: boolean
  /** 行左侧状态色块；未传则不显示 */
  leftAccent?: SessionLeftAccent
  /** 工作区名称 Badge（跨工作区列表时显示） */
  workspaceName?: string
  onSelect: () => void
  onRequestDelete: () => void
  onRequestMove: () => void
  onFork?: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleManualWorking: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function AgentSessionItem({
  session,
  active,
  hovered,
  indicatorStatus,
  showPinIcon,
  isInWorkingSection,
  leftAccent,
  workspaceName,
  onSelect,
  onRequestDelete,
  onRequestMove,
  onFork,
  onRename,
  onTogglePin,
  onToggleManualWorking,
  onToggleArchive,
  onMouseEnter,
  onMouseLeave,
}: AgentSessionItemProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

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
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  // 相对时间
  const timeAgo = React.useMemo(() => {
    const now = Date.now()
    const diff = now - session.updatedAt
    if (diff < 60_000) return 'now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
    return new Date(session.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }, [session.updatedAt])

  // 状态色
  const statusColor = indicatorStatus === 'running' ? 'bg-emerald-500 animate-pulse'
    : indicatorStatus === 'completed' ? 'bg-green-500'
    : indicatorStatus === 'blocked' ? 'bg-amber-500'
    : 'bg-muted-foreground/30'

  const isPinned = !!session.pinned
  const canExport = indicatorStatus === 'idle' || indicatorStatus === 'completed'

  /** Copy session content to clipboard */
  const handleCopy = async (format: 'markdown' | 'json' | 'text') => {
    try {
      const msgs = await window.electronAPI.getAgentSessionSDKMessages(session.id)
      const output = formatContent(msgs, format)
      await navigator.clipboard.writeText(output)
      toast.success(`已复制为 ${format.toUpperCase()}`)
    } catch { toast.error('复制失败') }
  }

  /** Shared content formatter */
  const formatContent = (msgs: any[], format: 'markdown' | 'json' | 'text'): string => {
    if (format === 'json') return JSON.stringify(msgs, null, 2)
    let output = ''
    const isMD = format === 'markdown'
    for (const m of msgs) {
      const roleLabel = (m as any).type === 'user' ? (isMD ? '**User**' : 'User')
        : (m as any).type === 'assistant' ? (isMD ? '**Assistant**' : 'Assistant')
        : isMD ? '**System**' : 'System'
      const text = (m as any).message?.content?.map((c: any) => c.text ?? c.thinking ?? '').join('\n') ?? ''
      output += isMD ? `### ${roleLabel}\n${text}\n\n` : `[${roleLabel}]\n${text}\n\n`
    }
    return output
  }

  /** Export/download session as a file */
  const handleExport = async (format: 'markdown' | 'json' | 'text') => {
    try {
      const msgs = await window.electronAPI.getAgentSessionSDKMessages(session.id)
      const output = formatContent(msgs, format)
      const ext = format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt'
      const mime = format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'text/plain'
      const blob = new Blob([output], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeTitle = (session.title || 'untitled').replace(/[^a-zA-Z0-9一-龥_-]/g, '_').slice(0, 40)
      a.download = `${safeTitle}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`已导出为 ${format.toUpperCase()}`)
    } catch { toast.error('导出失败') }
  }

  // Context menu open state
  const [cmOpen, setCmOpen] = React.useState(false)
  const [cmPos, setCmPos] = React.useState({ x: 0, y: 0 })

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEdit()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setCmPos({ x: e.clientX, y: e.clientY })
          setCmOpen(true)
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          'relative w-full text-left py-1.5 cursor-pointer group transition-colors duration-75 rounded-md',
          active
            ? 'session-item-selected bg-foreground/5 text-foreground'
            : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
        )}
      >
      {/* 左侧状态色条 */}
      {leftAccent && (
        <span
          className={cn(
            'absolute left-0 top-1 bottom-1 w-[2px] rounded-full pointer-events-none',
            SESSION_LEFT_ACCENT_CLASS[leftAccent]
          )}
        />
      )}

      <div className={cn('flex items-start gap-2.5', leftAccent ? 'pl-2.5' : 'pl-2')}>
        {/* Icon — 状态圆点 + pin 标记 */}
        <div className="pt-0.5 flex-shrink-0 relative">
          <div className={cn('h-2.5 w-2.5 rounded-full', statusColor)} />
          {showPinIcon && (
            <Pin size={9} className="absolute -bottom-0.5 -right-0.5 text-primary/60" />
          )}
        </div>

        {/* 文本区域 */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
          {editing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveTitle}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-[13px] leading-tight text-foreground border-b border-primary/50 outline-none px-0 py-0"
              maxLength={100}
            />
          ) : (
            <>
              {/* 标题行 */}
              <span className="truncate text-[13px] leading-tight block">
                {isPinned && (
                  <Pin size={10} className="inline-block mr-1 text-primary/60 -mt-0.5" />
                )}
                {session.title || 'Untitled'}
                {workspaceName && (
                  <span className="ml-1.5 px-1 py-0 rounded-full bg-foreground/[0.06] text-[10px] text-foreground/40 font-medium">
                    {workspaceName}
                  </span>
                )}
              </span>
              {/* 副标题行：时间 */}
              <span className="text-[11px] text-muted-foreground/60 truncate block leading-tight">
                {timeAgo}
              </span>
            </>
          )}
        </div>

        {/* Hover 操作按钮 — Rename + Fork + Archive (1code 风格) */}
        <div
          className={cn(
            'flex-shrink-0 flex items-center gap-0.5 transition-opacity duration-150',
            hovered && !editing ? 'opacity-100' : 'opacity-0',
          )}
        >
          <button
            onClick={(e) => { e.stopPropagation(); startEdit() }}
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
            title="重命名"
          >
            <Pencil size={13} />
          </button>
          {onFork && (indicatorStatus === 'idle' || indicatorStatus === 'completed') && (
            <button
              onClick={(e) => { e.stopPropagation(); onFork() }}
              className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Fork"
            >
              <GitFork size={13} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleArchive(session.id) }}
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={session.archived ? '取消归档' : '归档'}
          >
            {session.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
        </div>
      </div>
    </div>

      {/* Native context menu positioned at click point */}
      {cmOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setCmOpen(false)} onContextMenu={(e) => { e.preventDefault(); setCmOpen(false) }} />
          <div
            className="fixed z-[9999] min-w-[160px] rounded-lg border border-border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 origin-top-left"
            style={{ left: Math.min(cmPos.x, window.innerWidth - 180), top: Math.min(cmPos.y, window.innerHeight - 350) }}
          >
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); startEdit() }}
            >
              <Pencil size={13} className="opacity-50" />
              <span>重命名</span>
            </div>
            {onFork && canExport && (
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                onClick={() => { setCmOpen(false); onFork() }}
              >
                <GitFork size={13} className="opacity-50" />
                <span>分叉会话</span>
              </div>
            )}
            <div className="h-px bg-border -mx-1 my-1" />
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleCopy('markdown') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">MD</span>
              <span>复制为 Markdown</span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleCopy('json') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">{'{ }'}</span>
              <span>复制为 JSON</span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleCopy('text') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">T</span>
              <span>复制为 Text</span>
            </div>
            <div className="h-px bg-border -mx-1 my-1" />
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleExport('markdown') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">⬇</span>
              <span>导出为 Markdown</span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleExport('json') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">⬇</span>
              <span>导出为 JSON</span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); handleExport('text') }}
            >
              <span className="w-[13px] text-center opacity-50 text-[10px]">⬇</span>
              <span>导出为 Text</span>
            </div>
            <div className="h-px bg-border -mx-1 my-1" />
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setCmOpen(false); onToggleArchive(session.id) }}
            >
              <Archive size={13} className="opacity-50" />
              <span>{session.archived ? '取消归档' : '归档'}</span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { setCmOpen(false); onRequestDelete() }}
            >
              <Trash2 size={13} className="opacity-50" />
              <span>删除</span>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** 可拖拽调整宽度的 Workspace 列 */
function ResizableWorkspacePanel({ children }: { children: React.ReactNode }): React.ReactElement {
  const [colWidth, setColWidth] = React.useState(() => {
    try {
      const saved = localStorage.getItem('proma-ws-col-width')
      if (saved) { const n = parseInt(saved, 10); if (n >= 100 && n <= 280) return n }
    } catch {}
    return 150
  })
  const resizingRef = React.useRef(false)

  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      setColWidth((w) => {
        const next = Math.min(280, Math.max(100, w + e.movementX))
        try { localStorage.setItem('proma-ws-col-width', String(next)) } catch {}
        return next
      })
    }
    const handleUp = () => {
      resizingRef.current = false
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
    <div className="flex-shrink-0 flex flex-col border-r border-border/40 bg-muted/30 overflow-hidden relative" style={{ width: colWidth }}>
      {children}
      {/* Drag handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 opacity-0 hover:opacity-100 transition-opacity group"
        onMouseDown={(e) => {
          e.preventDefault()
          resizingRef.current = true
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
      >
        <div className="absolute right-0 top-[20%] bottom-[20%] w-[2px] rounded-full bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}
