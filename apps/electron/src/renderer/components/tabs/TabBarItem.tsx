/**
 * TabBarItem — 单个标签页 UI
 *
 * 显示：类型图标 + 工作区名称 + 标题 + 流式指示器 + 关闭按钮
 * 支持：点击聚焦、中键关闭、拖拽重排、右键菜单（在新窗口打开）
 */

import * as React from 'react'
import { MessageSquare, Bot, X, ExternalLink, Copy, SplitSquareHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TabType } from '@/atoms/tab-atoms'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

export interface TabBarItemProps {
  id: string
  type: TabType
  title: string
  /** 工作区名称（可选，Agent 模式显示） */
  workspaceName?: string
  isActive: boolean
  isStreaming: boolean
  onActivate: () => void
  onClose: () => void
  onMiddleClick: () => void
  /** 拖拽相关 */
  onDragStart: (e: React.PointerEvent) => void
  /** 在新窗口打开 */
  onOpenInNewWindow?: () => void
  /** 复制标签页 */
  onDuplicate?: () => void
  /** 移动到分屏面板 */
  onMoveToPanel?: (panelIndex: number) => void
}

export function TabBarItem({
  type,
  title,
  workspaceName,
  isActive,
  isStreaming,
  onActivate,
  onClose,
  onMiddleClick,
  onDragStart,
  onOpenInNewWindow,
  onDuplicate,
  onMoveToPanel,
}: TabBarItemProps): React.ReactElement {
  const handleMouseDown = (e: React.MouseEvent): void => {
    // 中键点击关闭
    if (e.button === 1) {
      e.preventDefault()
      onMiddleClick()
    }
  }

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onClose()
  }

  const Icon = type === 'chat' ? MessageSquare : Bot

  const tabContent = (
    <button
      type="button"
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-[34px] min-w-[100px] max-w-[240px] shrink-0',
        'rounded-t-lg text-xs transition-colors select-none cursor-pointer',
        'border-t border-l border-r border-transparent',
        isActive
          ? 'bg-background text-foreground border-border/50 shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
      onClick={onActivate}
      onMouseDown={handleMouseDown}
      onPointerDown={onDragStart}
    >
      {/* 类型图标 */}
      <Icon className="size-3 shrink-0" />

      {/* 工作区名称（如果有） */}
      {workspaceName && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground shrink-0 max-w-[60px] truncate">
          {workspaceName}
        </span>
      )}

      {/* 标题 */}
      <span className="flex-1 min-w-0 truncate text-left">{title}</span>

      {/* 流式指示器 */}
      {isStreaming && (
        <span
          className={cn(
            'size-1.5 rounded-full shrink-0 animate-pulse',
            type === 'chat' ? 'bg-emerald-500' : 'bg-blue-500'
          )}
        />
      )}

      {/* 关闭按钮 */}
      <span
        role="button"
        tabIndex={-1}
        className={cn(
          'size-4 rounded-sm flex items-center justify-center shrink-0',
          'opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity',
          isActive && 'opacity-60',
        )}
        onClick={handleCloseClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleCloseClick(e as unknown as React.MouseEvent)
        }}
      >
        <X className="size-2.5" />
      </span>
    </button>
  )

  // 如果有右键菜单功能，包装 ContextMenu
  if (onOpenInNewWindow || onDuplicate || onMoveToPanel) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {tabContent}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {onOpenInNewWindow && (
            <ContextMenuItem onClick={onOpenInNewWindow}>
              <ExternalLink className="size-4 mr-2" />
              在新窗口打开
            </ContextMenuItem>
          )}
          {onDuplicate && (
            <ContextMenuItem onClick={onDuplicate}>
              <Copy className="size-4 mr-2" />
              复制标签页
            </ContextMenuItem>
          )}
          {onMoveToPanel && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onMoveToPanel(1)}>
                <SplitSquareHorizontal className="size-4 mr-2" />
                移动到右侧面板
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onClose} className="text-destructive">
            <X className="size-4 mr-2" />
            关闭标签页
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return tabContent
}
