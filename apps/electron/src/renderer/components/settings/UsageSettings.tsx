/**
 * UsageSettings - 用量统计页
 *
 * 展示 Token 消耗的可视化统计数据：
 * - 总览数字（今日/本月 Token 总量）
 * - 最近 30 天趋势图表（AreaChart）
 * - 按模型分布明细
 *
 * 使用 recharts 绘制图表，遵循 SettingsSection/SettingsCard 视觉规范。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Loader2, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { SettingsSection, SettingsCard } from './primitives'
import { usageSummaryAtom, usageLoadingAtom } from '@/atoms/usage-atoms'
import type { UsageSummary, DailyUsage } from '@proma/shared'

// ===== 工具函数 =====

/** 格式化 token 数为可读字符串 */
function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

/** 格式化日期为短格式 (MM-DD) */
function formatDate(dateStr: string): string {
  return dateStr.slice(5) // "2024-03-01" → "03-01"
}

/** 获取今日日期字符串 */
function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

// ===== 子组件 =====

/** 统计数字卡片 */
function StatItem({ label, value, sub }: {
  label: string
  value: string
  sub?: string
}): React.ReactElement {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

/** 自定义 Tooltip */
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
}): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg bg-popover border border-border/50 shadow-md px-3 py-2 text-sm">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          {entry.dataKey === 'inputTokens' ? (
            <ArrowUpRight size={12} className="text-blue-500" />
          ) : (
            <ArrowDownRight size={12} className="text-emerald-500" />
          )}
          <span className="text-foreground font-medium">
            {formatTokens(entry.value)}
          </span>
          <span className="text-muted-foreground">
            {entry.dataKey === 'inputTokens' ? '输入' : '输出'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ===== 主组件 =====

export function UsageSettings(): React.ReactElement {
  const [summary, setSummary] = useAtom(usageSummaryAtom)
  const [loading, setLoading] = useAtom(usageLoadingAtom)

  /** 加载用量数据 */
  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getUsageSummary()
      setSummary(data)
    } catch (error) {
      console.error('[用量统计] 加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [setSummary, setLoading])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  /** 清除用量记录 */
  const handleClear = React.useCallback(async () => {
    try {
      await window.electronAPI.clearUsageStats()
      setSummary(null)
    } catch (error) {
      console.error('[用量统计] 清除失败:', error)
    }
  }, [setSummary])

  if (loading && !summary) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        <Loader2 size={16} className="animate-spin inline mr-2" />
        加载中...
      </div>
    )
  }

  // 计算今日数据
  const today = getToday()
  const todayData = summary?.daily.find((d) => d.date === today)
  const todayTotal = todayData ? todayData.inputTokens + todayData.outputTokens : 0

  return (
    <div className="space-y-6">
      {/* 总览 */}
      <SettingsSection
        title="用量统计"
        description="查看 Token 消耗和 API 调用情况"
        action={
          summary && summary.totalRequests > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClear}
              className="text-muted-foreground"
            >
              <Trash2 size={14} className="mr-1.5" />
              清除
            </Button>
          ) : undefined
        }
      >
        <SettingsCard divided={false}>
          <div className="flex gap-6 p-4">
            <StatItem
              label="今日消耗"
              value={formatTokens(todayTotal)}
              sub={todayData ? `${todayData.requestCount} 次请求` : '暂无数据'}
            />
            <StatItem
              label="近 30 天总计"
              value={formatTokens((summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0))}
              sub={`${summary?.totalRequests ?? 0} 次请求`}
            />
            <StatItem
              label="输入 / 输出"
              value={`${formatTokens(summary?.totalInputTokens ?? 0)} / ${formatTokens(summary?.totalOutputTokens ?? 0)}`}
            />
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 趋势图表 */}
      {summary && summary.daily.length > 0 && (
        <SettingsSection title="近 30 天趋势">
          <SettingsCard divided={false}>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={summary.daily}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatTokens}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="inputTokens"
                    stroke="hsl(217, 91%, 60%)"
                    fill="url(#inputGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    stroke="hsl(160, 84%, 39%)"
                    fill="url(#outputGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full bg-blue-500" />
                  输入 Token
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full bg-emerald-500" />
                  输出 Token
                </div>
              </div>
            </div>
          </SettingsCard>
        </SettingsSection>
      )}

      {/* 模型分布 */}
      {summary && summary.byModel.length > 0 && (
        <SettingsSection title="按模型分布">
          <SettingsCard>
            {summary.byModel.map((model) => {
              const total = model.inputTokens + model.outputTokens
              return (
                <div key={`${model.provider}:${model.modelId}`} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {model.modelId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {model.provider} · {model.requestCount} 次请求
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium text-foreground">
                      {formatTokens(total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTokens(model.inputTokens)} 入 / {formatTokens(model.outputTokens)} 出
                    </p>
                  </div>
                </div>
              )
            })}
          </SettingsCard>
        </SettingsSection>
      )}

      {/* 空状态 */}
      {summary && summary.totalRequests === 0 && (
        <div className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">
          <p>暂无用量数据</p>
          <p className="mt-1 text-xs">开始对话后，Token 用量将自动记录在这里</p>
        </div>
      )}
    </div>
  )
}
