/**
 * ShortcutSettings - 快捷键设置页面
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSelect,
} from './primitives'
import { ShortcutRecorder } from './primitives/ShortcutRecorder'
import {
  chatShortcutAtom,
  agentShortcutAtom,
  updateChatShortcutAtom,
  updateAgentShortcutAtom,
} from '@/atoms/shortcut-atoms'
import type { ShortcutBehavior } from '../../../types'

export function ShortcutSettings(): React.ReactElement {
  const [chatShortcut] = useAtom(chatShortcutAtom)
  const [agentShortcut] = useAtom(agentShortcutAtom)
  const updateChatShortcut = useSetAtom(updateChatShortcutAtom)
  const updateAgentShortcut = useSetAtom(updateAgentShortcutAtom)

  const handleChatAcceleratorChange = (accelerator: string) => {
    if (!chatShortcut) return
    updateChatShortcut({ ...chatShortcut, accelerator })
  }

  const handleChatBehaviorChange = (value: string) => {
    if (!chatShortcut) return
    updateChatShortcut({ ...chatShortcut, behavior: value as ShortcutBehavior })
  }

  const handleChatEnabledChange = (enabled: boolean) => {
    if (!chatShortcut) return
    updateChatShortcut({ ...chatShortcut, enabled })
  }

  const handleAgentAcceleratorChange = (accelerator: string) => {
    if (!agentShortcut) return
    updateAgentShortcut({ ...agentShortcut, accelerator })
  }

  const handleAgentBehaviorChange = (value: string) => {
    if (!agentShortcut) return
    updateAgentShortcut({ ...agentShortcut, behavior: value as ShortcutBehavior })
  }

  const handleAgentEnabledChange = (enabled: boolean) => {
    if (!agentShortcut) return
    updateAgentShortcut({ ...agentShortcut, enabled })
  }

  const validateChatShortcut = async (accelerator: string): Promise<boolean> => {
    // 检查是否与 Agent 快捷键冲突
    if (agentShortcut?.enabled && agentShortcut.accelerator === accelerator) {
      return false
    }
    // 检查系统占用
    return window.electronAPI.validateShortcut(accelerator)
  }

  const validateAgentShortcut = async (accelerator: string): Promise<boolean> => {
    // 检查是否与 Chat 快捷键冲突
    if (chatShortcut?.enabled && chatShortcut.accelerator === accelerator) {
      return false
    }
    // 检查系统占用
    return window.electronAPI.validateShortcut(accelerator)
  }

  const behaviorOptions = [
    { value: 'new-conversation', label: '创建新对话' },
    { value: 'current-conversation', label: '打开当前对话' },
  ]

  return (
    <SettingsSection
      title="快捷键"
      description="配置全局快捷键，在任何应用中快速打开 Proma"
    >
      {/* Chat 快捷键 */}
      <SettingsCard>
        <div className="px-4 py-3">
          <h3 className="text-base font-medium mb-1">Chat 模式快捷键</h3>
          <p className="text-sm text-muted-foreground">快速打开 Chat 对话</p>
        </div>

        <SettingsToggle
          label="启用快捷键"
          checked={chatShortcut?.enabled ?? false}
          onCheckedChange={handleChatEnabledChange}
        />

        <SettingsRow label="快捷键组合">
          <ShortcutRecorder
            value={chatShortcut?.accelerator ?? ''}
            onChange={handleChatAcceleratorChange}
            onValidate={validateChatShortcut}
          />
        </SettingsRow>

        <SettingsSelect
          label="打开行为"
          value={chatShortcut?.behavior ?? 'new-conversation'}
          onValueChange={handleChatBehaviorChange}
          options={behaviorOptions}
        />
      </SettingsCard>

      {/* Agent 快捷键 */}
      <SettingsCard>
        <div className="px-4 py-3">
          <h3 className="text-base font-medium mb-1">Agent 模式快捷键</h3>
          <p className="text-sm text-muted-foreground">快速打开 Agent 会话</p>
        </div>

        <SettingsToggle
          label="启用快捷键"
          checked={agentShortcut?.enabled ?? false}
          onCheckedChange={handleAgentEnabledChange}
        />

        <SettingsRow label="快捷键组合">
          <ShortcutRecorder
            value={agentShortcut?.accelerator ?? ''}
            onChange={handleAgentAcceleratorChange}
            onValidate={validateAgentShortcut}
          />
        </SettingsRow>

        <SettingsSelect
          label="打开行为"
          value={agentShortcut?.behavior ?? 'new-conversation'}
          onValueChange={handleAgentBehaviorChange}
          options={behaviorOptions}
        />
      </SettingsCard>

      <div className="px-4 text-xs text-muted-foreground space-y-1">
        <p>提示：macOS 需要授予辅助功能权限才能使用全局快捷键。</p>
        <p>如果快捷键不生效，请在系统偏好设置中检查权限。</p>
      </div>
    </SettingsSection>
  )
}
