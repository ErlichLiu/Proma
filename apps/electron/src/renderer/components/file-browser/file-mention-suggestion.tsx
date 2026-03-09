/**
 * FileMentionSuggestion — TipTap Mention Suggestion 配置
 *
 * 工厂函数，创建用于 @ 引用文件的 TipTap Suggestion 配置。
 * 输入 @ 后异步搜索工作区文件，弹出 FileMentionList 浮动列表。
 */

import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { FileMentionList } from './FileMentionList'
import type { FileMentionRef } from './FileMentionList'
import type { FileIndexEntry } from '@proma/shared'

/**
 * 创建文件 @ 引用的 Suggestion 配置
 *
 * @param workspacePathRef 当前工作区根路径引用
 * @param mentionActiveRef 是否正在 mention 模式（用于阻止 Enter 发送消息）
 * @param attachedDirsRef 附加目录路径列表引用（搜索时一并扫描）
 * @param attachedFilesRef 附加文件路径列表引用（搜索时一并扫描）
 */
export function createFileMentionSuggestion(
  workspacePathRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  attachedDirsRef?: React.RefObject<string[]>,
  attachedFilesRef?: React.RefObject<string[]>,
): Omit<SuggestionOptions<FileIndexEntry>, 'editor'> {
  return {
    char: '@',
    allowSpaces: true,

    // 异步搜索文件
    items: async ({ query }): Promise<FileIndexEntry[]> => {
      const wsPath = workspacePathRef.current
      if (!wsPath) return []

      try {
        const additionalPaths = [
          ...(attachedDirsRef?.current ?? []),
          ...(attachedFilesRef?.current ?? []),
        ]
        const result = await window.electronAPI.searchWorkspaceFiles(
          wsPath,
          query ?? '',
          8,
          additionalPaths.length > 0 ? additionalPaths : undefined,
        )
        return result.entries
      } catch {
        return []
      }
    },

    // 渲染下拉列表
    render: () => {
      let renderer: ReactRenderer<FileMentionRef> | null = null
      let popup: HTMLDivElement | null = null
      // 保存当前 props 用于选择时获取 range
      let currentProps: SuggestionProps<FileIndexEntry> | null = null

      const handleSelect = (item: FileIndexEntry) => {
        if (!currentProps) return
        const { editor, range } = currentProps
        // 使用明确的 range 替换查询文本为 mention 节点
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'mention',
              attrs: { id: item.path, label: item.name },
            },
            {
              type: 'text',
              text: ' ',
            },
          ])
          .run()
      }

      return {
        onStart(props) {
          mentionActiveRef.current = true
          currentProps = props
          renderer = new ReactRenderer(FileMentionList, {
            props: {
              items: props.items,
              selectedIndex: 0,
              onSelect: handleSelect,
            },
            editor: props.editor,
          })

          // 创建浮动容器（向上弹出）
          popup = document.createElement('div')
          popup.style.position = 'absolute'
          popup.style.zIndex = '9999'
          document.body.appendChild(popup)
          popup.appendChild(renderer.element)

          // 定位到光标上方
          const rect = props.clientRect?.()
          if (rect && popup) {
            popup.style.left = `${rect.left}px`
            requestAnimationFrame(() => {
              if (!popup) return
              const popupHeight = popup.offsetHeight
              popup.style.top = `${rect.top - popupHeight - 4}px`
            })
          }
        },

        onUpdate(props) {
          currentProps = props
          renderer?.updateProps({ items: props.items })

          // 重新定位
          const rect = props.clientRect?.()
          if (rect && popup) {
            popup.style.left = `${rect.left}px`
            requestAnimationFrame(() => {
              if (!popup) return
              const popupHeight = popup.offsetHeight
              popup.style.top = `${rect.top - popupHeight - 4}px`
            })
          }
        },

        onKeyDown(props) {
          return renderer?.ref?.onKeyDown({ event: props.event }) ?? false
        },

        onExit() {
          mentionActiveRef.current = false
          popup?.remove()
          popup = null
          renderer?.destroy()
          renderer = null
        },
      }
    },
  }
}
