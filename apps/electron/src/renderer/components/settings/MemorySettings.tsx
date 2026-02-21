/**
 * MemorySettings - 记忆设置页
 *
 * 独立的顶级设置 tab，管理 Agent 跨会话记忆功能的配置。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { FolderOpen, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
  workspaceCapabilitiesVersionAtom,
} from '@/atoms/agent-atoms'
import type { MemoryConfig } from '@proma/shared'
import { SettingsSection, SettingsCard } from './primitives'

export function MemorySettings(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const bumpCapabilitiesVersion = useSetAtom(workspaceCapabilitiesVersionAtom)

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)
  const workspaceSlug = currentWorkspace?.slug ?? ''

  const [config, setConfig] = React.useState<MemoryConfig>({ enabled: false, apiKey: '', userId: '' })
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  // 本地编辑状态
  const [apiKey, setApiKey] = React.useState('')
  const [userId, setUserId] = React.useState('')

  // 加载配置
  React.useEffect(() => {
    if (!workspaceSlug) {
      setLoading(false)
      return
    }
    window.electronAPI.getMemoryConfig(workspaceSlug)
      .then((c) => {
        setConfig(c)
        setApiKey(c.apiKey)
        setUserId(c.userId)
      })
      .catch((err) => console.error('[记忆设置] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [workspaceSlug])

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen size={48} className="text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">
          请先在 Agent 模式下选择或创建一个工作区
        </p>
      </div>
    )
  }

  const handleSave = async (updated: MemoryConfig): Promise<void> => {
    setSaving(true)
    try {
      await window.electronAPI.setMemoryConfig(workspaceSlug, updated)
      setConfig(updated)
      setApiKey(updated.apiKey)
      setUserId(updated.userId)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[记忆设置] 保存失败:', error)
    } finally {
      setSaving(false)
    }
  }

  const dirty = apiKey !== config.apiKey || userId !== config.userId

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        title="记忆"
        description="启用后 Agent 可跨会话记住重要信息"
        action={
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => handleSave({ ...config, apiKey, userId, enabled: checked })}
            disabled={saving}
          />
        }
      >
        <SettingsCard divided={false}>
          <div className="space-y-4 p-4">
            {/* 引导说明 */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm text-muted-foreground">
              <p>记忆功能由 <span className="font-medium text-foreground">MemOS Cloud</span> 提供，启用后 Agent 能跨会话记住你的偏好、决策和项目上下文。</p>
              <p className="text-xs">配置步骤：</p>
              <ol className="text-xs list-decimal list-inside space-y-1">
                <li>
                  访问{' '}
                  <a
                    href="https://memos-dashboard.openmem.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    MemOS Cloud 控制台
                    <ExternalLink size={10} />
                  </a>
                  {' '}注册账号
                </li>
                <li>在控制台的 API Keys 页面生成一个 API Key</li>
                <li>将 API Key 填入下方，设置一个 User ID，然后开启开关</li>
              </ol>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                placeholder="memos API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User ID</label>
              <Input
                placeholder="proma-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">用于隔离不同用户的记忆数据</p>
            </div>
            {dirty && (
              <Button
                size="sm"
                disabled={saving}
                onClick={() => handleSave({ ...config, apiKey, userId })}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
