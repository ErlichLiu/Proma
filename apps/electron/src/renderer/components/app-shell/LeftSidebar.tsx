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
import { Pin, PinOff, Settings, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Plug, Zap, Archive, ArchiveRestore, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModeSwitcher } from './ModeSwitcher'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { settingsTabAtom } from '@/atoms/settings-tab'
import {
  conversationsAtom,
  currentConversationIdAtom,
  selectedModelAtom,
  streamingConversationIdsAtom,
} from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentRunningSessionIdsAtom,
  agentChannelIdAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  workspaceCapabilitiesVersionAtom,
  showArchivedSessionsAtom,
  sessionSearchKeywordAtom,
  filteredAgentSessionsAtom,
} from '@/atoms/agent-atoms'
import { userProfileAtom } from '@/atoms/user-profile'
import { hasUpdateAtom } from '@/atoms/updater'
import { hasEnvironmentIssuesAtom } from '@/atoms/environment'
import { WorkspaceSelector } from '@/components/agent/WorkspaceSelector'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import type { ActiveView } from '@/atoms/active-view'
import type { ConversationMeta, AgentSessionMeta, WorkspaceCapabilities } from '@proma/shared'

// ===== 可复用的编辑状态 Hook =====

interface UseEditableTitleReturn {
  editing: boolean
  editTitle: string
  inputRef: React.RefObject<HTMLInputElement>
  startEdit: (currentTitle: string) => void
  saveTitle: (currentTitle: string, onSave: (title: string) => Promise<void>) => Promise<void>
  setEditTitle: (title: string) => void
  cancelEdit: () => void
}

