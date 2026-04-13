/**
 * AgentSelector — Agent Profile 选择器
 *
 * 集成在 AgentView 输入框底部工具栏，下拉选择当前会话的 Agent Profile。
 * 默认显示"默认"（工作区隐式配置），可选择自定义 Agent Profile。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { agentProfilesAtom } from '@/atoms/agent-atoms'
import type { AgentProfile } from '@proma/shared'

interface AgentSelectorProps {
  /** 当前选中的 Profile ID（null = 工作区隐式默认） */
  selectedProfileId: string | null
  /** 选择回调（null = 切回隐式默认） */
  onSelect: (profile: AgentProfile | null) => void
}

export function AgentSelector({ selectedProfileId, onSelect }: AgentSelectorProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const profiles = useAtomValue(agentProfilesAtom)
  const selectedProfile = selectedProfileId ? profiles.find((p) => p.id === selectedProfileId) : null

  const handleSelect = (profile: AgentProfile | null): void => {
    onSelect(profile)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="text-sm leading-none">{selectedProfile?.icon || '🤖'}</span>
          <span className="max-w-[100px] truncate">
            {selectedProfile?.name || '默认'}
          </span>
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-52 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* 默认选项 */}
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
        >
          <span className="text-sm leading-none">⚙️</span>
          <span className="flex-1 text-left truncate">默认（工作区配置）</span>
          {!selectedProfileId && <Check className="size-3 text-primary" />}
        </button>

        {/* Profile 列表 */}
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => handleSelect(profile)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            <span className="text-sm leading-none">{profile.icon || '🤖'}</span>
            <div className="flex-1 min-w-0 text-left">
              <div className="truncate">{profile.name}</div>
              {profile.description && (
                <div className="text-[10px] text-muted-foreground truncate">{profile.description}</div>
              )}
            </div>
            {selectedProfileId === profile.id && <Check className="size-3 text-primary shrink-0" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
