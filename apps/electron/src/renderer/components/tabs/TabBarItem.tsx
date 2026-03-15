/**
 * TabBarItem — 单个标签页 UI
 *
 * 显示：类型图标 + 标题 + 流式指示器 + 关闭按钮
 * 支持：点击聚焦、中键关闭、拖拽重排
 */

import * as React from 'react'
import { MessageSquare, Bot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TabType } from '@/atoms/tab-atoms'

export interface TabBarItemProps {
  id: string
  type: TabType
  title: string
  isActive: boolean
  isStreaming: boolean
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
  onMiddleClick: () => void
  onDragStart: (e: React.PointerEvent) => void
}

function stopTabItemActionKeyDown(e: React.KeyboardEvent): void {
  e.stopPropagation()
}

function stopTabItemActionClick(e: React.MouseEvent): void {
  e.stopPropagation()
}

function stopTabItemActionPointerDown(e: React.PointerEvent): void {
  e.stopPropagation()
}

function shouldIgnoreTabPointerDown(target: HTMLElement | null): boolean {
  if (!target) return false
  return target.closest('[data-tab-action="true"]') !== null
}

function handleTabItemMiddleMouseDown(e: React.MouseEvent, onMiddleClick: () => void): void {
  if (e.button !== 1) return
  e.preventDefault()
  e.stopPropagation()
  onMiddleClick()
}

function handleTabItemPointerDown(
  e: React.PointerEvent,
  onDragStart: (e: React.PointerEvent) => void,
): void {
  if (shouldIgnoreTabPointerDown(e.target as HTMLElement | null)) return
  onDragStart(e)
}

function handleTabItemCloseKeyDown(
  e: React.KeyboardEvent,
  onClose: (e: React.MouseEvent) => void,
): void {
  stopTabItemActionKeyDown(e)
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onClose(e as unknown as React.MouseEvent)
}

function handleTabItemCloseClick(
  e: React.MouseEvent,
  onClose: (e: React.MouseEvent) => void,
): void {
  stopTabItemActionClick(e)
  onClose(e)
}

function TabBarItemCloseButton({
  isActive,
  onClose,
}: Pick<TabBarItemProps, 'isActive' | 'onClose'>): React.ReactElement {
  return (
    <span
      role="button"
      tabIndex={-1}
      data-tab-action="true"
      className={cn(
        'size-4 rounded-sm flex items-center justify-center shrink-0',
        'opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity',
        isActive && 'opacity-60',
      )}
      onPointerDown={stopTabItemActionPointerDown}
      onClick={(e) => handleTabItemCloseClick(e, onClose)}
      onKeyDown={(e) => handleTabItemCloseKeyDown(e, onClose)}
    >
      <X className="size-2.5" />
    </span>
  )
}

function TabBarItemRoot({
  id,
  isActive,
  onActivate,
  onMiddleClick,
  onDragStart,
  children,
}: Pick<TabBarItemProps, 'id' | 'isActive' | 'onActivate' | 'onMiddleClick' | 'onDragStart'> & { children: React.ReactNode }): React.ReactElement {
  return (
    <button
      type="button"
      data-tab-id={id}
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-[34px] min-w-[100px] max-w-[200px] shrink-0',
        'rounded-t-lg text-xs transition-colors select-none cursor-pointer',
        'border-t border-l border-r border-transparent',
        isActive
          ? 'bg-background text-foreground border-border/50 shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
      onClick={onActivate}
      onMouseDown={(e) => handleTabItemMiddleMouseDown(e, onMiddleClick)}
      onPointerDown={(e) => handleTabItemPointerDown(e, onDragStart)}
    >
      {children}
    </button>
  )
}

function TabBarItemContent({
  type,
  title,
  isStreaming,
}: Pick<TabBarItemProps, 'type' | 'title' | 'isStreaming'>): React.ReactElement {
  const Icon = type === 'chat' ? MessageSquare : Bot

  return (
    <>
      <Icon className="size-3 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-left">{title}</span>
      {isStreaming && (
        <span
          className={cn(
            'size-1.5 rounded-full shrink-0 animate-pulse',
            type === 'chat' ? 'bg-emerald-500' : 'bg-blue-500'
          )}
        />
      )}
    </>
  )
}

export function TabBarItem({
  id,
  type,
  title,
  isActive,
  isStreaming,
  onActivate,
  onClose,
  onMiddleClick,
  onDragStart,
}: TabBarItemProps): React.ReactElement {
  return (
    <TabBarItemRoot
      id={id}
      isActive={isActive}
      onActivate={onActivate}
      onMiddleClick={onMiddleClick}
      onDragStart={onDragStart}
    >
      <TabBarItemContent
        type={type}
        title={title}
        isStreaming={isStreaming}
      />
      <TabBarItemCloseButton
        isActive={isActive}
        onClose={onClose}
      />
    </TabBarItemRoot>
  )
}
