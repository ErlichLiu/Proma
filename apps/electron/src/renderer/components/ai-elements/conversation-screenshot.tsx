/**
 * ConversationScreenshot — 对话截图选择面板
 *
 * 功能：
 * 1. 类似迷你地图的侧边面板，列出所有消息
 * 2. 支持全选、Shift 范围选、鼠标拖拽多选
 * 3. 使用 modern-screenshot 逐消息截取 DOM，Canvas 拼接为长图
 * 4. 保存到会话文件目录 + 复制到剪贴板
 *
 * 关键技术：
 * - 截图前将 :root CSS 变量注入到目标节点 inline style，确保克隆 DOM 主题色正确
 * - 展开折叠的用户消息（移除 max-h-[6.5em] + overflow-hidden）
 * - 过滤外部图片（Google 头像等）避免 CORS/超时
 *
 * 必须放在 StickToBottom（Conversation）内部使用，以访问 scrollRef。
 */

import * as React from 'react'
import { domToPng } from 'modern-screenshot'
import { toast } from 'sonner'
import { X, Check, Camera, Loader2 } from 'lucide-react'
import { useStickToBottomContext } from 'use-stick-to-bottom'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/chat/UserAvatar'
import { getModelLogo } from '@/lib/model-logo'
import { cn } from '@/lib/utils'
import type { MinimapItem } from './scroll-minimap'

interface ConversationScreenshotProps {
  items: MinimapItem[]
  open: boolean
  onClose: () => void
  /** Agent 会话的工作目录（完整路径），Chat 传 undefined */
  sessionPath?: string | null
  /** Chat 的 conversationId 或 Agent 的 sessionId */
  sessionId: string
  /** 区分会话类型，决定存储路径策略 */
  sessionType: 'chat' | 'agent'
}

