/**
 * GeneralSettings - 通用设置页
 *
 * 顶部：用户档案编辑（头像 + 用户名）
 * 下方：语言等通用设置
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Camera, ImagePlus } from 'lucide-react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from './primitives'
import { Check } from 'lucide-react'
import { LABEL_CLASS, DESCRIPTION_CLASS } from './primitives/SettingsUIConstants'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { UserAvatar } from '../chat/UserAvatar'
import { userProfileAtom } from '@/atoms/user-profile'
import {
  notificationsEnabledAtom,
  updateNotificationsEnabled,
} from '@/atoms/notifications'
import {
  chatMessageLayoutAtom,
  updateChatMessageLayout,
} from '@/atoms/chat-message-layout'
import { cn } from '@/lib/utils'
import type { ChatMessageLayout } from '../../../types'

/** emoji-mart 选择回调的 emoji 对象类型 */
interface EmojiMartEmoji {
  id: string
  name: string
  native: string
  unified: string
  keywords: string[]
  shortcodes: string
}

/** 布局模式定义 */
const LAYOUT_MODES = [
  {
    value: 'left-aligned' as const,
    label: '左对齐',
    description: '所有消息左对齐显示',
  },
  {
    value: 'left-right' as const,
    label: '左右分布',
    description: '用户消息右对齐，AI 消息左对齐',
  },
]

export function GeneralSettings(): React.ReactElement {
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const [notificationsEnabled, setNotificationsEnabled] = useAtom(notificationsEnabledAtom)
  const [chatMessageLayout, setChatMessageLayout] = useAtom(chatMessageLayoutAtom)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [nameInput, setNameInput] = React.useState(userProfile.userName)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  /** 更新头像 */
  const handleAvatarChange = async (avatar: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateUserProfile({ avatar })
      setUserProfile(updated)
      setShowEmojiPicker(false)
    } catch (error) {
      console.error('[通用设置] 更新头像失败:', error)
    }
  }

  /** 上传图片作为头像 */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      await handleAvatarChange(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  /** 保存用户名 */
  const handleSaveName = async (): Promise<void> => {
    const trimmed = nameInput.trim()
    if (!trimmed) return

    try {
      const updated = await window.electronAPI.updateUserProfile({ userName: trimmed })
      setUserProfile(updated)
      setIsEditingName(false)
    } catch (error) {
      console.error('[通用设置] 更新用户名失败:', error)
    }
  }

  /** 用户名编辑键盘事件 */
  const handleNameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      setNameInput(userProfile.userName)
      setIsEditingName(false)
    }
  }

  /** 切换消息布局模式 */
  const handleLayoutChange = React.useCallback((layout: ChatMessageLayout) => {
    setChatMessageLayout(layout)
    updateChatMessageLayout(layout)
  }, [setChatMessageLayout])

  return (
    <div className="space-y-6">
      {/* 用户档案区域 */}
      <SettingsSection
        title="用户档案"
        description="设置你的头像和显示名称"
      >
        <SettingsCard>
          <div className="flex items-center gap-5 px-4 py-4">
            {/* 头像 + Popover emoji 选择器 */}
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <div className="relative group/avatar cursor-pointer">
                  <UserAvatar avatar={userProfile.avatar} size={64} />
                  {/* 编辑覆盖层 */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-[20%] flex items-center justify-center',
                      'bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity'
                    )}
                  >
                    <Camera className="size-5 text-white" />
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-auto p-0 border-none shadow-xl"
              >
                <Picker
                  data={data}
                  onEmojiSelect={(emoji: EmojiMartEmoji) => handleAvatarChange(emoji.native)}
                  locale="zh"
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                  perLine={8}
                />
                {/* 上传自定义图片 */}
                <div className="px-3 p-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px]',
                      'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors'
                    )}
                  >
                    <ImagePlus className="size-4" />
                    上传自定义图片
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* 用户名 */}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleNameKeyDown}
                  maxLength={30}
                  autoFocus
                  className={cn(
                    'text-lg font-semibold text-foreground bg-transparent border-b-2 border-primary',
                    'outline-none w-full max-w-[200px] pb-0.5'
                  )}
                />
              ) : (
                <button
                  onClick={() => {
                    setNameInput(userProfile.userName)
                    setIsEditingName(true)
                  }}
                  className="text-lg font-semibold text-foreground hover:text-primary transition-colors text-left"
                >
                  {userProfile.userName}
                </button>
              )}
              <p className="text-[12px] text-foreground/40 mt-0.5">
                点击头像更换，点击名字编辑
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 通用设置 */}
      <SettingsSection
        title="通用设置"
        description="应用的基本配置"
      >
        <SettingsCard>
          <SettingsRow
            label="语言"
            description="更多语言支持即将推出"
          >
            <span className="text-[13px] text-foreground/40">简体中文</span>
          </SettingsRow>
          <SettingsToggle
            label="桌面通知"
            description="Agent 完成任务或需要操作时发送通知"
            checked={notificationsEnabled}
            onCheckedChange={(checked) => {
              setNotificationsEnabled(checked)
              updateNotificationsEnabled(checked)
            }}
          />
          {/* 会话显示模式 - 卡片式选择器 */}
          <div className="px-4 py-3">
            <div className={cn(LABEL_CLASS)}>会话显示模式</div>
            <div className={cn(DESCRIPTION_CLASS, 'mt-0.5 mb-3')}>选择消息气泡的排列方式</div>
            <div className="grid grid-cols-2 gap-3">
              {LAYOUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => handleLayoutChange(mode.value)}
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200',
                    'hover:border-primary/50 hover:bg-foreground/[0.02]',
                    chatMessageLayout === mode.value
                      ? 'border-primary bg-primary/[0.03]'
                      : 'border-border bg-background'
                  )}
                >
                  {/* 预览图 - 高度自适应内容，无多余空白 */}
                  <div className="w-full rounded-lg bg-muted/50 p-2 flex flex-col gap-1.5">
                    {mode.value === 'left-aligned' ? (
                      /* 左对齐模式预览 */
                      <>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-primary/20 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-3/4 bg-foreground/10 rounded" />
                            <div className="h-2 w-1/2 bg-foreground/10 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-foreground/10 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-2/3 bg-primary/15 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-primary/20 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-4/5 bg-foreground/10 rounded" />
                            <div className="h-2 w-1/2 bg-foreground/10 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-foreground/10 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-3/5 bg-primary/15 rounded" />
                          </div>
                        </div>
                      </>
                    ) : (
                      /* 左右分布模式预览 */
                      <>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-primary/20 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-3/4 bg-foreground/10 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-row-reverse">
                          <div className="w-4 h-4 rounded-full bg-foreground/10 shrink-0" />
                          <div className="flex-1 flex justify-end">
                            <div className="h-2 w-1/2 bg-primary/15 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-primary/20 shrink-0" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-2/3 bg-foreground/10 rounded" />
                            <div className="h-2 w-1/3 bg-foreground/10 rounded" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-row-reverse">
                          <div className="w-4 h-4 rounded-full bg-foreground/10 shrink-0" />
                          <div className="flex-1 flex justify-end">
                            <div className="h-2 w-3/5 bg-primary/15 rounded" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* 底部信息 */}
                  <div className="flex items-center gap-2 w-full">
                    {/* 选择框 */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                        chatMessageLayout === mode.value
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {chatMessageLayout === mode.value && (
                        <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                      )}
                    </div>
                    {/* 文字信息 */}
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-foreground">{mode.label}</span>
                      <span className="text-[11px] text-muted-foreground">{mode.description}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
