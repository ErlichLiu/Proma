/**
 * AI Elements - 对话容器原语
 *
 * 基于 use-stick-to-bottom 实现自动滚动到底部的对话容器。
 * 移植自 proma-frontend 的 ai-elements/conversation.tsx。
 *
 * 包含：
 * - Conversation — 根容器（StickToBottom）
 * - ConversationContent — 内容区域
 * - ConversationEmptyState — 空状态
 * - ConversationScrollButton — 滚动到底部按钮
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  captureScrollMemory,
  isScrollMemoryStateEqual,
  resolveScrollMemory,
} from '@/lib/scroll-memory'
import type { ScrollMemoryState } from '@/lib/scroll-memory'
import { ArrowDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import {
  StickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom'

// ===== Conversation 根容器 =====

export interface ConversationProps extends ComponentProps<typeof StickToBottom> {
  scrollMemory?: ScrollMemoryState | null
  onScrollMemoryChange?: (state: ScrollMemoryState) => void
  restoreKey?: string
  restoreVersion?: string | number
  onRestoreComplete?: () => void
}

function ConversationScrollMemory({
  scrollMemory,
  onScrollMemoryChange,
  restoreKey,
  restoreVersion,
  onRestoreComplete,
}: Pick<ConversationProps, 'scrollMemory' | 'onScrollMemoryChange' | 'restoreKey' | 'restoreVersion' | 'onRestoreComplete'>): null {
  const { scrollRef, stopScroll, scrollToBottom } = useStickToBottomContext()
  const lastReportedStateRef = React.useRef<ScrollMemoryState | null>(null)
  const suppressSaveRef = React.useRef(false)
  const restoredCycleRef = React.useRef<string | null>(null)
  const latestScrollMemoryRef = React.useRef<ScrollMemoryState | null | undefined>(scrollMemory)
  const captureFrameRef = React.useRef<number | null>(null)

  const reportScrollMemory = React.useCallback((container: HTMLElement): void => {
    if (suppressSaveRef.current) return

    const nextState = captureScrollMemory(container)
    if (lastReportedStateRef.current && isScrollMemoryStateEqual(lastReportedStateRef.current, nextState)) {
      return
    }

    lastReportedStateRef.current = nextState
    onScrollMemoryChange?.(nextState)
  }, [onScrollMemoryChange])

  const scheduleScrollMemoryReport = React.useCallback((container: HTMLElement): void => {
    if (captureFrameRef.current !== null) return

    captureFrameRef.current = requestAnimationFrame(() => {
      captureFrameRef.current = null
      reportScrollMemory(container)
    })
  }, [reportScrollMemory])

  React.useEffect(() => {
    latestScrollMemoryRef.current = scrollMemory
  }, [scrollMemory])

  const restoreCycleToken = React.useMemo(() => {
    if (!restoreKey) return null
    return [restoreKey, restoreVersion ?? ''].join(':')
  }, [restoreKey, restoreVersion])

  React.useEffect(() => {
    suppressSaveRef.current = restoreCycleToken !== null
    restoredCycleRef.current = null
  }, [restoreCycleToken])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScrollMemoryChange) return

    reportScrollMemory(el)
    const handleScroll = (): void => {
      scheduleScrollMemoryReport(el)
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (captureFrameRef.current !== null) {
        cancelAnimationFrame(captureFrameRef.current)
        captureFrameRef.current = null
      }
    }
  }, [scrollRef, onScrollMemoryChange, reportScrollMemory, scheduleScrollMemoryReport, restoreKey])

  React.useLayoutEffect(() => {
    if (!restoreCycleToken) {
      suppressSaveRef.current = false
      return
    }

    if (restoredCycleRef.current === restoreCycleToken) return

    const el = scrollRef.current
    if (!el) return

    const state = latestScrollMemoryRef.current
    let cancelled = false

    if (!state || state.atBottom) {
      stopScroll()

      requestAnimationFrame(() => {
        const completeRestore = (): void => {
          requestAnimationFrame(() => {
            if (cancelled) return

            restoredCycleRef.current = restoreCycleToken
            suppressSaveRef.current = false
            reportScrollMemory(el)
            onRestoreComplete?.()
          })
        }

        const result = scrollToBottom('instant')
        if (typeof result === 'boolean') {
          completeRestore()
          return
        }

        void result.then(() => {
          completeRestore()
        })
      })

      return () => {
        cancelled = true
      }
    }

    stopScroll()

    const hasMessageAnchors = (): boolean => {
      return el.querySelector('[data-message-id]') !== null
    }

    const completeRestore = (): void => {
      restoredCycleRef.current = restoreCycleToken
      suppressSaveRef.current = false
      reportScrollMemory(el)
      onRestoreComplete?.()
    }

    const restore = (): void => {
      if (cancelled || !hasMessageAnchors()) return

      const latestState = latestScrollMemoryRef.current
      if (!latestState) return

      el.scrollTop = resolveScrollMemory(el, latestState)

      requestAnimationFrame(() => {
        if (cancelled || !hasMessageAnchors()) return

        const finalState = latestScrollMemoryRef.current
        if (!finalState) return

        el.scrollTop = resolveScrollMemory(el, finalState)
        completeRestore()
      })
    }

    if (hasMessageAnchors()) {
      requestAnimationFrame(restore)
      return () => {
        cancelled = true
      }
    }

    const observer = new MutationObserver(() => {
      if (!hasMessageAnchors()) return
      observer.disconnect()
      requestAnimationFrame(restore)
    })

    observer.observe(el, { childList: true, subtree: true })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [restoreCycleToken, scrollRef, stopScroll, scrollToBottom, onScrollMemoryChange, onRestoreComplete])

  return null
}

export function Conversation({
  className,
  scrollMemory,
  onScrollMemoryChange,
  restoreKey,
  restoreVersion,
  onRestoreComplete,
  initial,
  children,
  ...props
}: ConversationProps): React.ReactElement {
  const initialBehavior = scrollMemory?.atBottom === false ? false : (initial ?? 'instant')

  return (
    <StickToBottom
      className={cn('relative flex-1 overflow-y-hidden scrollbar-none', className)}
      initial={initialBehavior}
      resize="smooth"
      role="log"
      {...props}
    >
      {(context) => (
        <>
          <ConversationScrollMemory
            scrollMemory={scrollMemory}
            onScrollMemoryChange={onScrollMemoryChange}
            restoreKey={restoreKey}
            restoreVersion={restoreVersion}
            onRestoreComplete={onRestoreComplete}
          />
          {typeof children === 'function' ? children(context) : children}
        </>
      )}
    </StickToBottom>
  )
}

// ===== ConversationContent 内容区域 =====

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>

export function ConversationContent({ className, ...props }: ConversationContentProps): React.ReactElement {
  return (
    <StickToBottom.Content
      className={cn('flex flex-col gap-1 p-4', className)}
      {...props}
    />
  )
}

// ===== ConversationEmptyState 空状态 =====

export interface ConversationEmptyStateProps extends ComponentProps<'div'> {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export function ConversationEmptyState({
  className,
  title = '暂无消息',
  description = '在下方输入框开始对话',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">{title}</h3>
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ===== ConversationScrollButton 滚动到底部 =====

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps): React.ReactElement | null {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  const handleScrollToBottom = React.useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <Button
      className={cn(
        'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
        className
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
