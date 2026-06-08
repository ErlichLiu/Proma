/**
 * WorkspaceSelector — Agent 项目切换器
 *
 * 支持两种展示形态：
 * - dropdown（默认）：DropdownMenu 下拉选择器，节省侧边栏空间
 * - list：垂直列表，项目并排展示，支持内联重命名和拖拽排序
 *
 * 形态切换通过 workspaceListModeAtom 控制，在 AgentSettings 项目 Tab 中切换。
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Check, ChevronDown, FolderOpen, GripVertical, Pencil, Plus, Trash2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { agentSessionsAtom, agentWorkspacesAtom, agentSettingsTabAtom } from '@/atoms/agent-atoms'
import { settingsTabAtom, settingsOpenAtom, type SettingsTab } from '@/atoms/settings-tab'
import { workspaceListModeAtom, projectListHeightAtom } from '@/atoms/sidebar-atoms'
import { tabsAtom } from '@/atoms/tab-atoms'
import { useProjectActions } from '@/hooks/useProjectActions'
import type { AgentWorkspace, AgentSessionMeta } from '@proma/shared'

export function WorkspaceSelector(): React.ReactElement {
  const { workspaces, currentWorkspaceId, selectProject, createProject } = useProjectActions()
  const [, setWorkspaces] = useAtom(agentWorkspacesAtom)
  const [, setAgentSessions] = useAtom(agentSessionsAtom)
  const setTabs = useSetAtom(tabsAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setAgentSettingsTab = useSetAtom(agentSettingsTabAtom)

  const [workspaceListMode] = useAtom(workspaceListModeAtom)

  if (workspaceListMode === 'list') {
    return <WorkspaceListMode workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} selectProject={selectProject} createProject={createProject} setWorkspaces={setWorkspaces} setAgentSessions={setAgentSessions} setSettingsTab={setSettingsTab} setSettingsOpen={setSettingsOpen} setAgentSettingsTab={setAgentSettingsTab} setTabs={setTabs} />
  }

  return <WorkspaceDropdownMode workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} selectProject={selectProject} createProject={createProject} setWorkspaces={setWorkspaces} setAgentSessions={setAgentSessions} setSettingsTab={setSettingsTab} setSettingsOpen={setSettingsOpen} setAgentSettingsTab={setAgentSettingsTab} setTabs={setTabs} />
}

// ===== 共享状态与逻辑 =====

interface WorkspaceModeProps {
  workspaces: AgentWorkspace[]
  currentWorkspaceId: string | null
  selectProject: (id: string) => void
  createProject: (name: string) => Promise<AgentWorkspace | null>
  setWorkspaces: React.Dispatch<React.SetStateAction<AgentWorkspace[]>>
  setAgentSessions: React.Dispatch<React.SetStateAction<AgentSessionMeta[]>>
  setSettingsTab: (tab: SettingsTab) => void
  setSettingsOpen: (open: boolean) => void
  setAgentSettingsTab: (tab: string) => void
  setTabs: React.Dispatch<React.SetStateAction<import('@/atoms/tab-atoms').TabItem[]>>
}

const canDelete = (ws: AgentWorkspace, total: number): boolean => {
  return ws.slug !== 'default' && total > 1
}

const useDeleteConfirm = (setWorkspaces: WorkspaceModeProps['setWorkspaces'], setAgentSessions: WorkspaceModeProps['setAgentSessions'], setTabs: WorkspaceModeProps['setTabs'], currentWorkspaceId: string | null, selectProject: WorkspaceModeProps['selectProject'], workspaces: AgentWorkspace[]) => {
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteTargetId) return

    try {
      await window.electronAPI.deleteAgentWorkspace(deleteTargetId)
      const [remaining, sessions] = await Promise.all([
        window.electronAPI.listAgentWorkspaces(),
        window.electronAPI.listAgentSessions(),
      ])
      setWorkspaces(remaining)
      setAgentSessions(sessions)
      setTabs((prev) => prev.filter((t) => !t.pinned || t.workspaceId !== deleteTargetId))

      if (deleteTargetId === currentWorkspaceId && remaining.length > 0) {
        const defaultWorkspace = remaining.find((workspace) => workspace.slug === 'default')
        selectProject((defaultWorkspace ?? remaining[0]!).id)
      }
    } catch (error) {
      console.error('[WorkspaceSelector] 删除项目失败:', error)
    } finally {
      setDeleteTargetId(null)
    }
  }

  return { deleteTargetId, setDeleteTargetId, handleConfirmDelete }
}

const DeleteConfirmDialog = ({ deleteTargetId, setDeleteTargetId, handleConfirmDelete }: {
  deleteTargetId: string | null
  setDeleteTargetId: (id: string | null) => void
  handleConfirmDelete: () => Promise<void>
}) => (
  <AlertDialog open={deleteTargetId !== null} onOpenChange={(v) => { if (!v) setDeleteTargetId(null) }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>确认删除项目</AlertDialogTitle>
        <AlertDialogDescription>
          删除后项目配置将被移除，但目录文件会保留。确定要删除吗？
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          删除
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

// ===== 下拉选择器形态 =====

function WorkspaceDropdownMode(props: WorkspaceModeProps): React.ReactElement {
  const { workspaces, currentWorkspaceId, selectProject, createProject, setWorkspaces, setSettingsTab, setSettingsOpen, setAgentSettingsTab } = props
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState('')
  const createInputRef = React.useRef<HTMLInputElement>(null)

  const [renameTarget, setRenameTarget] = React.useState<AgentWorkspace | null>(null)
  const [renameName, setRenameName] = React.useState('')
  const renameInputRef = React.useRef<HTMLInputElement>(null)

  const { deleteTargetId, setDeleteTargetId, handleConfirmDelete } = useDeleteConfirm(props.setWorkspaces, props.setAgentSessions, props.setTabs, currentWorkspaceId, selectProject, workspaces)

  const handleCreate = async (): Promise<void> => {
    const result = await createProject(createName)
    if (result) {
      setCreateOpen(false)
      setCreateName('')
    }
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      void handleCreate()
    } else if (e.key === 'Escape') {
      setCreateOpen(false)
    }
  }

  const handleStartRename = (ws: AgentWorkspace): void => {
    setRenameTarget(ws)
    setRenameName(ws.name)
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }

  const handleRename = async (): Promise<void> => {
    if (!renameTarget) return
    const trimmed = renameName.trim()
    if (!trimmed || trimmed === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    try {
      const updated = await window.electronAPI.updateAgentWorkspace(renameTarget.id, { name: trimmed })
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    } catch (error) {
      const msg = error instanceof Error ? error.message : '重命名失败'
      toast.error(msg)
    } finally {
      setRenameTarget(null)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      void handleRename()
    } else if (e.key === 'Escape') {
      setRenameTarget(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] font-medium text-foreground/70 bg-primary/5 hover:bg-primary/10 transition-colors duration-100 titlebar-no-drag border border-dashed border-[hsl(var(--dashed-border))] hover:border-[hsl(var(--dashed-border-hover))]"
          >
            <FolderOpen size={14} className="flex-shrink-0 text-foreground/40" />
            <span className="flex-1 min-w-0 truncate text-left">{currentWorkspace?.name ?? '项目'}</span>
            <ChevronDown size={12} className="flex-shrink-0 text-foreground/30" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 z-[200] min-w-0 p-0.5">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              className={cn(
                'text-xs py-1.5 [&>svg]:size-3.5 gap-2',
                ws.id === currentWorkspaceId && 'font-medium',
              )}
              onSelect={() => selectProject(ws.id)}
            >
              {ws.id === currentWorkspaceId
                ? <Check size={14} className="text-primary" />
                : <span className="w-[14px]" />
              }
              <span className="flex-1 min-w-0 truncate">{ws.name}</span>
              {canDelete(ws, workspaces.length) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setDeleteTargetId(ws.id)
                  }}
                  className="p-0.5 rounded text-foreground/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="删除项目"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="my-0.5" />
          <DropdownMenuItem
            className="text-xs py-1.5 [&>svg]:size-3.5"
            onSelect={() => handleStartRename(currentWorkspace!)}
            disabled={!currentWorkspace}
          >
            <Pencil size={14} />
            重命名当前项目
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs py-1.5 [&>svg]:size-3.5"
            onSelect={() => {
              setAgentSettingsTab('workspaces')
              setSettingsTab('agent')
              setSettingsOpen(true)
            }}
          >
            <ArrowRight size={14} />
            项目排序设置...
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs py-1.5 [&>svg]:size-3.5"
            onSelect={() => {
              setCreateName('')
              setCreateOpen(true)
              requestAnimationFrame(() => createInputRef.current?.focus())
            }}
          >
            <Plus size={14} />
            新建项目...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <input
            ref={createInputRef}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            placeholder="项目名称..."
            className="w-full bg-transparent text-sm text-foreground border-b border-primary/50 outline-none px-0.5 py-1"
            maxLength={50}
            autoFocus
          />
          <DialogFooter>
            <button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-1.5 rounded-md text-sm text-foreground/60 hover:bg-foreground/[0.04] transition-colors">取消</button>
            <button type="button" onClick={() => void handleCreate()} disabled={!createName.trim()} className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">创建</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(v) => { if (!v) setRenameTarget(null) }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <input
            ref={renameInputRef}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            className="w-full bg-transparent text-sm text-foreground border-b border-primary/50 outline-none px-0.5 py-1"
            maxLength={50}
          />
          <DialogFooter>
            <button type="button" onClick={() => setRenameTarget(null)} className="px-3 py-1.5 rounded-md text-sm text-foreground/60 hover:bg-foreground/[0.04] transition-colors">取消</button>
            <button type="button" onClick={() => void handleRename()} disabled={!renameName.trim() || renameName.trim() === renameTarget?.name} className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">保存</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog deleteTargetId={deleteTargetId} setDeleteTargetId={setDeleteTargetId} handleConfirmDelete={handleConfirmDelete} />
    </>
  )
}

// ===== 垂直列表形态 =====

function WorkspaceListMode(props: WorkspaceModeProps): React.ReactElement {
  const { workspaces, currentWorkspaceId, selectProject, createProject, setWorkspaces } = props
  const [listHeight, setListHeight] = useAtom(projectListHeightAtom)

  // 高度拖拽调整
  const listRef = React.useRef<HTMLDivElement>(null)
  const resizing = React.useRef(false)
  const startY = React.useRef(0)
  const startH = React.useRef(0)
  const cleanupResizeRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => { cleanupResizeRef.current?.() }
  }, [])

  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizing.current = true
      startY.current = e.clientY
      startH.current = listRef.current?.getBoundingClientRect().height ?? 120

      const onMove = (ev: MouseEvent): void => {
        if (!resizing.current) return
        const delta = ev.clientY - startY.current
        const next = Math.min(400, Math.max(80, startH.current + delta))
        setListHeight(next)
      }
      const onUp = (): void => {
        resizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        cleanupResizeRef.current = null
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      cleanupResizeRef.current = onUp
    },
    [setListHeight],
  )

  // 新建状态
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const createInputRef = React.useRef<HTMLInputElement>(null)

  // 重命名状态
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const editInputRef = React.useRef<HTMLInputElement>(null)

  const { deleteTargetId, setDeleteTargetId, handleConfirmDelete } = useDeleteConfirm(props.setWorkspaces, props.setAgentSessions, props.setTabs, currentWorkspaceId, selectProject, workspaces)

  // 拖拽排序
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = React.useState<{ id: string; position: 'before' | 'after' } | null>(null)

  const handleSelect = (workspace: AgentWorkspace): void => {
    if (editingId) return
    selectProject(workspace.id)
  }

  const handleStartCreate = (): void => {
    setCreating(true)
    setNewName('')
    requestAnimationFrame(() => createInputRef.current?.focus())
  }

  const handleCreate = async (): Promise<void> => {
    const result = await createProject(newName)
    if (result) setCreating(false)
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      void handleCreate()
    } else if (e.key === 'Escape') {
      setCreating(false)
    }
  }

  const handleStartRename = (e: React.MouseEvent, ws: AgentWorkspace): void => {
    e.stopPropagation()
    setEditingId(ws.id)
    setEditName(ws.name)
    requestAnimationFrame(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    })
  }

  const handleRename = async (): Promise<void> => {
    if (!editingId) return
    const trimmed = editName.trim()
    if (!trimmed) { setEditingId(null); return }
    try {
      const updated = await window.electronAPI.updateAgentWorkspace(editingId, { name: trimmed })
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    } catch (error) {
      const msg = error instanceof Error ? error.message : '重命名失败'
      toast.error(msg)
    } finally {
      setEditingId(null)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      void handleRename()
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  // 拖拽排序
  const handleDragStart = (e: React.DragEvent, wsId: string): void => {
    setDragId(wsId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', wsId)
  }

  const handleDragOver = (e: React.DragEvent, wsId: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragId || wsId === dragId) { setDropIndicator(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    let position: 'before' | 'after'
    if (ratio < 0.35) position = 'before'
    else if (ratio > 0.65) position = 'after'
    else {
      if (dropIndicator?.id === wsId) return
      position = ratio < 0.5 ? 'before' : 'after'
    }
    if (dropIndicator?.id === wsId && dropIndicator.position === position) return
    setDropIndicator({ id: wsId, position })
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndicator(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string): void => {
    e.preventDefault()
    if (!dragId || dragId === targetId || !dropIndicator || dropIndicator.id !== targetId) {
      setDragId(null); setDropIndicator(null); return
    }
    const fromIdx = workspaces.findIndex((w) => w.id === dragId)
    const toIdx = workspaces.findIndex((w) => w.id === targetId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDropIndicator(null); return }
    const reordered = [...workspaces]
    const [moved] = reordered.splice(fromIdx, 1)
    const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
    const insertIdx = dropIndicator.position === 'after' ? adjustedToIdx + 1 : adjustedToIdx
    reordered.splice(insertIdx, 0, moved!)
    setWorkspaces(reordered)
    setDragId(null)
    setDropIndicator(null)
    window.electronAPI.reorderAgentWorkspaces(reordered.map((w) => w.id)).catch(console.error)
  }

  const handleDragEnd = (): void => { setDragId(null); setDropIndicator(null) }

  return (
    <>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/40">
          <span className="text-[11px] font-medium text-foreground/50 uppercase tracking-wide">项目</span>
          <button
            onClick={handleStartCreate}
            className="p-1 rounded hover:bg-foreground/[0.06] text-foreground/35 hover:text-foreground/60 transition-colors titlebar-no-drag"
            title="新建项目"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* 项目列表 */}
        <div
          ref={listRef}
          className="overflow-y-auto scrollbar-thin flex flex-col p-1"
          style={{ maxHeight: listHeight }}
        >
          {workspaces.map((ws) => (
            <div key={ws.id} className="relative">
              {dropIndicator?.id === ws.id && dropIndicator.position === 'before' && (
                <div className="absolute top-0 left-1 right-1 h-0.5 bg-primary rounded-full z-10" />
              )}
              <div
                draggable={editingId !== ws.id}
                onDragStart={(e) => handleDragStart(e, ws.id)}
                onDragOver={(e) => handleDragOver(e, ws.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, ws.id)}
                onDragEnd={handleDragEnd}
                onClick={() => handleSelect(ws)}
                className={cn(
                  'group w-full flex items-center gap-1 px-1 py-[5px] rounded-md text-[13px] transition-colors duration-100 cursor-pointer titlebar-no-drag',
                  ws.id === currentWorkspaceId
                    ? 'workspace-item-selected bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
                    : 'text-foreground/70 hover:bg-foreground/[0.04]',
                  dragId === ws.id && 'opacity-40',
                )}
              >
                <GripVertical size={12} className="flex-shrink-0 text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                <FolderOpen size={13} className="flex-shrink-0 text-foreground/40" />
                {editingId === ws.id ? (
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={() => void handleRename()}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground border-b border-primary/50 outline-none px-0.5"
                    maxLength={50}
                  />
                ) : (
                  <>
                    <span className="flex-1 min-w-0 truncate">{ws.name}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => handleStartRename(e, ws)}
                        className="p-0.5 rounded hover:bg-foreground/[0.08] text-foreground/30 hover:text-foreground/60 transition-colors"
                        title="重命名"
                      >
                        <Pencil size={12} />
                      </button>
                      {canDelete(ws, workspaces.length) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTargetId(ws.id) }}
                          className="p-0.5 rounded hover:bg-destructive/10 text-foreground/30 hover:text-destructive transition-colors"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              {dropIndicator?.id === ws.id && dropIndicator.position === 'after' && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full z-10" />
              )}
            </div>
          ))}
          {creating && (
            <div className="flex items-center gap-2 px-2 py-[5px]">
              <FolderOpen size={13} className="flex-shrink-0 text-foreground/40" />
              <input
                ref={createInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                onBlur={() => { if (newName.trim()) void handleCreate(); else setCreating(false) }}
                placeholder="项目名称..."
                className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground border-b border-primary/50 outline-none px-0.5"
                maxLength={50}
              />
            </div>
          )}
        </div>

        {/* 拖拽调整高度的 handle */}
        <div
          onMouseDown={handleResizeStart}
          className="h-1 cursor-row-resize group/resize flex items-center justify-center hover:bg-foreground/[0.06] transition-colors titlebar-no-drag"
        >
          <div className="w-8 h-[2px] rounded-full bg-foreground/0 group-hover/resize:bg-foreground/20 transition-colors" />
        </div>
      </div>

      <DeleteConfirmDialog deleteTargetId={deleteTargetId} setDeleteTargetId={setDeleteTargetId} handleConfirmDelete={handleConfirmDelete} />
    </>
  )
}
