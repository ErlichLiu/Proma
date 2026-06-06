/**
 * AutomationIntentBanner — 定时任务意图判断卡片
 *
 * 由主进程的 detectAutomationIntent 触发，挂在 Agent 会话输入框上方。
 * 两种形态：
 * - draft_created：草稿已落库，提供"打开调整 / 直接启用 / 丢弃"三个操作
 * - pending_schedule：意图明确但频率不明，让用户选择频率后创建
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Sparkles, X, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  pendingAutomationIntentMapAtom,
  automationsAtom,
  automationFormAtom,
  AUTOMATION_INTERVAL_OPTIONS,
  type AutomationDraft,
} from '@/atoms/automation-atoms'
import { agentSessionsAtom, agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'

interface AutomationIntentBannerProps {
  sessionId: string
}

export function AutomationIntentBanner({ sessionId }: AutomationIntentBannerProps): React.ReactElement | null {
  const intentMap = useAtomValue(pendingAutomationIntentMapAtom)
  const automations = useAtomValue(automationsAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const setIntentMap = useSetAtom(pendingAutomationIntentMapAtom)
  const setAutomations = useSetAtom(automationsAtom)
  const setForm = useSetAtom(automationFormAtom)

  const intent = intentMap.get(sessionId)
  if (!intent) return null

  /** 清掉本会话的待处理意图 */
  const dismiss = (): void => {
    setIntentMap((prev) => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
  }

  if (intent.kind === 'draft_created') {
    return <DraftCreatedBanner sessionId={sessionId} automationId={intent.automationId} onDismiss={dismiss} automations={automations} setAutomations={setAutomations} setForm={setForm} />
  }

  return <PendingScheduleBanner sessionId={sessionId} suggestion={intent.suggestion} onDismiss={dismiss} sessions={sessions} />
}

// ===== 子组件 1：草稿已创建 =====

interface DraftCreatedBannerProps {
  sessionId: string
  automationId: string
  onDismiss: () => void
  automations: ReturnType<typeof useAtomValue<typeof automationsAtom>>
  setAutomations: ReturnType<typeof useSetAtom<typeof automationsAtom>>
  setForm: ReturnType<typeof useSetAtom<typeof automationFormAtom>>
}

function DraftCreatedBanner({ automationId, onDismiss, automations, setAutomations, setForm }: DraftCreatedBannerProps): React.ReactElement | null {
  const [busy, setBusy] = React.useState(false)
  const automation = automations.find((a) => a.id === automationId)
  if (!automation) return null

  const scheduleText = formatSchedule(automation.scheduleType, automation.intervalMinutes, automation.timeOfDay, automation.dayOfWeek)

  const handleOpen = (): void => {
    const draft: AutomationDraft = {
      id: automation.id,
      name: automation.name,
      prompt: automation.prompt,
      scheduleType: automation.scheduleType,
      intervalMinutes: automation.intervalMinutes,
      timeOfDay: automation.timeOfDay,
      dayOfWeek: automation.dayOfWeek,
      channelId: automation.channelId,
      modelId: automation.modelId,
      workspaceId: automation.workspaceId,
      permissionMode: automation.permissionMode ?? 'bypassPermissions',
      active: automation.active,
    }
    setForm({ open: true, draft })
    onDismiss()
  }

  const handleEnable = async (): Promise<void> => {
    setBusy(true)
    try {
      const updated = await window.electronAPI.toggleAutomation(automation.id, true)
      if (updated) {
        setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
        toast.success('已启用')
      }
      onDismiss()
    } catch (err) {
      console.error('[意图 Banner] 启用失败:', err)
      toast.error('启用失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDiscard = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.electronAPI.deleteAutomation(automation.id)
      setAutomations((prev) => prev.filter((a) => a.id !== automation.id))
      onDismiss()
    } catch (err) {
      console.error('[意图 Banner] 丢弃失败:', err)
      toast.error('删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-4 mb-3 rounded-xl bg-card shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Proma 帮你建了一个定时任务草稿</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="rounded-md bg-foreground/[0.03] px-3 py-2 flex items-center gap-2 text-sm">
          <Clock className="size-3.5 text-foreground/50 flex-shrink-0" />
          <span className="font-medium text-foreground truncate">{automation.name}</span>
          <span className="text-foreground/50 text-xs">·</span>
          <span className="text-foreground/60 text-xs">{scheduleText}</span>
          <span className="ml-auto text-[10px] text-foreground/40 flex-shrink-0">未启用</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 pb-3">
        <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={busy} className="h-7 px-3 text-xs">
          丢弃
        </Button>
        <Button variant="ghost" size="sm" onClick={handleOpen} disabled={busy} className="h-7 px-3 text-xs">
          打开调整
        </Button>
        <Button variant="default" size="sm" onClick={handleEnable} disabled={busy} className="h-7 px-3 text-xs">
          {busy ? '处理中…' : '直接启用'}
        </Button>
      </div>
    </div>
  )
}

// ===== 子组件 2：频率未定，等用户选 =====

interface PendingScheduleBannerProps {
  sessionId: string
  suggestion: { name: string; prompt: string; reasoning?: string }
  onDismiss: () => void
  sessions: ReturnType<typeof useAtomValue<typeof agentSessionsAtom>>
}

function PendingScheduleBanner({ sessionId, suggestion, onDismiss, sessions }: PendingScheduleBannerProps): React.ReactElement {
  const [busy, setBusy] = React.useState(false)
  const setAutomations = useSetAtom(automationsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)

  const session = sessions.find((s) => s.id === sessionId)
  const channelId = session?.channelId ?? agentChannelId
  const modelId = agentModelId ?? undefined

  const handleSelect = async (intervalMinutes: number): Promise<void> => {
    if (!channelId) {
      toast.error('未配置可用渠道，无法创建')
      return
    }
    setBusy(true)
    try {
      const created = await window.electronAPI.createAutomation({
        name: suggestion.name,
        prompt: suggestion.prompt,
        scheduleType: 'interval',
        intervalMinutes,
        channelId,
        modelId,
        workspaceId: session?.workspaceId,
        sourceSessionId: sessionId,
        active: true,
      })
      if (created) {
        setAutomations((prev) => {
          if (prev.some((a) => a.id === created.id)) return prev
          return [...prev, created]
        })
        toast.success(`已创建：每 ${intervalMinutes} 分钟运行一次`)
      }
      onDismiss()
    } catch (err) {
      console.error('[意图 Banner] 创建失败:', err)
      toast.error('创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-4 mb-3 rounded-xl bg-card shadow-lg overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">把这件事做成定时任务？</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-foreground/80 leading-relaxed line-clamp-2">{suggestion.prompt}</p>
        {suggestion.reasoning && (
          <p className="text-[11px] text-foreground/40 mt-1">{suggestion.reasoning}</p>
        )}
      </div>
      <div className="px-4 pb-3">
        <p className="text-xs text-foreground/60 mb-2">选择运行频率：</p>
        <div className="flex flex-wrap gap-1.5">
          {AUTOMATION_INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={busy}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border border-border/60 transition-colors',
                'hover:bg-primary/10 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatSchedule(type: string, intervalMinutes: number, timeOfDay?: string, dayOfWeek?: number): string {
  if (type === 'daily') return `每天 ${timeOfDay ?? '09:00'}`
  if (type === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每${names[dayOfWeek ?? 1]} ${timeOfDay ?? '09:00'}`
  }
  if (intervalMinutes < 60) return `每 ${intervalMinutes} 分钟`
  if (intervalMinutes < 1440) return `每 ${intervalMinutes / 60} 小时`
  return `每 ${intervalMinutes / 1440} 天`
}
