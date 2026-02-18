/**
 * UsageSettings - 使用统计设置页
 *
 * 展示使用量统计总览、每日趋势图、模型分布图、成本估算等。
 * 采用科技蓝调设计风格，深浅主题自适应。
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  BarChart3,
  Calendar,
  Coins,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Clock,
  Bot,
  ChevronRight,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from './primitives'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  usageStatsAtom,
  usageLoadingAtom,
  usageErrorAtom,
  usageTimeRangeAtom,
  loadUsageStatsAtom,
  formatTokens,
  formatCost,
  formatDate,
} from '@/atoms/usage-atoms'
import { cn } from '@/lib/utils'
import type { DailyUsage, ModelUsage, ConversationUsage } from '@proma/shared'

/** 统计卡片组件 - 科技蓝调风格 */
function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendUp,
  accent = 'blue',
}: {
  title: string
  value: string
  icon: React.ElementType
  description?: string
  trend?: string
  trendUp?: boolean
  accent?: 'blue' | 'cyan' | 'violet' | 'emerald'
}): React.ReactElement {
  const accentColors = {
    blue: {
      bg: 'bg-blue-500/10 dark:bg-blue-400/10',
      text: 'text-blue-600 dark:text-blue-400',
      glow: 'shadow-blue-500/20 dark:shadow-blue-400/20',
      border: 'border-blue-500/20 dark:border-blue-400/20',
    },
    cyan: {
      bg: 'bg-cyan-500/10 dark:bg-cyan-400/10',
      text: 'text-cyan-600 dark:text-cyan-400',
      glow: 'shadow-cyan-500/20 dark:shadow-cyan-400/20',
      border: 'border-cyan-500/20 dark:border-cyan-400/20',
    },
    violet: {
      bg: 'bg-violet-500/10 dark:bg-violet-400/10',
      text: 'text-violet-600 dark:text-violet-400',
      glow: 'shadow-violet-500/20 dark:shadow-violet-400/20',
      border: 'border-violet-500/20 dark:border-violet-400/20',
    },
    emerald: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      glow: 'shadow-emerald-500/20 dark:shadow-emerald-400/20',
      border: 'border-emerald-500/20 dark:border-emerald-400/20',
    },
  }

  const colors = accentColors[accent]
  const TrendIcon = trendUp ? ArrowUpRight : ArrowDownRight

  return (
    <div className="group relative rounded-2xl bg-gradient-to-br from-card to-muted/30 dark:from-card dark:to-muted/10 border border-border/50 dark:border-border/30 p-5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-border/80 dark:hover:border-border/50">
      {/* 背景装饰渐变 */}
      <div className={cn(
        'absolute -right-6 -top-6 w-24 h-24 rounded-full blur-3xl opacity-30 transition-opacity duration-300 group-hover:opacity-50',
        colors.bg
      )} />

      <div className="relative flex items-start gap-4">
        <div className={cn(
          'p-3 rounded-xl shrink-0 transition-transform duration-300 group-hover:scale-105',
          colors.bg,
          colors.text
        )}>
          <Icon className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <span className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}>
                <TrendIcon className="size-3" />
                {trend}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** 图表颜色配置 - 科技蓝调色板 */
const CHART_COLORS = {
  // 深色模式配色
  dark: [
    '#60a5fa', // blue-400
    '#22d3ee', // cyan-400
    '#a78bfa', // violet-400
    '#34d399', // emerald-400
    '#fbbf24', // amber-400
  ],
  // 浅色模式配色
  light: [
    '#2563eb', // blue-600
    '#0891b2', // cyan-600
    '#7c3aed', // violet-600
    '#059669', // emerald-600
    '#d97706', // amber-600
  ],
}

/** 对话列表项 - 现代化样式 */
function ConversationItem({
  conversation,
  onClick,
}: {
  conversation: ConversationUsage
  onClick: () => void
}): React.ReactElement {
  const isAgent = conversation.mode === 'agent'

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-4 p-4 rounded-xl',
        'bg-gradient-to-r from-transparent to-transparent',
        'hover:from-accent/5 hover:to-accent/[0.02]',
        'border border-transparent hover:border-border/50',
        'transition-all duration-200 text-left'
      )}
    >
      {/* 图标容器 */}
      <div className={cn(
        'p-2.5 rounded-xl shrink-0 transition-all duration-200',
        'group-hover:scale-105',
        isAgent
          ? 'bg-violet-500/10 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400'
          : 'bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400'
      )}>
        {isAgent ? (
          <Bot className="size-4" />
        ) : (
          <MessageSquare className="size-4" />
        )}
      </div>

      {/* 对话信息 */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-foreground group-hover:text-foreground/90 transition-colors">
          {conversation.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {new Date(conversation.createdAt).toLocaleDateString('zh-CN')}
          </span>
          <span className="text-border">·</span>
          <span className="text-xs text-muted-foreground/80 font-mono">
            {conversation.modelId.length > 20
              ? conversation.modelId.slice(0, 18) + '...'
              : conversation.modelId}
          </span>
        </div>
      </div>

      {/* Token 数量 */}
      <div className="text-right shrink-0">
        <p className="font-semibold text-sm text-foreground">
          {formatTokens(conversation.totalTokens)}
        </p>
        <p className="text-xs text-muted-foreground">tokens</p>
      </div>

      {/* 箭头 */}
      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </button>
  )
}

