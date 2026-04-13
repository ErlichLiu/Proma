/**
 * AgentProfileForm - Agent Profile 创建/编辑表单
 *
 * 包含 4 个区块：基础信息、模型配置、能力配置（MCP/Skills）、附加配置。
 * 复用设置原语组件 + emoji-mart picker + chip 选择器。
 */

import * as React from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Check, Plug, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  AgentProfileMcpRef,
  AgentProfileSkillRef,
  Channel,
  WorkspaceCapabilitiesSummary,
  AgentWorkspace,
  ThinkingConfig,
  AgentEffort,
} from '@proma/shared'
import {
  SettingsSection,
  SettingsCard,
  SettingsInput,
  SettingsSelect,
  SettingsSegmentedControl,
  LABEL_CLASS,
  DESCRIPTION_CLASS,
} from './primitives'

// ===== Types =====

/** emoji-mart 选择回调的 emoji 对象类型 */
interface EmojiMartEmoji {
  id: string
  name: string
  native: string
  unified: string
  keywords: string[]
  shortcodes: string
}

// ===== 辅助函数 =====

function thinkingToValue(config: ThinkingConfig | undefined): string {
  if (!config) return 'default'
  if (config.type === 'adaptive') return 'adaptive'
  if (config.type === 'disabled') return 'disabled'
  if (config.type === 'enabled') return 'enabled'
  return 'default'
}

function valueToThinking(value: string, existing?: ThinkingConfig): ThinkingConfig | undefined {
  if (value === 'adaptive') return { type: 'adaptive' }
  if (value === 'disabled') return { type: 'disabled' }
  // 保留已有 enabled 配置中的 budgetTokens，否则使用默认值
  if (value === 'enabled') {
    const budget = existing?.type === 'enabled' ? existing.budgetTokens : 10000
    return { type: 'enabled', budgetTokens: budget }
  }
  return undefined
}

const THINKING_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'enabled', label: '开启' },
  { value: 'adaptive', label: '自适应' },
  { value: 'disabled', label: '关闭' },
]

const EFFORT_OPTIONS = [
  { value: 'default', label: '默认' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'max', label: '最大' },
]

/** 占位值：Radix Select 不允许 value="" */
const NONE = '__none__'

// ===== 主组件 =====

interface AgentProfileFormProps {
  /** 编辑模式传入已有 Profile，创建模式传 null */
  profile: AgentProfile | null
  onSaved: () => void
  onCancel: () => void
}

