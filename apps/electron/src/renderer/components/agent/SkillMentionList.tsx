/**
 * SkillMentionList — / 触发的 Skill 下拉列表
 *
 * 显示当前工作区的 Skill 列表，支持键盘导航。
 * 通过 React.useImperativeHandle 暴露 onKeyDown 给 TipTap Suggestion。
 */

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SkillMeta } from '@proma/shared'

export interface SkillMentionItem {
  id: string
  name: string
  description?: string
}

export interface SkillMentionListProps {
  items: SkillMentionItem[]
  selectedIndex: number
  onSelect: (item: SkillMentionItem) => void
}

export interface SkillMentionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const SkillMentionList = React.forwardRef<SkillMentionRef, SkillMentionListProps>(
  function SkillMentionList({ items, selectedIndex, onSelect }, ref) {
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
          无匹配 Skill
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
            <Sparkles className="size-3.5 text-violet-500 flex-shrink-0" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate font-medium">{item.name}</span>
              {item.description && (
                <span className="truncate text-[10px] text-muted-foreground/70">{item.description}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    )
  },
)
