/**
 * CodeTrackerPanel — 代码追踪面板
 *
 * 功能：
 * - 实时显示 Agent 执行的工具调用
 * - 显示工具参数和执行结果
 * - 支持展开/收起详情
 * - 支持导出日志
 * - 支持清空历史
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import {
  Terminal,
  FileText,
  Pencil,
  FilePenLine,
  FolderSearch,
  Search,
  Globe,
  Zap,
  ListTodo,
  Users,
  Wrench,
  ChevronRight,
  ChevronDown,
  Download,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  agentStreamingStatesAtom,
  cachedTeamActivitiesAtom,
  type ToolActivity,
  type ActivityStatus,
  getActivityStatus,
} from '@/atoms/agent-atoms'

interface CodeTrackerPanelProps {
  sessionId: string
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Edit: Pencil,
  Write: FilePenLine,
  Read: FileText,
  Bash: Terminal,
  Glob: FolderSearch,
  Grep: Search,
  WebFetch: Globe,
  Skill: Zap,
  TaskCreate: ListTodo,
  TaskUpdate: ListTodo,
  TaskGet: ListTodo,
  TaskList: ListTodo,
  Agent: Users,
}

function getToolIcon(toolName: string): React.ComponentType<{ className?: string }> {
  return TOOL_ICONS[toolName] ?? Wrench
}

// 状态图标
function StatusIcon({ status }: { status: ActivityStatus }): React.ReactElement {
  if (status === 'running' || status === 'backgrounded') {
    return <Loader2 className="size-3 animate-spin text-blue-500" />
  }
  if (status === 'error') {
    return <XCircle className="size-3 text-destructive" />
  }
  return <CheckCircle2 className="size-3 text-green-500" />
}

export function CodeTrackerPanel({ sessionId }: CodeTrackerPanelProps): React.ReactElement {
  const streamingStates = useAtomValue(agentStreamingStatesAtom)
  const cachedActivities = useAtomValue(cachedTeamActivitiesAtom)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  // 获取当前会话的工具活动
  const activities = React.useMemo(() => {
    const state = streamingStates.get(sessionId)
    if (state && state.toolActivities.length > 0) {
      return state.toolActivities
    }
    // 从缓存中获取
    const cached = cachedActivities.get(sessionId)
    if (cached) {
      // 将 TeamActivityEntry 转换为 ToolActivity
      return cached
        .filter((entry) => entry.type === 'tool')
        .map((entry) => ({
          toolUseId: entry.id,
          toolName: entry.toolName || 'Unknown',
          input: entry.input || {},
          result: entry.result,
          error: entry.error,
          startTime: entry.startTime,
          endTime: entry.endTime,
        })) as ToolActivity[]
    }
    return []
  }, [sessionId, streamingStates, cachedActivities])

  // 切换展开/收起
  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // 导出日志
  const handleExport = (): void => {
    const logs = activities.map((activity) => {
      const status = getActivityStatus(activity)
      const duration = activity.endTime && activity.startTime
        ? `${activity.endTime - activity.startTime}ms`
        : 'N/A'

      return {
        tool: activity.toolName,
        status,
        duration,
        input: activity.input,
        result: activity.result,
        error: activity.error,
        timestamp: new Date(activity.startTime).toISOString(),
      }
    })

    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code-tracker-${sessionId}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 清空历史
  const handleClear = (): void => {
    setExpandedIds(new Set())
    // TODO: 实现清空缓存的逻辑
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground/70">
            代码追踪
          </span>
          <span className="text-[10px] text-muted-foreground">
            ({activities.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleExport}
                disabled={activities.length === 0}
              >
                <Download className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">导出日志</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleClear}
                disabled={activities.length === 0}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">清空历史</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 活动列表 */}
      <ScrollArea className="flex-1">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <Terminal className="size-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/60">
              暂无执行记录
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">
              Agent 执行工具时会显示在这里
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {activities.map((activity) => (
              <ActivityItem
                key={activity.toolUseId}
                activity={activity}
                expanded={expandedIds.has(activity.toolUseId)}
                onToggle={() => toggleExpand(activity.toolUseId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ===== 活动项组件 =====

interface ActivityItemProps {
  activity: ToolActivity
  expanded: boolean
  onToggle: () => void
}

function ActivityItem({ activity, expanded, onToggle }: ActivityItemProps): React.ReactElement {
  const status = getActivityStatus(activity)
  const Icon = getToolIcon(activity.toolName)
  const duration = activity.endTime && activity.startTime
    ? activity.endTime - activity.startTime
    : null

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        status === 'error' && 'border-destructive/20 bg-destructive/5',
        status === 'success' && 'border-border bg-background',
        (status === 'running' || status === 'backgrounded') && 'border-blue-500/20 bg-blue-500/5'
      )}
    >
      {/* 头部 */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        {/* 展开/收起图标 */}
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground flex-shrink-0" />
        )}

        {/* 工具图标 */}
        <Icon className="size-3.5 text-foreground/60 flex-shrink-0" />

        {/* 工具名称 */}
        <span className="text-xs font-medium text-foreground/80 flex-shrink-0">
          {activity.toolName}
        </span>

        {/* 状态图标 */}
        <StatusIcon status={status} />

        {/* 弹性空间 */}
        <div className="flex-1 min-w-0" />

        {/* 执行时间 */}
        {duration !== null && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
            <Clock className="size-2.5" />
            <span>{duration}ms</span>
          </div>
        )}
      </button>

      {/* 详情（展开时显示） */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* 输入参数 */}
          {Object.keys(activity.input).length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground mb-1">
                输入参数
              </div>
              <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(activity.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 执行结果 */}
          {activity.result && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground mb-1">
                执行结果
              </div>
              <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto max-h-[200px]">
                {typeof activity.result === 'string'
                  ? activity.result
                  : JSON.stringify(activity.result, null, 2)}
              </pre>
            </div>
          )}

          {/* 错误信息 */}
          {activity.error && (
            <div>
              <div className="text-[10px] font-medium text-destructive mb-1">
                错误信息
              </div>
              <pre className="text-[10px] bg-destructive/10 text-destructive rounded p-2 overflow-x-auto">
                {activity.error}
              </pre>
            </div>
          )}

          {/* 时间戳 */}
          <div className="text-[10px] text-muted-foreground/60">
            开始时间: {new Date(activity.startTime).toLocaleString('zh-CN')}
            {activity.endTime && (
              <> · 结束时间: {new Date(activity.endTime).toLocaleString('zh-CN')}</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