export function AgentProfileForm({ profile, onSaved, onCancel }: AgentProfileFormProps): React.ReactElement {
  const isEdit = profile !== null

  // 基础信息
  const [name, setName] = React.useState(profile?.name ?? '')
  const [description, setDescription] = React.useState(profile?.description ?? '')
  const [icon, setIcon] = React.useState(profile?.icon ?? '')
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)

  // 模型配置
  const [channelId, setChannelId] = React.useState(profile?.defaultChannelId || NONE)
  const [modelId, setModelId] = React.useState(profile?.defaultModelId || NONE)
  const [thinking, setThinking] = React.useState<ThinkingConfig | undefined>(profile?.thinking)
  const [effort, setEffort] = React.useState<AgentEffort | undefined>(profile?.effort)
  const [budgetStr, setBudgetStr] = React.useState(profile?.maxBudgetUsd != null ? String(profile.maxBudgetUsd) : '')
  const [turnsStr, setTurnsStr] = React.useState(profile?.maxTurns != null ? String(profile.maxTurns) : '')
  const [advancedOpen, setAdvancedOpen] = React.useState(
    profile?.maxBudgetUsd != null || profile?.maxTurns != null
  )

  // 能力配置
  const [enabledMcpServers, setEnabledMcpServers] = React.useState<AgentProfileMcpRef[]>(profile?.enabledMcpServers ?? [])
  const [enabledSkills, setEnabledSkills] = React.useState<AgentProfileSkillRef[]>(profile?.enabledSkills ?? [])

  // 附加配置
  const [defaultWorkspaceId, setDefaultWorkspaceId] = React.useState(profile?.defaultWorkspaceId || NONE)
  const [additionalPrompt, setAdditionalPrompt] = React.useState(profile?.additionalPrompt ?? '')

  // 外部数据
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [workspaces, setWorkspaces] = React.useState<AgentWorkspace[]>([])
  const [allCapabilities, setAllCapabilities] = React.useState<WorkspaceCapabilitiesSummary[]>([])
  const [saving, setSaving] = React.useState(false)

  // 加载外部数据
  React.useEffect(() => {
    Promise.all([
      window.electronAPI.listChannels(),
      window.electronAPI.listAgentWorkspaces(),
      window.electronAPI.listAllCapabilities(),
    ]).then(([ch, ws, caps]) => {
      setChannels(ch.filter((c) => c.enabled))
      setWorkspaces(ws)
      setAllCapabilities(caps)
    }).catch((err) => {
      console.error('[Agent Profile] 加载数据失败:', err)
      toast.error('加载配置数据失败')
    })
  }, [])

  // 渠道下的模型列表
  const selectedChannel = channelId !== NONE ? channels.find((c) => c.id === channelId) : undefined
  const modelOptions = selectedChannel?.models
    ?.filter((m) => m.enabled !== false)
    ?.map((m) => ({ value: m.id, label: m.name || m.id })) ?? []

  // 切换渠道时重置模型
  const handleChannelChange = (newChannelId: string): void => {
    setChannelId(newChannelId)
    setModelId(NONE)
  }

  // MCP checkbox 切换
  const toggleMcpServer = (workspaceId: string, serverName: string): void => {
    setEnabledMcpServers((prev) => {
      const exists = prev.some((r) => r.workspaceId === workspaceId && r.serverName === serverName)
      if (exists) {
        return prev.filter((r) => !(r.workspaceId === workspaceId && r.serverName === serverName))
      }
      return [...prev, { workspaceId, serverName }]
    })
  }

  // Skill checkbox 切换
  const toggleSkill = (workspaceId: string, skillName: string): void => {
    setEnabledSkills((prev) => {
      const exists = prev.some((r) => r.workspaceId === workspaceId && r.skillName === skillName)
      if (exists) {
        return prev.filter((r) => !(r.workspaceId === workspaceId && r.skillName === skillName))
      }
      return [...prev, { workspaceId, skillName }]
    })
  }

  // 检查是否选中
  const isMcpSelected = (workspaceId: string, serverName: string): boolean =>
    enabledMcpServers.some((r) => r.workspaceId === workspaceId && r.serverName === serverName)

  const isSkillSelected = (workspaceId: string, skillName: string): boolean =>
    enabledSkills.some((r) => r.workspaceId === workspaceId && r.skillName === skillName)

  // 保存
  const handleSave = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('请输入 Agent 名称')
      return
    }

    const budget = parseFloat(budgetStr)
    const turns = parseInt(turnsStr, 10)

    const input: AgentProfileCreateInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      defaultChannelId: channelId !== NONE ? channelId : undefined,
      defaultModelId: modelId !== NONE ? modelId : undefined,
      thinking,
      effort,
      maxBudgetUsd: !isNaN(budget) && budget > 0 ? budget : undefined,
      maxTurns: !isNaN(turns) && turns > 0 ? turns : undefined,
      enabledMcpServers,
      enabledSkills,
      additionalPrompt: additionalPrompt.trim() || undefined,
      defaultWorkspaceId: defaultWorkspaceId !== NONE ? defaultWorkspaceId : undefined,
    }

    setSaving(true)
    try {
      if (isEdit) {
        await window.electronAPI.updateAgentProfile(profile.id, input)
        toast.success(`已更新 Agent「${name}」`)
      } else {
        await window.electronAPI.createAgentProfile(input)
        toast.success(`已创建 Agent「${name}」`)
      }
      // 先重置 saving 再触发 onSaved（onSaved 可能导致组件卸载）
      setSaving(false)
      onSaved()
    } catch (error) {
      console.error('[Agent Profile] 保存失败:', error)
      toast.error('保存失败')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-1">
      {/* 顶部导航 + 实时预览 header */}
      <div className="flex items-center gap-3 pb-2">
        <button
          onClick={onCancel}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-xl leading-none shrink-0">
            {icon || '🤖'}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-tight truncate">
              {name || (isEdit ? profile.name : '新建 Agent')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEdit ? '编辑 Agent 配置' : '新 Agent 配置'}
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: 基础信息 — emoji picker + 水平布局 */}
      <SettingsSection title="基础信息">
        <SettingsCard divided={false}>
          <div className="px-4 py-4">
            <div className="flex items-start gap-4">
              {/* Emoji 选择器 */}
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex size-16 items-center justify-center rounded-2xl bg-muted text-3xl leading-none shrink-0',
                      'ring-offset-background transition-all',
                      'hover:ring-2 hover:ring-ring hover:ring-offset-2',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    )}
                    title="选择图标"
                  >
                    {icon || '🤖'}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="right"
                  align="start"
                  sideOffset={12}
                  className="w-auto p-0 border-none shadow-xl"
                >
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: EmojiMartEmoji) => {
                      setIcon(emoji.native)
                      setShowEmojiPicker(false)
                    }}
                    locale="zh"
                    theme="auto"
                    previewPosition="none"
                    skinTonePosition="search"
                    perLine={8}
                  />
                </PopoverContent>
              </Popover>

              {/* Name + Description */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>
                    名称 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：PPT Agent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>描述</label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="如：专注制作演示文稿"
                  />
                </div>
              </div>
            </div>
            <p className={cn(DESCRIPTION_CLASS, 'mt-2 pl-0.5')}>
              点击图标更换 emoji
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Section 2: 模型配置 */}
      <SettingsSection title="模型配置" description="不设置则使用全局默认配置">
        <SettingsCard>
          <SettingsSelect
            label="默认渠道"
            value={channelId}
            onValueChange={handleChannelChange}
            options={[
              { value: NONE, label: '不指定' },
              ...channels.map((c) => ({ value: c.id, label: c.name })),
            ]}
            placeholder="选择渠道"
          />
          {channelId !== NONE && (
            <SettingsSelect
              label="默认模型"
              value={modelId}
              onValueChange={setModelId}
              options={[
                { value: NONE, label: '不指定' },
                ...modelOptions,
              ]}
              placeholder="选择模型"
            />
          )}
          <SettingsSegmentedControl
            label="思考模式"
            description="自适应模式下 Agent 会根据任务复杂度自动决定是否启用深度思考"
            value={thinkingToValue(thinking)}
            onValueChange={(v) => setThinking(valueToThinking(v, thinking))}
            options={THINKING_OPTIONS}
          />
          <SettingsSegmentedControl
            label="推理深度"
            description="控制 Agent 在每次回复中投入的推理计算量"
            value={effort ?? 'default'}
            onValueChange={(v) => setEffort(v === 'default' ? undefined : v as AgentEffort)}
            options={EFFORT_OPTIONS}
          />
          {/* 高级限制（折叠） */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            {advancedOpen
              ? <ChevronDown size={13} className="text-muted-foreground" />
              : <ChevronRight size={13} className="text-muted-foreground" />
            }
            <span className="text-xs font-medium text-muted-foreground">高级限制</span>
            {!advancedOpen && (budgetStr || turnsStr) && (
              <span className="text-xs text-muted-foreground/60 ml-auto">
                {[budgetStr && `$${budgetStr}`, turnsStr && `${turnsStr} 轮`].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {advancedOpen && (
            <>
              <SettingsInput
                label="预算限制（美元/次）"
                description="单次会话的最大花费，留空则不限制"
                value={budgetStr}
                onChange={setBudgetStr}
                placeholder="例如: 1.0"
                type="number"
              />
              <SettingsInput
                label="最大轮次"
                description="单次会话的最大交互轮次，留空则使用默认值"
                value={turnsStr}
                onChange={setTurnsStr}
                placeholder="例如: 50"
                type="number"
              />
            </>
          )}
        </SettingsCard>
      </SettingsSection>

      {/* Section 3: 能力配置 */}
      <CapabilitiesSection
        allCapabilities={allCapabilities}
        enabledMcpServers={enabledMcpServers}
        enabledSkills={enabledSkills}
        isMcpSelected={isMcpSelected}
        isSkillSelected={isSkillSelected}
        toggleMcpServer={toggleMcpServer}
        toggleSkill={toggleSkill}
      />

      {/* Section 4: 附加配置 */}
      <SettingsSection title="附加配置">
        <SettingsCard>
          <SettingsSelect
            label="默认工作区"
            description="使用此 Agent 时默认在哪个工作区创建会话"
            value={defaultWorkspaceId}
            onValueChange={setDefaultWorkspaceId}
            options={[
              { value: NONE, label: '不指定' },
              ...workspaces.map((w) => ({ value: w.id, label: w.name })),
            ]}
            placeholder="选择工作区"
          />
          {/* 附加提示词 */}
          <div className="px-4 py-3 space-y-2">
            <div>
              <div className={LABEL_CLASS}>附加提示词</div>
              <div className={cn(DESCRIPTION_CLASS, 'mt-0.5')}>
                追加在默认 system prompt 之后，用于微调 Agent 的角色和行为
              </div>
            </div>
            <Textarea
              value={additionalPrompt}
              onChange={(e) => setAdditionalPrompt(e.target.value)}
              placeholder="如：你是一个专业的 PPT 制作助手，擅长使用 Marp 和 reveal.js..."
              rows={5}
              className="resize-y min-h-[100px]"
            />
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 保存/取消按钮 */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50 mt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button onClick={handleSave} disabled={saving} className="min-w-[100px]">
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              保存中...
            </span>
          ) : isEdit ? '保存修改' : '创建 Agent'}
        </Button>
      </div>
    </div>
  )
}

