import * as React from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { CellSelection, isInTable } from '@tiptap/pm/tables'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Link as LinkIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface MarkdownBubbleMenuProps {
  editor: Editor
}

function selectionInsideNode(editor: Editor, nodeName: string): boolean {
  const { $from, $to } = editor.state.selection
  const contains = (pos: typeof $from) => {
    for (let depth = pos.depth; depth > 0; depth -= 1) {
      if (pos.node(depth).type.name === nodeName) return true
    }
    return false
  }
  return contains($from) || contains($to)
}

function selectionTouchesTable(editor: Editor): boolean {
  const { selection } = editor.state
  return selection instanceof CellSelection || isInTable(editor.state) || selectionInsideNode(editor, 'table')
}

function BubbleButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
          onClick={(e) => {
            e.preventDefault()
            onClick()
          }}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  )
}

export function MarkdownBubbleMenu({ editor }: MarkdownBubbleMenuProps): React.ReactElement {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="markdownBubbleMenu"
      shouldShow={({ editor: ed, from, to }) => {
        if (from === to) return false
        if (selectionTouchesTable(ed)) return false
        if (selectionInsideNode(ed, 'codeBlock')) return false
        return true
      }}
    >
      <div className="flex items-center gap-0.5 rounded-lg border bg-popover px-1 py-0.5 shadow-md">
        <BubbleButton icon={Bold} label="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <BubbleButton icon={Italic} label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <BubbleButton icon={UnderlineIcon} label="下划线" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <BubbleButton icon={Strikethrough} label="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <BubbleButton icon={Code} label="行内代码" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
        <BubbleButton
          icon={LinkIcon}
          label="链接"
          active={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              const url = window.prompt('输入链接地址：')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }
          }}
        />
      </div>
    </BubbleMenu>
  )
}
