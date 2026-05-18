import * as React from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Minus,
  Link as LinkIcon,
  Table as TableIcon,
  Unlink,
  Camera,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface MarkdownEditorToolbarProps {
  editor: Editor
}

const ROOT_STYLE_OVERRIDES = [
  'height:auto',
  'min-height:0',
  'max-height:none',
  'overflow:visible',
  'position:relative',
]

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source)
  const declarations: string[] = []
  for (const property of Array.from(computed)) {
    const value = computed.getPropertyValue(property)
    if (!value) continue
    const priority = computed.getPropertyPriority(property)
    declarations.push(`${property}:${value}${priority ? ' !important' : ''}`)
  }

  target.setAttribute('style', declarations.join(';'))
  target.removeAttribute('contenteditable')
  target.removeAttribute('spellcheck')
  target.removeAttribute('data-gramm')
  target.removeAttribute('data-gramm_editor')

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  for (let i = 0; i < sourceChildren.length; i += 1) {
    const sourceChild = sourceChildren[i]
    const targetChild = targetChildren[i]
    if (sourceChild && targetChild) {
      inlineComputedStyles(sourceChild, targetChild)
    }
  }
}

function buildScreenshotHtml(editor: Editor): { html: string; width: number } {
  const root = editor.view.dom
  const clone = root.cloneNode(true) as HTMLElement
  inlineComputedStyles(root, clone)

  const rect = root.getBoundingClientRect()
  const width = Math.max(480, Math.min(1200, Math.ceil(rect.width || 960)))
  clone.style.width = `${width}px`
  clone.style.height = 'auto'
  clone.style.minHeight = '0'
  clone.style.maxHeight = 'none'
  clone.style.overflow = 'visible'
  clone.style.position = 'relative'
  clone.style.boxSizing = 'border-box'
  clone.setAttribute('data-proma-screenshot-root', 'true')
  clone.setAttribute('style', `${clone.getAttribute('style') || ''};${ROOT_STYLE_OVERRIDES.join(';')}`)

  return { html: clone.outerHTML, width }
}

function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: React.ElementType
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault()
            onClick()
          }}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}{shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function TableGridPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = React.useState(false)
  const [hover, setHover] = React.useState({ row: 0, col: 0 })

  const insert = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-7 w-7">
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">插入表格</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className="w-auto p-2">
        <div className="mb-1.5 text-center text-xs text-muted-foreground">
          {hover.row > 0 ? `${hover.row} × ${hover.col}` : '选择大小'}
        </div>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {Array.from({ length: 36 }, (_, i) => {
            const r = Math.floor(i / 6) + 1
            const c = (i % 6) + 1
            const selected = r <= hover.row && c <= hover.col
            return (
              <div
                key={i}
                className={cn(
                  'h-4 w-4 cursor-pointer rounded-sm border',
                  selected ? 'border-primary bg-primary/20' : 'border-border bg-background hover:border-primary/50',
                )}
                onMouseEnter={() => setHover({ row: r, col: c })}
                onClick={() => insert(r, c)}
              />
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState('')

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const existingHref = editor.getAttributes('link').href
      setUrl(existingHref || '')
    }
    setOpen(isOpen)
  }

  const apply = () => {
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn('h-7 w-7', editor.isActive('link') && 'bg-accent text-accent-foreground')}
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">链接 <span className="text-muted-foreground">⌘K</span></TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className="w-72 p-2">
        <div className="flex gap-1.5">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
            placeholder="https://..."
            className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={apply}>
            确认
          </Button>
          {editor.isActive('link') && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 text-destructive"
              onClick={() => {
                editor.chain().focus().unsetLink().run()
                setOpen(false)
              }}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MarkdownEditorToolbar({ editor }: MarkdownEditorToolbarProps): React.ReactElement {
  const isMac = navigator.platform.includes('Mac')
  const mod = isMac ? '⌘' : 'Ctrl+'
  const [screenshotting, setScreenshotting] = React.useState(false)

  const handleScreenshot = React.useCallback(async (mode: 'clipboard' | 'file') => {
    if (screenshotting) return
    setScreenshotting(true)
    try {
      const { html, width } = buildScreenshotHtml(editor)
      const isDark = document.documentElement.classList.contains('dark')
      const result = await window.electronAPI.screenshotCapture({ html, isDark, width, mode })
      if (!result.success) {
        console.warn('[截图]', result.message)
      }
    } catch (err) {
      console.error('[截图] 失败:', err)
    } finally {
      setScreenshotting(false)
    }
  }, [editor, screenshotting])

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 border-b border-border/50 bg-background px-2 py-1">
      {/* 行内格式 */}
      <ToolbarButton icon={Bold} label="加粗" shortcut={`${mod}B`} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="斜体" shortcut={`${mod}I`} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={UnderlineIcon} label="下划线" shortcut={`${mod}U`} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="删除线" shortcut={`${mod}⇧X`} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton icon={Code} label="行内代码" shortcut={`${mod}E`} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* 标题 */}
      <ToolbarButton icon={Heading1} label="标题 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton icon={Heading2} label="标题 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton icon={Heading3} label="标题 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* 列表 */}
      <ToolbarButton icon={List} label="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={ListChecks} label="任务列表" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* 块元素 */}
      <ToolbarButton icon={Quote} label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton icon={CodeSquare} label="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <ToolbarButton icon={Minus} label="分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* 插入 */}
      <LinkPopover editor={editor} />
      <TableGridPicker editor={editor} />

      <div className="flex-1" />

      {/* 截图导出 */}
      <ToolbarButton
        icon={Copy}
        label="截图到剪贴板"
        disabled={screenshotting}
        onClick={() => void handleScreenshot('clipboard')}
      />
      <ToolbarButton
        icon={Camera}
        label="截图保存文件"
        disabled={screenshotting}
        onClick={() => void handleScreenshot('file')}
      />
    </div>
  )
}