function useEditableTitle(): UseEditableTitleReturn {
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

  const startEdit = React.useCallback((currentTitle: string) => {
    setEditTitle(currentTitle)
    setEditing(true)
    justStartedEditing.current = true
    setTimeout(() => {
      justStartedEditing.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 300)
  }, [])

  const saveTitle = React.useCallback(async (
    currentTitle: string,
    onSave: (title: string) => Promise<void>
  ): Promise<void> => {
    if (justStartedEditing.current) return
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === currentTitle) {
      setEditing(false)
      return
    }
    await onSave(trimmed)
    setEditing(false)
  }, [editTitle])

  const cancelEdit = React.useCallback(() => {
    setEditing(false)
  }, [])

  return {
    editing,
    editTitle,
    inputRef,
    startEdit,
    saveTitle,
    setEditTitle,
    cancelEdit,
  }
}

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
  const [activeItem, setActiveItem] = React.useState<SidebarItemId>('all-chats')
  const [conversations, setConversations] = useAtom(conversationsAtom)
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  /** 待删除对话 ID，非空时显示确认弹窗 */
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  /** 置顶区域展开/收起 */
  const [pinnedExpanded, setPinnedExpanded] = React.useState(true)
  const setUserProfile = useSetAtom(userProfileAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const streamingIds = useAtomValue(streamingConversationIdsAtom)
  const mode = useAtomValue(appModeAtom)
  const hasUpdate = useAtomValue(hasUpdateAtom)
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom)

  // Agent 模式状态
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const [currentAgentSessionId, setCurrentAgentSessionId] = useAtom(currentAgentSessionIdAtom)
  const agentRunningIds = useAtomValue(agentRunningSessionIdsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const [showArchived, setShowArchived] = useAtom(showArchivedSessionsAtom)
  const [searchKeyword, setSearchKeyword] = useAtom(sessionSearchKeywordAtom)
  const filteredAgentSessions = useAtomValue(filteredAgentSessionsAtom)

  // 工作区能力（MCP + Skill 计数）
  const [capabilities, setCapabilities] = React.useState<WorkspaceCapabilities | null>(null)
  const capabilitiesVersion = useAtomValue(workspaceCapabilitiesVersionAtom)

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

  /** 置顶对话列表 */
  const pinnedConversations = React.useMemo(
    () => conversations.filter((c) => c.pinned),
    [conversations]
  )

  /** 对话按日期分组 */
  const conversationGroups = React.useMemo(
    () => groupByDate(conversations),
    [conversations]
  )

  // 初始加载对话列表 + 用户档案 + Agent 会话
  React.useEffect(() => {
    window.electronAPI
      .listConversations()
      .then((list) => {
        setConversations(list)
        // 默认加载最近一条对话（按 updatedAt 降序，首条即最新）
        if (list.length > 0) {
          setCurrentConversationId(list[0]!.id)
        }
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
  }, [setConversations, setCurrentConversationId, setUserProfile, setAgentSessions])

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
      setCurrentConversationId(meta.id)
      // 确保在对话视图
      setActiveView('conversations')
      setActiveItem('all-chats')
    } catch (error) {
      console.error('[侧边栏] 创建对话失败:', error)
    }
  }

  /** 选择对话 */
  const handleSelectConversation = (id: string): void => {
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
      setCurrentAgentSessionId(meta.id)
      setActiveView('conversations')
      setActiveItem('all-chats')
    } catch (error) {
      console.error('[侧边栏] 创建 Agent 会话失败:', error)
    }
  }

  /** 选择 Agent 会话 */
  const handleSelectAgentSession = (id: string): void => {
    setCurrentAgentSessionId(id)
    setActiveView('conversations')
    setActiveItem('all-chats')
  }

  /** 重命名 Agent 会话标题 */
  const handleAgentRename = async (id: string, newTitle: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateAgentSessionTitle(id, newTitle)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === id ? updated : s))
      )
    } catch (error) {
      console.error('[侧边栏] 重命名 Agent 会话失败:', error)
    }
  }

  /** 切换 Agent 会话归档状态 */
  const handleToggleArchive = async (id: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.toggleArchiveAgentSession(id)
      setAgentSessions((prev) =>
        prev.map((s) => (s.id === id ? updated : s))
      )
    } catch (error) {
      console.error('[侧边栏] 切换归档状态失败:', error)
    }
  }

  /** Agent 会话按日期分组 */
  const agentSessionGroups = groupByDate(filteredAgentSessions)

  return (
    <div
      className="h-full flex flex-col bg-background"
      style={{ width: width ?? 280, minWidth: 180, flexShrink: 1 }}
    >
      {/* 顶部留空，避开 macOS 红绿灯 */}
      <div className="pt-[50px]">
        {/* 模式切换器 */}
        <ModeSwitcher />
      </div>

      {/* Agent 模式：工作区选择器 + 归档切换 + 搜索 */}
      {mode === 'agent' && (
        <div className="px-3 pt-3 space-y-2">
          <WorkspaceSelector />

          {/* 归档切换 */}
          <div className="flex rounded-lg bg-muted p-1 gap-1">
            <button
              onClick={() => setShowArchived(false)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                !showArchived
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              活跃
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                showArchived
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              归档
            </button>
          </div>

          {/* 搜索输入框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
            <Input
              type="text"
              placeholder="搜索会话..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-8 pl-8 text-[13px] bg-foreground/[0.03] border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
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
            {pinnedConversations.map((conv) => (
              <ConversationItem
                key={`pinned-${conv.id}`}
                conversation={conv}
                active={conv.id === currentConversationId}
                hovered={conv.id === hoveredId}
                streaming={streamingIds.has(conv.id)}
                showPinIcon={false}
                onSelect={() => handleSelectConversation(conv.id)}
                onRequestDelete={() => handleRequestDelete(conv.id)}
                onRename={handleRename}
                onTogglePin={handleTogglePin}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 列表区域：根据模式切换 */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 scrollbar-none">
        {mode === 'chat' ? (
          /* Chat 模式：对话按日期分组 */
          conversationGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    active={conv.id === currentConversationId}
                    hovered={conv.id === hoveredId}
                    streaming={streamingIds.has(conv.id)}
                    showPinIcon={!!conv.pinned}
                    onSelect={() => handleSelectConversation(conv.id)}
                    onRequestDelete={() => handleRequestDelete(conv.id)}
                    onRename={handleRename}
                    onTogglePin={handleTogglePin}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          /* Agent 模式：Agent 会话按日期分组 */
          agentSessionGroups.length > 0 ? (
            agentSessionGroups.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-foreground/40 select-none">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((session) => (
                    <AgentSessionItem
                      key={session.id}
                      session={session}
                      active={session.id === currentAgentSessionId}
                      hovered={session.id === hoveredId}
                      running={agentRunningIds.has(session.id)}
                      onSelect={() => handleSelectAgentSession(session.id)}
                      onRequestDelete={() => handleRequestDelete(session.id)}
                      onRename={handleAgentRename}
                      onToggleArchive={handleToggleArchive}
                      onMouseEnter={() => setHoveredId(session.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* 空状态 */
            <EmptyState searchKeyword={searchKeyword} showArchived={showArchived} />
          )
        )}
      </div>

      {/* Agent 模式：工作区能力指示器 */}
      {mode === 'agent' && capabilities && (
        <div className="px-3 pb-1">
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

      {/* 删除确认弹窗 */}
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
    </div>
  )
}

// ===== 空状态组件 =====

interface EmptyStateProps {
  searchKeyword: string
  showArchived: boolean
}

function EmptyState({ searchKeyword, showArchived }: EmptyStateProps): React.ReactElement {
  if (searchKeyword) {
    return (
      <div className="px-3 py-8 text-center">
        <Search size={32} className="mx-auto mb-2 text-muted-foreground/40" />
        <div className="text-[13px] text-muted-foreground">
          未找到 &quot;{searchKeyword}&quot; 相关的会话
        </div>
      </div>
    )
  }

  if (showArchived) {
    return (
      <div className="px-3 py-8 text-center">
        <Archive size={32} className="mx-auto mb-2 text-muted-foreground/40" />
        <div className="text-[13px] text-muted-foreground">暂无归档会话</div>
      </div>
    )
  }

  return (
    <div className="px-3 py-8 text-center">
      <div className="text-[13px] text-muted-foreground">当前工作区暂无会话</div>
      <div className="text-[11px] text-muted-foreground/60 mt-1">
        点击上方按钮创建新会话
      </div>
    </div>
  )
}

// ===== 可复用的标题输入组件 =====

interface TitleInputProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  inputRef: React.RefObject<HTMLInputElement>
}

function TitleInput({ value, onChange, onSave, onCancel, inputRef }: TitleInputProps): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onSave}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-transparent text-[13px] leading-5 text-foreground border-b border-primary/50 outline-none px-0 py-0"
      maxLength={100}
    />
  )
}

// ===== 可复用的列表项容器 =====

interface ListItemContainerProps {
  children: React.ReactNode
  active: boolean
  hovered: boolean
  editing: boolean
  onSelect: () => void
  onStartEdit: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  deleteButton: React.ReactNode
  extraButton?: React.ReactNode
}

function ListItemContainer({
  children,
  active,
  hovered,
  editing,
  onSelect,
  onStartEdit,
  onMouseEnter,
  onMouseLeave,
  deleteButton,
  extraButton,
}: ListItemContainerProps): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-[7px] rounded-[10px] transition-colors duration-100 titlebar-no-drag text-left',
        active
          ? 'bg-foreground/[0.08] dark:bg-foreground/[0.08] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.04]'
      )}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <div
        className={cn(
          'flex-shrink-0 flex items-center gap-1 transition-all duration-100',
          hovered && !editing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {extraButton}
        {deleteButton}
      </div>
    </div>
  )
}

// ===== 对话列表项 =====

interface ConversationItemProps {
  conversation: ConversationMeta
  active: boolean
  hovered: boolean
  streaming: boolean
  showPinIcon: boolean
  onSelect: () => void
  onRequestDelete: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
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
  onMouseEnter,
  onMouseLeave,
}: ConversationItemProps): React.ReactElement {
  const { editing, editTitle, inputRef, startEdit, saveTitle, setEditTitle, cancelEdit } = useEditableTitle()
  const isPinned = !!conversation.pinned

  const handleSave = async (): Promise<void> => {
    await saveTitle(conversation.title, (newTitle) => onRename(conversation.id, newTitle))
  }

  const handleStartEdit = (): void => {
    startEdit(conversation.title)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ListItemContainer
          active={active}
          hovered={hovered}
          editing={editing}
          onSelect={onSelect}
          onStartEdit={handleStartEdit}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          deleteButton={
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRequestDelete()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
              title="删除对话"
            >
              <Trash2 size={13} />
            </button>
          }
        >
          {editing ? (
            <TitleInput
              value={editTitle}
              onChange={setEditTitle}
              onSave={handleSave}
              onCancel={cancelEdit}
              inputRef={inputRef}
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
              {showPinIcon && <Pin size={11} className="flex-shrink-0 text-primary/60" />}
              <span className="truncate">{conversation.title}</span>
            </div>
          )}
        </ListItemContainer>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-40">
        <ContextMenuItem className="gap-2 text-[13px]" onSelect={() => onTogglePin(conversation.id)}>
          {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          {isPinned ? '取消置顶' : '置顶对话'}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2 text-[13px]" onSelect={handleStartEdit}>
          <Pencil size={14} />
          重命名
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onSelect={onRequestDelete}>
          <Trash2 size={14} />
          删除对话
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ===== Agent 会话列表项 =====

interface AgentSessionItemProps {
  session: AgentSessionMeta
  active: boolean
  hovered: boolean
  running: boolean
  onSelect: () => void
  onRequestDelete: () => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function AgentSessionItem({
  session,
  active,
  hovered,
  running,
  onSelect,
  onRequestDelete,
  onRename,
  onToggleArchive,
  onMouseEnter,
  onMouseLeave,
}: AgentSessionItemProps): React.ReactElement {
  const { editing, editTitle, inputRef, startEdit, saveTitle, setEditTitle, cancelEdit } = useEditableTitle()

  const handleSave = async (): Promise<void> => {
    await saveTitle(session.title, (newTitle) => onRename(session.id, newTitle))
  }

  const handleStartEdit = (): void => {
    startEdit(session.title)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ListItemContainer
          active={active}
          hovered={hovered}
          editing={editing}
          onSelect={onSelect}
          onStartEdit={handleStartEdit}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          extraButton={
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleArchive(session.id)
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-foreground/10 hover:text-foreground transition-all duration-100"
              title={session.archived ? '取消归档' : '归档会话'}
            >
              {session.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
          }
          deleteButton={
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRequestDelete()
              }}
              className="p-1 rounded-md text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
              title="删除会话"
            >
              <Trash2 size={13} />
            </button>
          }
        >
          {editing ? (
            <TitleInput
              value={editTitle}
              onChange={setEditTitle}
              onSave={handleSave}
              onCancel={cancelEdit}
              inputRef={inputRef}
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
              <span className="truncate">{session.title}</span>
            </div>
          )}
        </ListItemContainer>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-40">
        <ContextMenuItem className="gap-2 text-[13px]" onSelect={handleStartEdit}>
          <Pencil size={14} />
          重命名
        </ContextMenuItem>
        <ContextMenuItem className="gap-2 text-[13px]" onSelect={() => onToggleArchive(session.id)}>
          {session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {session.archived ? '取消归档' : '归档会话'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onSelect={onRequestDelete}>
          <Trash2 size={14} />
          删除会话
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
