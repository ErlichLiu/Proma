/**
 * TutorialBanner - 教程推荐横幅
 *
 * 固定在右下角的浮动卡片，引导用户查看教程或打开启动助手。
 * - 不区分新老用户，使用 tutorialBannerDismissed 字段控制
 * - 用户点击任意按钮后永不再显示
 * - 明确告知教程的下次访问位置：设置 > 教程
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { GraduationCap, X, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tabsAtom, activeTabIdAtom, openTab, TUTORIAL_TAB_ID } from '@/atoms/tab-atoms'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { useStore } from 'jotai'

export function TutorialBanner(): React.ReactElement | null {
  const [visible, setVisible] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(true)
  const [tabs, setTabs] = useAtom(tabsAtom)
  const setActiveTabId = useSetAtom(activeTabIdAtom)
  const setConversations = useSetAtom(conversationsAtom)
  const store = useStore()

  React.useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        if (!settings.tutorialBannerDismissed) {
          setDismissed(false)
          setTimeout(() => setVisible(true), 1500)
        }
      })
      .catch(console.error)
  }, [])

  const handleDismiss = async () => {
    setVisible(false)
    await window.electronAPI.updateSettings({ tutorialBannerDismissed: true })
  }

  const handleLearnNow = async () => {
    const result = openTab(tabs, { type: 'tutorial', sessionId: TUTORIAL_TAB_ID, title: 'Proma 使用教程' })
    setTabs(result.tabs)
    setActiveTabId(result.activeTabId)
    await handleDismiss()
  }

  const handleOpenAssistant = async () => {
    try {
      const meta = await window.electronAPI.getOrCreateSystemAssistant('onboarding')
      if (meta) {
        const conversations = store.get(conversationsAtom)
        if (!conversations.find((c) => c.id === meta.id)) {
          setConversations([meta, ...conversations])
        }
        const currentTabs = store.get(tabsAtom)
        const result = openTab(currentTabs, { type: 'chat', sessionId: meta.id, title: meta.title })
        setTabs(result.tabs)
        setActiveTabId(result.activeTabId)
      }
    } catch (error) {
      console.error('[TutorialBanner] 打开启动助手失败:', error)
    }
    await handleDismiss()
  }

  // 稍后再学：关闭横幅
  const handleLater = async () => {
    await handleDismiss()
  }

  if (dismissed) return null

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] w-[340px] transition-all duration-500 ease-out ${
        visible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-8 opacity-0 pointer-events-none'
      }`}
    >
      <div className="relative rounded-2xl bg-gradient-to-br from-primary/5 via-background to-primary/10 border border-primary/15 shadow-lg shadow-primary/5 backdrop-blur-sm p-5">
        {/* 关闭按钮 */}
        <button
          onClick={handleLater}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5 transition-colors"
        >
          <X size={14} />
        </button>

        {/* 图标 + 标题 */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">刚开始使用 Proma？</h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择最适合你的方式快速上手</p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleOpenAssistant}
            className="flex-1 h-8 text-xs gap-1.5"
          >
            <Rocket size={12} />
            启动助手
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLearnNow}
            className="flex-1 h-8 text-xs"
          >
            查看教程
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleLater}
            className="h-8 text-xs text-muted-foreground px-2"
          >
            稍后
          </Button>
        </div>

        {/* 提示文字 */}
        <p className="text-[11px] text-muted-foreground/60 mt-3 text-center">
          启动助手可随时从侧边栏 Proma 助手 重新打开
        </p>
      </div>
    </div>
  )
}
