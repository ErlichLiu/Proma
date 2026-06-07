/**
 * WorkspaceSelector — Agent 项目下拉选择器
 *
 * 使用 DropdownMenu 展示所有项目，支持切换、新建、重命名、删除。
 * 排序功能将在设置页中提供。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Check, ChevronDown, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { agentSessionsAtom, agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { useProjectActions } from '@/hooks/useProjectActions'
import type { AgentWorkspace } from '@proma/shared'

export function WorkspaceSelector(): React.ReactElement {
  const { workspaces, currentWorkspaceId, selectProject, createProject } = useProjectActions()
  const [, setWorkspaces] = useAtom(agentWorkspacesAtom)
  const [, setAgentSessions] = useAtom(agentSessionsAtom)

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)

  // 新建项目 Dialog
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState('')
  const createInputRef = React.useRef<HTMLInputElement>(null)

  // 重命名项目 Dialog
  const [renameTarget, setRenameTarget] = React.useState<AgentWorkspace | null>(null)
  const [renameName, setRenameName] = React.useState('')
  const renameInputRef = React.useRef<HTMLInputElement>(null)

  // 删除确认
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)

  // ===== 新建 =====

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

  // ===== 重命名 =====

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

  // ===== 删除 =====

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

  const canDelete = (ws: AgentWorkspace): boolean => {
    return ws.slug !== 'default' && workspaces.length > 1
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
        <DropdownMenuContent align="start" className="w-56 min-w-0 p-0.5">
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
              {canDelete(ws) && (
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

      {/* 新建项目 Dialog */}
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
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3 py-1.5 rounded-md text-sm text-foreground/60 hover:bg-foreground/[0.04] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!createName.trim()}
              className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              创建
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名项目 Dialog */}
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
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-3 py-1.5 rounded-md text-sm text-foreground/60 hover:bg-foreground/[0.04] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleRename()}
              disabled={!renameName.trim() || renameName.trim() === renameTarget?.name}
              className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(v) => { if (!v) setDeleteTargetId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              删除后项目配置将被移除，但目录文件会保留。确定要删除吗？
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
    </>
  )
}
