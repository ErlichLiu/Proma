/**
 * AppearanceSettings - 外观设置页
 *
 * 主题切换（浅色/深色/跟随系统），使用 SettingsSegmentedControl。
 * 通过 Jotai atom 管理状态，持久化到 ~/.proma/settings.json。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSegmentedControl,
} from './primitives'
import { themeModeAtom, updateThemeMode } from '@/atoms/theme'
import { zoomModeAtom, messageAreaZoomLevelAtom, globalZoomLevelAtom, updateZoomMode } from '@/atoms/zoom-atoms'
import type { ThemeMode, ZoomMode } from '../../../types'

/** 主题选项 */
const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

/** 缩放模式选项 */
const ZOOM_MODE_OPTIONS = [
  { value: 'message-area', label: '消息区域' },
  { value: 'global', label: '全局界面' },
]

/** 根据平台返回缩放快捷键提示 */
const isMac = navigator.userAgent.includes('Mac')
const ZOOM_HINT = isMac
  ? '使用 ⌘+ 放大、⌘- 缩小、⌘0 恢复默认大小'
  : '使用 Ctrl++ 放大、Ctrl+- 缩小、Ctrl+0 恢复默认大小'

export function AppearanceSettings(): React.ReactElement {
  const [themeMode, setThemeMode] = useAtom(themeModeAtom)
  const [zoomMode, setZoomMode] = useAtom(zoomModeAtom)
  const messageAreaZoomLevel = useAtomValue(messageAreaZoomLevelAtom)
  const globalZoomLevel = useAtomValue(globalZoomLevelAtom)

  // 根据当前模式选择显示的缩放级别
  const currentZoomLevel = zoomMode === 'message-area' ? messageAreaZoomLevel : globalZoomLevel

  /** 切换主题模式 */
  const handleThemeChange = React.useCallback((value: string) => {
    const mode = value as ThemeMode
    setThemeMode(mode)
    updateThemeMode(mode)
  }, [setThemeMode])

  /** 切换缩放模式 */
  const handleZoomModeChange = React.useCallback((value: string) => {
    const mode = value as ZoomMode
    setZoomMode(mode)
    updateZoomMode(mode)
  }, [setZoomMode])

  return (
    <SettingsSection
      title="外观设置"
      description="自定义应用的视觉风格"
    >
      <SettingsCard>
        <SettingsSegmentedControl
          label="主题模式"
          description="选择应用的配色方案"
          value={themeMode}
          onValueChange={handleThemeChange}
          options={THEME_OPTIONS}
        />
        <div>
          <SettingsSegmentedControl
            label="界面缩放"
            description="选择缩放应用的范围"
            value={zoomMode}
            onValueChange={handleZoomModeChange}
            options={ZOOM_MODE_OPTIONS}
          />
          <SettingsRow
            label=""
            description={
              <>
                <span className="font-bold">当前缩放级别</span>: {Math.round(currentZoomLevel * 100)}% · {ZOOM_HINT}
              </>
            }
            className="-mt-2"
          />
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
