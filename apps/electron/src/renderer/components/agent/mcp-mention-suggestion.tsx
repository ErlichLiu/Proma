/**
 * McpMentionSuggestion — TipTap Mention Suggestion 配置（$ 触发）
 *
 * 输入 $ 后异步获取当前工作区的 MCP Server 列表，弹出 McpMentionList 浮动列表。
 */

import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { McpMentionList } from './McpMentionList'
import type { McpMentionRef, McpMentionItem } from './McpMentionList'

/**
 * 创建 MCP $ 引用的 Suggestion 配置
 *
 * @param workspaceSlugRef 当前工作区 slug 引用
 * @param mentionActiveRef 是否正在 mention 模式（用于阻止 Enter 发送消息）
 */
export function createMcpMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
): Omit<SuggestionOptions<McpMentionItem>, 'editor'> {
  return {
    char: '$',
    allowSpaces: false,

    items: async ({ query }): Promise<McpMentionItem[]> => {
      const slug = workspaceSlugRef.current
      if (!slug) return []

      try {
        const caps = await window.electronAPI.getWorkspaceCapabilities(slug)
        const q = (query ?? '').toLowerCase()
        return caps.mcpServers
          .filter((s) => !q || s.name.toLowerCase().includes(q))
          .map((s) => ({ id: s.name, name: s.name, type: s.type, enabled: s.enabled }))
      } catch {
        return []
      }
    },

    render: () => {
      let renderer: ReactRenderer<McpMentionRef> | null = null
      let popup: HTMLDivElement | null = null

      return {
        onStart(props) {
          mentionActiveRef.current = true
          renderer = new ReactRenderer(McpMentionList, {
            props: {
              items: props.items,
              selectedIndex: 0,
              onSelect: (item: McpMentionItem) => {
                props.command({ id: item.id, label: item.name })
              },
            },
            editor: props.editor,
          })

          popup = document.createElement('div')
          popup.style.position = 'absolute'
          popup.style.zIndex = '9999'
          document.body.appendChild(popup)
          popup.appendChild(renderer.element)

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
          renderer?.updateProps({ items: props.items })

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