// ===== 能力配置子组件 =====

interface CapabilitiesSectionProps {
  allCapabilities: WorkspaceCapabilitiesSummary[]
  enabledMcpServers: AgentProfileMcpRef[]
  enabledSkills: AgentProfileSkillRef[]
  isMcpSelected: (workspaceId: string, serverName: string) => boolean
  isSkillSelected: (workspaceId: string, skillName: string) => boolean
  toggleMcpServer: (workspaceId: string, serverName: string) => void
  toggleSkill: (workspaceId: string, skillName: string) => void
}

function CapabilitiesSection({
  allCapabilities,
  enabledMcpServers,
  enabledSkills,
  isMcpSelected,
  isSkillSelected,
  toggleMcpServer,
  toggleSkill,
}: CapabilitiesSectionProps): React.ReactElement {
  const workspacesWithMcp = allCapabilities.filter((ws) => ws.capabilities.mcpServers.length > 0)
  const workspacesWithSkills = allCapabilities.filter((ws) => ws.capabilities.skills.length > 0)

  const mcpCount = enabledMcpServers.length
  const skillCount = enabledSkills.length

  return (
    <SettingsSection
      title="能力配置"
      description="为此 Agent 挑选工具和技能"
    >
      <div className="space-y-4">
        {/* 已选摘要 */}
        {(mcpCount > 0 || skillCount > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {mcpCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Plug size={11} />
                {mcpCount} MCP
              </span>
            )}
            {skillCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Sparkles size={11} />
                {skillCount} Skills
              </span>
            )}
          </div>
        )}

        {/* MCP 服务器 */}
        {workspacesWithMcp.length > 0 && (
          <CapabilityGroup label="MCP 服务器" icon={<Plug size={13} />}>
            {workspacesWithMcp.map((ws) => (
              <WorkspaceChipGroup key={ws.workspaceId} workspaceName={ws.workspaceName}>
                {ws.capabilities.mcpServers.map((server) => (
                  <CapabilityChip
                    key={server.name}
                    label={server.name}
                    badge={server.type}
                    selected={isMcpSelected(ws.workspaceId, server.name)}
                    disabled={!server.enabled}
                    onClick={() => toggleMcpServer(ws.workspaceId, server.name)}
                    variant="mcp"
                  />
                ))}
              </WorkspaceChipGroup>
            ))}
          </CapabilityGroup>
        )}

        {/* Skills */}
        {workspacesWithSkills.length > 0 && (
          <CapabilityGroup label="Skills" icon={<Sparkles size={13} />}>
            {workspacesWithSkills.map((ws) => (
              <WorkspaceChipGroup key={ws.workspaceId} workspaceName={ws.workspaceName}>
                {ws.capabilities.skills.map((skill) => (
                  <CapabilityChip
                    key={skill.slug}
                    label={skill.name}
                    icon={skill.icon || '⚡'}
                    selected={isSkillSelected(ws.workspaceId, skill.slug)}
                    onClick={() => toggleSkill(ws.workspaceId, skill.slug)}
                    variant="skill"
                  />
                ))}
              </WorkspaceChipGroup>
            ))}
          </CapabilityGroup>
        )}

        {/* 空状态 */}
        {workspacesWithMcp.length === 0 && workspacesWithSkills.length === 0 && (
          <SettingsCard divided={false}>
            <div className="py-10 text-center text-sm text-muted-foreground">
              暂无可用的 MCP 或 Skills，请先在工作区中配置
            </div>
          </SettingsCard>
        )}
      </div>
    </SettingsSection>
  )
}

// ===== Chip 子组件 =====

function CapabilityGroup({ label, icon, children }: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function WorkspaceChipGroup({ workspaceName, children }: {
  workspaceName: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground/70 font-medium pl-0.5">
        {workspaceName}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  )
}

interface CapabilityChipProps {
  label: string
  icon?: string
  badge?: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
  variant: 'mcp' | 'skill'
}

function CapabilityChip({ label, icon, badge, selected, disabled, onClick, variant }: CapabilityChipProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        'transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        selected && variant === 'mcp' && 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15',
        selected && variant === 'skill' && 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15',
        !selected && 'border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:text-foreground hover:bg-muted/50',
      )}
      title={disabled ? '已禁用' : undefined}
    >
      {selected && <Check size={11} className="shrink-0" />}
      {icon && !selected && <span className="text-[11px] leading-none">{icon}</span>}
      <span>{label}</span>
      {badge && (
        <span className={cn(
          'rounded px-1 py-px text-[10px] font-normal',
          selected ? 'opacity-60' : 'bg-muted text-muted-foreground/70',
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}
