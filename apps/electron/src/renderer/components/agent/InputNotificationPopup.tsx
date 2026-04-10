/**
 * InputNotificationPopup — 跨会话 Input 弹窗通知
 *
 * 当后台 Agent 会话需要用户输入（权限确认 / AskUser / Plan 审批）时，
 * 在右下角弹出小卡片通知。用户可以点击跳转到对应会话或关闭通知。
 * 当目标会话的挂起请求被清空后，对应弹窗自动消失。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { useStore } from 'jotai'
import { Shield, MessageSquareMore, GitBranch, ArrowRight } from 'lucide-react'
import {
  inputNotificationsAtom,
  inputNotificationPopupEnabledAtom,
} from '@/atoms/notifications'
import type { InputNotificationType } from '@/atoms/notifications'
import {
  allPendingPermissionRequestsAtom,
  allPendingAskUserRequestsAtom,
  allPendingExitPlanRequestsAtom,
} from '@/atoms/agent-atoms'
import { tabsAtom, splitLayoutAtom, openTab } from '@/atoms/tab-atoms'
import { cn } from '@/lib/utils'

/** 最多同时显示的弹窗数量 */
const MAX_VISIBLE = 3

/** 通知类型对应的图标和标签 */
const TYPE_CONFIG: Record<InputNotificationType, {
  icon: React.ElementType
  label: string
}> = {
  permission: { icon: Shield, label: '权限确认' },
  ask_user: { icon: MessageSquareMore, label: '等待回答' },
  plan: { icon: GitBranch, label: '计划审批' },
}

export function InputNotificationPopup(): React.ReactElement | null {
  const store = useStore()
  const enabled = useAtomValue(inputNotificationPopupEnabledAtom)
  const [notifications, setNotifications] = useAtom(inputNotificationsAtom)

  // 监听三个 pending Map atoms，自动清理已解决的通知
  const pendingPermissions = useAtomValue(allPendingPermissionRequestsAtom)
  const pendingAskUser = useAtomValue(allPendingAskUserRequestsAtom)
  const pendingExitPlan = useAtomValue(allPendingExitPlanRequestsAtom)

  React.useEffect(() => {
    setNotifications((prev) => {
      if (prev.length === 0) return prev
      const filtered = prev.filter((n) => {
        if (n.type === 'permission') return (pendingPermissions.get(n.sessionId)?.length ?? 0) > 0
        if (n.type === 'ask_user') return (pendingAskUser.get(n.sessionId)?.length ?? 0) > 0
        if (n.type === 'plan') return (pendingExitPlan.get(n.sessionId)?.length ?? 0) > 0
        return false
      })
      // 仅在实际变化时更新，避免无限循环
      return filtered.length === prev.length ? prev : filtered
    })
  }, [pendingPermissions, pendingAskUser, pendingExitPlan, setNotifications])

  if (!enabled || notifications.length === 0) return null

  const visible = notifications.slice(-MAX_VISIBLE)

  /** 关闭单条通知 */
  const handleDismiss = (id: string): void => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  /** 跳转到对应会话并关闭通知 */
  const handleNavigate = (id: string, sessionId: string, sessionTitle: string): void => {
    const tabs = store.get(tabsAtom)
    const layout = store.get(splitLayoutAtom)
    const result = openTab(tabs, layout, { type: 'agent', sessionId, title: sessionTitle })
    store.set(tabsAtom, result.tabs)
    store.set(splitLayoutAtom, result.layout)
    handleDismiss(id)
  }

  return (
    <div className="fixed top-14 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {visible.map((notification) => {
        const config = TYPE_CONFIG[notification.type]
        const Icon = config.icon
        return (
          <div
            key={notification.id}
            className={cn(
              'pointer-events-auto w-[320px] rounded-lg border bg-background overflow-hidden',
              'shadow-[0_2px_12px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_12px_rgba(255,255,255,0.08)]',
              'animate-in slide-in-from-right-5 fade-in duration-200',
              'flex flex-col'
            )}
          >
            {/* 头部：带背景色的 title 栏 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] dark:bg-foreground/[0.06]">
              <Icon size={16} className="shrink-0 text-foreground/60" />
              <span className="text-[13px] font-medium truncate flex-1 text-foreground">
                {notification.sessionTitle}
              </span>
              <span className="text-[11px] shrink-0 text-foreground/50">
                {config.label}
              </span>
            </div>
            {/* 描述文本 */}
            <p className="text-[12px] text-foreground/60 line-clamp-2 px-3 pt-2 pl-9">
              {notification.message}
            </p>
            {/* 操作按钮行：三等分布局，按钮分别在 2/3 和 3/3 位置 */}
            <div className="grid grid-cols-3 px-3 pb-3 pt-3 -ml-[105px]">
              <button
                onClick={() => handleNavigate(notification.id, notification.sessionId, notification.sessionTitle)}
                className="flex items-center justify-center gap-1 text-[12px] font-medium text-foreground/70 hover:underline col-start-2"
              >
                跳转到会话
                <ArrowRight size={12} />
              </button>
              <button
                onClick={() => handleDismiss(notification.id)}
                className="text-[12px] font-medium text-red-500/70 hover:underline col-start-3"
              >
                关闭
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
