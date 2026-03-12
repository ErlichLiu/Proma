/**
 * McpMentionList — $ 触发的 MCP Server 下拉列表
 *
 * 显示当前工作区的 MCP Server 列表，支持键盘导航。
 * 通过 React.useImperativeHandle 暴露 onKeyDown 给 TipTap Suggestion。
 */

import * as React from 'react'
import { Server } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface McpMentionItem {
  id: string
  name: string
  type: string
  enabled: boolean
}

export interface McpMentionListProps {
  items: McpMentionItem[]
  selectedIndex: number
  onSelect: (item: McpMentionItem) => void
}

export interface McpMentionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const McpMentionList = React.forwardRef<McpMentionRef, McpMentionListProps>(
  function McpMentionList({ items, selectedIndex, onSelect }, ref) {
    const [localIndex, setLocalIndex] = React.useState(selectedIndex)
    const containerRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
      setLocalIndex(0)
    }, [items])

    React.useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const item = container.children[localIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }, [localIndex])

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setLocalIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
          return true
        }
        if (event.key === 'ArrowDown') {
          setLocalIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
          return true
        }
        if (event.key === 'Enter') {
          const item = items[localIndex]
          if (item) onSelect(item)
          return true
        }
        if (event.key === 'Escape') {
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="rounded-lg border bg-popover p-2 shadow-lg text-[11px] text-muted-foreground">
          无匹配 MCP 服务
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className="rounded-lg border bg-popover shadow-lg overflow-y-auto max-h-[240px] min-w-[240px]"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent transition-colors',
              index === localIndex && 'bg-accent text-accent-foreground',
            )}
            onClick={() => onSelect(item)}
          >
            <Server className="size-3.5 text-emerald-500 flex-shrink-0" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate font-medium">{item.name}</span>
              <span className="truncate text-[10px] text-muted-foreground/70">
                {item.type} · {item.enabled ? '已启用' : '已禁用'}
              </span>
            </div>
          </button>
        ))}
      </div>
    )
  },
)
