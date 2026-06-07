/**
 * AutomationPreviewPopover — 自动任务按钮的悬浮预览
 *
 * 在侧边栏「自动任务」按钮 hover 时弹出，列出当前 active=true 的任务清单。
 * 视觉与交互对齐 SessionMiniMapPopover（createPortal + 600ms 延迟 + 90ms 淡出）。
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue } from 'jotai'
import { AlarmClock } from 'lucide-react'
import { automationsAtom } from '@/atoms/automation-atoms'
import { formatNextRunAt, formatSchedule } from '@/components/automation/automation-formatters'
import { usePopoverPosition } from '@/components/session-preview/SessionMiniMapPopover'
import { cn } from '@/lib/utils'
import type { Automation } from '@proma/shared'

const PANEL_WIDTH = 280
const PANEL_MIN_HEIGHT = 88
const PANEL_MAX_HEIGHT = 360
const ROW_HEIGHT = 48
const HEADER_HEIGHT = 36
/** 不出现滚动条时最多完整显示几条任务；超过则进入滚动。 */
const ROWS_BEFORE_SCROLL = 3
const TICK_INTERVAL_MS = 30_000

interface AutomationPreviewPopoverProps {
  anchorRef: React.MutableRefObject<HTMLElement | null>
  open: boolean
  isLeaving: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function getPreferredHeight(activeCount: number): number {
  if (activeCount === 0) return PANEL_MIN_HEIGHT
  const visibleRows = Math.min(activeCount, ROWS_BEFORE_SCROLL)
  return Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, HEADER_HEIGHT + visibleRows * ROW_HEIGHT + 12))
}

/** 仅在浮层打开时每 30 秒刷新一次，让相对时间文案保持新鲜。 */
function useNowTick(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active])
  return now
}

export function AutomationPreviewPopover(props: AutomationPreviewPopoverProps): React.ReactElement | null {
  if (!props.open) return null
  return <AutomationPreviewPopoverContent {...props} />
}

function AutomationPreviewPopoverContent({
  anchorRef,
  open,
  isLeaving,
  onMouseEnter,
  onMouseLeave,
}: AutomationPreviewPopoverProps): React.ReactElement | null {
  const automations = useAtomValue(automationsAtom)
  const activeAutomations = React.useMemo(
    () => automations.filter((a) => a.active).sort((a, b) => a.nextRunAt - b.nextRunAt),
    [automations],
  )
  const preferredHeight = getPreferredHeight(activeAutomations.length)
  const position = usePopoverPosition(anchorRef, open, preferredHeight, PANEL_WIDTH)
  const now = useNowTick(open)

  if (!open || !position) return null

  return createPortal(
    <div
      className="fixed z-[9999] titlebar-no-drag transition-[top,height] duration-150 ease-out"
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH, height: position.height }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn(
          'session-minimap-popover h-full rounded-xl bg-popover shadow-xl ring-1 ring-black/[0.05] dark:ring-white/[0.08] flex flex-col overflow-hidden',
          isLeaving ? 'session-minimap-popover-exit' : 'session-minimap-popover-enter',
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 bg-muted/35 border-b border-border/35">
          <div className="min-w-0 flex items-center gap-1.5">
            <AlarmClock size={13} className="text-foreground/55 shrink-0" />
            <span className="truncate text-xs font-medium text-popover-foreground/85">启用中任务</span>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {activeAutomations.length} 个
          </span>
        </div>

        {/* 内容 */}
        <div className="relative flex-1 min-h-0 overflow-hidden bg-popover p-1.5">
          {activeAutomations.length === 0 ? (
            <div className="h-full rounded-md bg-muted/30 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
              目前没有启用中的任务
            </div>
          ) : (
            <div className="h-full overflow-y-auto space-y-0.5 scrollbar-thin session-minimap-content-enter">
              {activeAutomations.map((a) => (
                <AutomationRow key={a.id} automation={a} now={now} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AutomationRow({ automation, now }: { automation: Automation; now: number }): React.ReactElement {
  const scheduleText = formatSchedule(automation)
  const nextRunText = formatNextRunAt(automation.nextRunAt, now)
  return (
    <div className="w-full px-2 py-1.5 text-left">
      <div className="truncate text-[12px] leading-4 text-popover-foreground/90 font-medium">
        {automation.name || '未命名任务'}
      </div>
      <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground/70">
        <span>{scheduleText}</span>
        <span className="mx-1 text-muted-foreground/40">·</span>
        <span className="tabular-nums">{nextRunText}</span>
      </div>
    </div>
  )
}