/** 自定义 Tooltip 内容 - 科技感样式 */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; dataKey?: string }>
  label?: string
  valueFormatter?: (value: number) => string
  labelFormatter?: (label: string) => string
}): React.ReactElement | null {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-xl bg-card/95 backdrop-blur-md border border-border/50 shadow-xl p-3 min-w-[160px]">
      {label && labelFormatter && (
        <p className="text-xs font-medium text-muted-foreground mb-2 pb-2 border-b border-border/50">
          {labelFormatter(label)}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{entry.name}</span>
            <span className="text-sm font-semibold font-mono">
              {valueFormatter ? valueFormatter(Number(entry.value)) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function UsageSettings(): React.ReactElement {
  const [stats] = useAtom(usageStatsAtom)
  const [loading] = useAtom(usageLoadingAtom)
  const [error] = useAtom(usageErrorAtom)
  const [timeRange, setTimeRange] = useAtom(usageTimeRangeAtom)
  const loadStats = useSetAtom(loadUsageStatsAtom)

  // 检测深色模式
  const [isDark, setIsDark] = React.useState(false)
  React.useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // 获取当前配色方案
  const chartColors = isDark ? CHART_COLORS.dark : CHART_COLORS.light
  const primaryColor = chartColors[0]

  // 初始加载
  React.useEffect(() => {
    loadStats(timeRange)
  }, [loadStats, timeRange])

  // 刷新数据
  const handleRefresh = () => {
    loadStats(timeRange)
  }

  // 时间范围选项
  const timeRangeOptions = [
    { value: 7, label: '7天' },
    { value: 30, label: '30天' },
    { value: 90, label: '90天' },
  ]

  // 准备图表数据
  const dailyData = React.useMemo(() => {
    if (!stats?.dailyUsage) return []
    return [...stats.dailyUsage].reverse()
  }, [stats?.dailyUsage])

  const modelData = React.useMemo(() => {
    if (!stats?.modelUsage) return []
    return stats.modelUsage.slice(0, 5)
  }, [stats?.modelUsage])

  // 加载中状态
  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-400/20 blur-xl rounded-full" />
          <Spinner className="size-10 relative" />
        </div>
        <p className="text-sm text-muted-foreground mt-6">正在加载统计数据...</p>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-5 rounded-2xl bg-rose-500/10 dark:bg-rose-400/10 text-rose-600 dark:text-rose-400 mb-5">
          <BarChart3 className="size-10" />
        </div>
        <h3 className="text-lg font-semibold">加载失败</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-[280px]">{error}</p>
        <Button onClick={handleRefresh} className="mt-6" variant="outline">
          <RefreshCw className="size-4 mr-2" />
          重试
        </Button>
      </div>
    )
  }

  // 空状态
  if (!stats || stats.totalConversations === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-400/20 blur-2xl rounded-full" />
          <div className="relative p-5 rounded-2xl bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400">
            <BarChart3 className="size-10" />
          </div>
        </div>
        <h3 className="text-lg font-semibold">暂无使用数据</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-[280px]">
          开始对话后，这里会展示你的使用量统计和分析
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-180px)]">
      <div className="space-y-8 pr-4">
        {/* 头部工具栏 */}
        <div className="flex items-center justify-between">
          <Select
            value={String(timeRange)}
            onValueChange={(v: string) => setTimeRange(Number(v))}
          >
            <SelectTrigger className="w-[130px] h-9 bg-card/50 border-border/50 hover:bg-card transition-colors">
              <Calendar className="size-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeRangeOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  最近{opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('size-4 mr-2', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总 Token 数"
            value={formatTokens(stats.totalTokens)}
            icon={Zap}
            description={`输入 ${formatTokens(stats.promptTokens)} · 输出 ${formatTokens(stats.completionTokens)}`}
            accent="cyan"
          />
          <StatCard
            title="预估成本"
            value={formatCost(stats.estimatedCost)}
            icon={Coins}
            description="基于当前定价模型估算"
            accent="emerald"
          />
          <StatCard
            title="对话数量"
            value={String(stats.totalConversations)}
            icon={MessageSquare}
            description={`共 ${stats.totalMessages} 条消息`}
            accent="blue"
          />
          <StatCard
            title="活跃天数"
            value={String(stats.dailyUsage.length)}
            icon={TrendingUp}
            description={`平均每 ${(stats.dailyUsage.length / (timeRange / 7)).toFixed(1)} 天活跃`}
            accent="violet"
          />
        </div>

        {/* 每日趋势图 */}
        <SettingsSection
          title="每日使用量趋势"
          description="Token 使用量和成本随时间变化"
        >
          <SettingsCard className="overflow-hidden">
            <div className="p-5">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={primaryColor} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                      fontSize={11}
                      tickFormatter={formatTokens}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          valueFormatter={formatTokens}
                          labelFormatter={formatDate}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="totalTokens"
                      name="Token 数"
                      stroke={primaryColor}
                      fill="url(#tokenGradient)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 4,
                        strokeWidth: 0,
                        fill: primaryColor,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SettingsCard>
        </SettingsSection>

        {/* 模型分布图 */}
        {modelData.length > 0 && (
          <SettingsSection
            title="模型使用分布"
            description="按模型统计的 Token 使用量"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 饼图 */}
              <SettingsCard className="overflow-hidden">
                <div className="p-5">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={modelData}
                          dataKey="totalTokens"
                          nameKey="modelId"
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {modelData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={chartColors[index % chartColors.length]}
                              strokeWidth={0}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={
                            <ChartTooltip
                              valueFormatter={formatTokens}
                              labelFormatter={(l) => String(l)}
                            />
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* 图例 */}
                  <div className="flex flex-wrap justify-center gap-3 mt-4">
                    {modelData.map((model, index) => (
                      <div
                        key={model.modelId}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: chartColors[index % chartColors.length] }}
                        />
                        <span className="text-muted-foreground">
                          {model.modelId.length > 15
                            ? model.modelId.slice(0, 12) + '...'
                            : model.modelId}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </SettingsCard>

              {/* 条形图 */}
              <SettingsCard className="overflow-hidden">
                <div className="p-5">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={modelData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                          fontSize={11}
                          tickFormatter={formatTokens}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="modelId"
                          stroke={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
                          fontSize={10}
                          width={90}
                          tickFormatter={(value: string) =>
                            value.length > 18 ? value.slice(0, 15) + '...' : value
                          }
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              valueFormatter={formatTokens}
                              labelFormatter={(l) => String(l)}
                            />
                          }
                        />
                        <Bar
                          dataKey="totalTokens"
                          name="Token 数"
                          fill={primaryColor}
                          radius={[0, 6, 6, 0]}
                          barSize={24}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </SettingsCard>
            </div>
          </SettingsSection>
        )}

        {/* 最近对话列表 */}
        {stats.recentConversations.length > 0 && (
          <SettingsSection
            title="最近使用"
            description="按 Token 使用量排序的最近对话"
          >
            <SettingsCard className="overflow-hidden">
              <div className="divide-y divide-border/30">
                {stats.recentConversations.map((conv, index) => (
                  <ConversationItem
                    key={conv.conversationId}
                    conversation={conv}
                    onClick={() => {
                      // TODO: 跳转到对应对话
                      console.log('点击对话:', conv.conversationId)
                    }}
                  />
                ))}
              </div>
            </SettingsCard>
          </SettingsSection>
        )}

        {/* 定价信息 */}
        <SettingsSection
          title="定价参考"
          description="当前使用的模型定价（每 1K Token）"
        >
          <SettingsCard>
            <div className="p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                成本估算基于主流供应商公开定价，实际费用可能因供应商调整而变化。
                常用模型参考价格：
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: 'Claude 3.5 Sonnet', price: '$3/M 输入, $15/M 输出', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
                  { name: 'GPT-4o', price: '$5/M 输入, $15/M 输出', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
                  { name: 'GPT-4o-mini', price: '$0.15/M 输入, $0.60/M 输出', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
                  { name: 'Gemini 1.5 Pro', price: '$3.5/M 输入, $10.5/M 输出', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
                ].map((model) => (
                  <div
                    key={model.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 dark:bg-muted/20"
                  >
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className={cn('text-xs px-2 py-1 rounded-full font-mono', model.color)}>
                      {model.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SettingsCard>
        </SettingsSection>
      </div>
    </ScrollArea>
  )
}