export function ConversationScreenshot({
  items,
  open,
  onClose,
  sessionPath,
  sessionId,
  sessionType,
}: ConversationScreenshotProps): React.ReactElement | null {
  const { scrollRef } = useStickToBottomContext()
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = React.useState<number | null>(null)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isClosing, setIsClosing] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const dragStartIndex = React.useRef<number | null>(null)

  // 面板打开时默认全选
  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set(items.map((i) => i.id)))
      setLastClickedIndex(null)
      setIsClosing(false)
    }
  }, [open, items])

  const handleClose = React.useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 100)
  }, [onClose])

  // 全选/取消全选
  const handleToggleAll = React.useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)))
    }
  }, [selectedIds.size, items])

  // 点击单条消息（支持 Shift 范围选）
  const handleItemClick = React.useCallback(
    (index: number, e: React.MouseEvent) => {
      const item = items[index]
      if (!item) return
      const id = item.id

      if (e.shiftKey && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, index)
        const end = Math.max(lastClickedIndex, index)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (let i = start; i <= end; i++) {
            const it = items[i]
            if (it) next.add(it.id)
          }
          return next
        })
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
          return next
        })
      }
      setLastClickedIndex(index)
    },
    [items, lastClickedIndex],
  )

  // 鼠标拖拽多选
  const handleMouseDown = React.useCallback(
    (index: number, e: React.MouseEvent) => {
      if (e.shiftKey) return
      e.preventDefault()
      setIsDragging(true)
      dragStartIndex.current = index
    },
    [],
  )

  const handleMouseEnter = React.useCallback(
    (index: number) => {
      if (!isDragging || dragStartIndex.current === null) return
      const start = Math.min(dragStartIndex.current, index)
      const end = Math.max(dragStartIndex.current, index)
      const dragIds = new Set<string>()
      for (let i = start; i <= end; i++) {
        const it = items[i]
        if (it) dragIds.add(it.id)
      }
      setSelectedIds(dragIds)
    },
    [isDragging, items],
  )

  React.useEffect(() => {
    if (!isDragging) return
    const onUp = (): void => setIsDragging(false)
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [isDragging])

  // ── 生成截图 ──
  const handleGenerate = React.useCallback(async () => {
    const el = scrollRef.current
    if (!el || selectedIds.size === 0) return

    setIsGenerating(true)

    const dpr = window.devicePixelRatio || 1
    const savedScrollTop = el.scrollTop

    try {
      // 1. 收集选中消息的 DOM 节点（保持顺序）
      const selectedNodes: HTMLElement[] = []
      for (const { id } of items) {
        if (!selectedIds.has(id)) continue
        const node = el.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
        if (node) selectedNodes.push(node)
      }

      if (selectedNodes.length === 0) {
        toast.error('未找到可截图的消息')
        return
      }

      // 2. 收集 :root CSS 变量（用于注入到克隆 DOM）
      const cssVars = collectCssVars()

      // 3. 获取背景色
      const rootStyle = getComputedStyle(document.documentElement)
      const rawHsl = rootStyle.getPropertyValue('--content-area').trim()
        || rootStyle.getPropertyValue('--background').trim()
      const bgColor = rawHsl ? `hsl(${rawHsl})` : '#ffffff'

      // 4. 逐消息截取
      const captures: HTMLImageElement[] = []

      for (const node of selectedNodes) {
        // 4a. 展开折叠的用户消息
        const expandCleanup = expandCollapsedContent(node)

        try {
          // 4b. 滚动该消息到可见区域，确保 DOM 渲染完整
          node.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior })
          await waitFrames(3)

          // 4c. 使用 modern-screenshot 截取
          const dataUrl = await domToPng(node, {
            scale: dpr,
            backgroundColor: bgColor,
            // 过滤外部图片，避免 CORS/超时
            filter: (el: Node) => {
              if (el instanceof HTMLImageElement) {
                const src = el.src || ''
                // 跳过外部图片（Google 头像等）
                if (src.startsWith('http') && !src.startsWith(window.location.origin)) {
                  return false
                }
              }
              return true
            },
            // 克隆后注入 CSS 变量到根节点
            onCloneNode: (cloned: Node) => {
              if (cloned instanceof HTMLElement) {
                injectCssVars(cloned, cssVars)
              }
            },
            // 外部图片获取超时
            timeout: 5000,
            fetch: {
              placeholderImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            },
          })

          if (dataUrl) {
            const img = await loadImage(dataUrl)
            captures.push(img)
          }
        } catch (err) {
          console.warn('[ConversationScreenshot] 单消息截取失败，跳过:', err)
        } finally {
          // 4d. 恢复折叠状态
          expandCleanup()
        }
      }

      if (captures.length === 0) {
        toast.error('截图失败：未能捕获任何消息')
        return
      }

      // 5. Canvas 拼接
      const padding = Math.round(24 * dpr)
      const gap = Math.round(4 * dpr)
      const maxWidth = Math.max(...captures.map((img) => img.naturalWidth))
      const totalHeight = captures.reduce((sum, img) => sum + img.naturalHeight, 0)
        + gap * (captures.length - 1)
        + padding * 2
      const canvasWidth = maxWidth + padding * 2

      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvasWidth, totalHeight)

      let y = padding
      for (const img of captures) {
        const xOffset = Math.round((maxWidth - img.naturalWidth) / 2)
        ctx.drawImage(img, padding + xOffset, y)
        y += img.naturalHeight + gap
      }

      const finalDataUrl = canvas.toDataURL('image/png')

      // 6. 构建保存路径
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `conversation-screenshot-${timestamp}.png`
      const savePath = sessionType === 'agent' && sessionPath
        ? `${sessionPath}/${filename}`
        : `__attachments__/${sessionId}/${filename}`

      // 7. 保存 + 复制剪贴板
      const savedPath = await window.electronAPI.saveConversationScreenshot(finalDataUrl, savePath)
      toast.success('截图已保存并复制到剪贴板', {
        description: savedPath,
        duration: 4000,
      })

      handleClose()
    } catch (error) {
      console.error('[ConversationScreenshot] 生成截图失败:', error)
      toast.error('生成截图失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    } finally {
      // 恢复滚动位置
      el.scrollTop = savedScrollTop
      setIsGenerating(false)
    }
  }, [scrollRef, selectedIds, items, sessionType, sessionPath, sessionId, handleClose])

  if (!open) return null

  const allSelected = selectedIds.size === items.length && items.length > 0

  return (
    <div
      className={cn(
        'absolute right-10 top-0 bottom-0 z-40 flex items-start pointer-events-none',
      )}
    >
      <div
        className={cn(
          'mt-3 w-[300px] rounded-lg border bg-popover shadow-xl flex flex-col overflow-hidden pointer-events-auto',
          isClosing
            ? 'animate-out fade-out-0 zoom-out-95 duration-100 origin-top-right'
            : 'animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right',
        )}
        style={{ maxHeight: 'min(500px, 70vh)' }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-primary" />
            <span className="text-xs font-medium">对话截图</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 rounded-md"
              onClick={handleClose}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleToggleAll}
          >
            <div
              className={cn(
                'size-4 rounded border flex items-center justify-center transition-colors',
                allSelected
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground/30',
              )}
            >
              {allSelected && <Check className="size-3 text-primary-foreground" />}
            </div>
            {allSelected ? '取消全选' : '全选'}
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            已选 {selectedIds.size}/{items.length}
          </span>
        </div>

        {/* 消息列表 */}
        <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5 scrollbar-thin select-none">
          {items.map((item, index) => {
            const selected = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex items-start gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors',
                  selected
                    ? 'bg-primary/10 ring-1 ring-primary/20'
                    : 'hover:bg-accent',
                )}
                onClick={(e) => handleItemClick(index, e)}
                onMouseDown={(e) => handleMouseDown(index, e)}
                onMouseEnter={() => handleMouseEnter(index)}
              >
                {/* 选中指示 */}
                <div
                  className={cn(
                    'size-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    selected
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30',
                  )}
                >
                  {selected && <Check className="size-3 text-primary-foreground" />}
                </div>

                {/* 头像 */}
                <ItemIcon item={item} />

                {/* 预览文本 */}
                <span className="flex-1 min-w-0 text-xs text-popover-foreground/80 line-clamp-2">
                  {item.preview || '(空消息)'}
                </span>
              </button>
            )
          })}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleClose}
            disabled={isGenerating}
          >
            取消
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleGenerate}
            disabled={selectedIds.size === 0 || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Camera className="size-3.5" />
                生成截图
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── 辅助函数 ──

/** 等待 N 帧以让布局稳定 */
function waitFrames(n = 2): Promise<void> {
  return new Promise<void>((resolve) => {
    let count = 0
    const tick = (): void => {
      count++
      if (count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** 加载 data URL 为 HTMLImageElement */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      reject(new Error(`无效的 data URL: ${dataUrl?.slice(0, 50) ?? '(empty)'}`))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败，data URL 长度: ${dataUrl.length}`))
    img.src = dataUrl
  })
}

/**
 * 从当前页面的 styleSheets 收集所有 :root / .dark / .theme-* 中定义的 CSS 自定义属性
 * 返回 [property, value] 对数组
 */
function collectCssVars(): Array<[string, string]> {
  const vars: Array<[string, string]> = []

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) continue

        const selector = rule.selectorText
        // 匹配 :root、当前激活的主题类（.dark、.theme-forest-light 等）
        const isRoot = selector === ':root'
        let isActiveTheme = false
        if (!isRoot) {
          try {
            isActiveTheme = document.documentElement.matches(selector)
          } catch {
            // 无效选择器，跳过
          }
        }

        if (!isRoot && !isActiveTheme) continue

        for (const prop of rule.style) {
          if (prop.startsWith('--')) {
            vars.push([prop, rule.style.getPropertyValue(prop).trim()])
          }
        }
      }
    } catch {
      // 跨域样式表无法读取，跳过
    }
  }

  // 主题特定变量覆盖 :root，后面的覆盖前面的（数组顺序天然保证）
  return vars
}

/**
 * 将 CSS 变量注入到元素的 inline style 中
 * 确保克隆 DOM 脱离原始文档后仍能正确解析 hsl(var(--xxx))
 */
function injectCssVars(el: HTMLElement, vars: Array<[string, string]>): void {
  for (const [prop, value] of vars) {
    el.style.setProperty(prop, value)
  }
}

/**
 * 展开消息节点中折叠的用户内容
 *
 * 目标：移除 max-h-[6.5em] 类和 overflow-hidden，
 * 同时隐藏折叠渐变按钮。
 *
 * 返回清理函数，调用后恢复原始状态。
 */
function expandCollapsedContent(node: HTMLElement): () => void {
  const cleanups: Array<() => void> = []

  // 查找所有具有 max-h-[6.5em] 类的元素（用户消息折叠容器）
  // overflow-hidden 也在同一个元素上，一起移除
  const collapsedEls = node.querySelectorAll<HTMLElement>('.max-h-\\[6\\.5em\\]')
  for (const el of collapsedEls) {
    el.classList.remove('max-h-[6.5em]', 'overflow-hidden')
    cleanups.push(() => el.classList.add('max-h-[6.5em]', 'overflow-hidden'))
  }

  // 隐藏折叠按钮（展开/收起按钮 + 渐变遮罩）
  const collapseButtons = node.querySelectorAll<HTMLElement>('button')
  for (const btn of collapseButtons) {
    // 折叠按钮包含"展开全部"或"收起"文本，且有渐变背景
    if (btn.textContent?.includes('展开全部') || btn.textContent?.includes('收起')) {
      const prev = btn.style.display
      btn.style.display = 'none'
      cleanups.push(() => { btn.style.display = prev })
    }
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

// ── 辅助子组件 ──

function ItemIcon({ item }: { item: MinimapItem }): React.ReactElement {
  if (item.role === 'user' && item.avatar) {
    return <UserAvatar avatar={item.avatar} size={16} className="mt-0.5 shrink-0" />
  }
  if (item.role === 'assistant' && item.model) {
    return (
      <img
        src={getModelLogo(item.model)}
        alt=""
        className="size-4 shrink-0 mt-0.5 rounded-[20%] object-cover"
      />
    )
  }
  return <div className="size-4 shrink-0 mt-0.5 rounded-[20%] bg-muted" />
}
