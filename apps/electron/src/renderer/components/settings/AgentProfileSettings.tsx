/**
 * AgentProfileSettings - Agent Profile 管理页
 *
 * 设置页 Agents Tab，管理全局 Agent Profile 的 CRUD。
 * 视图模式：list / create / edit
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { AgentProfile } from '@proma/shared'
import { agentProfilesAtom } from '@/atoms/agent-atoms'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { AgentProfileForm } from './AgentProfileForm'

type ViewMode = 'list' | 'create' | 'edit'

export function AgentProfileSettings(): React.ReactElement {
  const setGlobalProfiles = useSetAtom(agentProfilesAtom)

  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([])
  const [editingProfile, setEditingProfile] = React.useState<AgentProfile | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadProfiles = React.useCallback(async () => {
    try {
      const list = await window.electronAPI.listAgentProfiles()
      setProfiles(list)
      setGlobalProfiles(list)
    } catch (error) {
      console.error('[Agent Profile] 加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [setGlobalProfiles])

  React.useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  const handleDelete = React.useCallback(async (profile: AgentProfile) => {
    if (profile.isBuiltin) return
    if (!confirm(`确定要删除 Agent「${profile.name}」吗？`)) return
    try {
      const ok = await window.electronAPI.deleteAgentProfile(profile.id)
      if (ok) {
        toast.success(`已删除 Agent「${profile.name}」`)
        await loadProfiles()
      } else {
        toast.error('删除失败')
      }
    } catch (error) {
      console.error('[Agent Profile] 删除失败:', error)
      toast.error('删除失败')
    }
  }, [loadProfiles])

  const handleFormSaved = React.useCallback(async () => {
    setViewMode('list')
    setEditingProfile(null)
    await loadProfiles()
  }, [loadProfiles])

  const handleFormCancel = React.useCallback(() => {
    setViewMode('list')
    setEditingProfile(null)
  }, [])

  // 创建/编辑视图
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <AgentProfileForm
        profile={editingProfile}
        onSaved={handleFormSaved}
        onCancel={handleFormCancel}
      />
    )
  }

  // 列表视图
  return (
    <div className="space-y-6 p-1">
      <SettingsSection
        title="Agents"
        description="管理你的 Agent 角色配置，每个 Agent 可以拥有独立的模型、MCP、Skills 和提示词配置"
        action={
          <Button size="sm" onClick={() => setViewMode('create')}>
            <Plus size={16} />
            <span>新建 Agent</span>
          </Button>
        }
      >
        {loading ? (
          /* 骨架屏 */
          <SettingsCard divided={false}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="size-8 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-44 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </SettingsCard>
        ) : profiles.length === 0 ? (
          /* 空状态 */
          <SettingsCard divided={false}>
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-2xl">
                🤖
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">还没有任何 Agent</p>
                <p className="text-sm text-muted-foreground">点击「新建 Agent」开始配置</p>
              </div>
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard>
            {profiles.map((profile) => (
              <div key={profile.id} className="relative">
                {/* 预置 Agent 左侧主题色竖线 */}
                {profile.isBuiltin && (
                  <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary/30" />
                )}
                <SettingsRow
                  label={profile.name}
                  icon={
                    <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-lg leading-none shrink-0">
                      {profile.icon || '🤖'}
                    </span>
                  }
                  description={profile.description || '未设置描述'}
                  className="group"
                >
                  <div className="flex items-center gap-2">
                    {profile.isBuiltin && (
                      <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        预置
                      </span>
                    )}
                    {profile.defaultModelId && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium max-w-[120px] truncate">
                        {profile.defaultModelId}
                      </span>
                    )}
                    {(profile.enabledMcpServers.length > 0 || profile.enabledSkills.length > 0) && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium tabular-nums">
                        {[
                          profile.enabledMcpServers.length > 0 && `${profile.enabledMcpServers.length} MCP`,
                          profile.enabledSkills.length > 0 && `${profile.enabledSkills.length} Skills`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setEditingProfile(profile)
                        setViewMode('edit')
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    {!profile.isBuiltin && (
                      <button
                        onClick={() => handleDelete(profile)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </SettingsRow>
              </div>
            ))}
          </SettingsCard>
        )}
      </SettingsSection>
    </div>
  )
}
