/**
 * scroll-memory — 运行期滚动位置快照与恢复
 *
 * 基于消息锚点（message id + offset）保存阅读位置，
 * 避免仅靠 scrollTop 在历史加载或新消息插入后出现位置失真。
 */

export interface ScrollMemoryState {
  scrollTop: number
  atBottom: boolean
  anchorMessageId?: string
  anchorOffset?: number
}

export const DEFAULT_SCROLL_MEMORY_STATE: ScrollMemoryState = {
  scrollTop: 0,
  atBottom: true,
}

/** 与 use-stick-to-bottom 内部 near-bottom 阈值保持一致 */
export const STICK_TO_BOTTOM_OFFSET_PX = 70

export function isScrollMemoryStateEqual(a: ScrollMemoryState, b: ScrollMemoryState): boolean {
  return a.scrollTop === b.scrollTop
    && a.atBottom === b.atBottom
    && a.anchorMessageId === b.anchorMessageId
    && a.anchorOffset === b.anchorOffset
}

export function clampScrollTop(container: HTMLElement, scrollTop: number): number {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  return Math.min(Math.max(0, scrollTop), maxScrollTop)
}

export function captureScrollMemory(container: HTMLElement): ScrollMemoryState {
  const scrollTop = clampScrollTop(container, container.scrollTop)
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const atBottom = maxScrollTop - scrollTop <= STICK_TO_BOTTOM_OFFSET_PX

  if (atBottom) {
    return {
      scrollTop,
      atBottom: true,
    }
  }

  const nodes = container.querySelectorAll<HTMLElement>('[data-message-id]')
  for (const node of nodes) {
    const top = node.offsetTop
    const bottom = top + node.offsetHeight
    if (bottom > scrollTop) {
      return {
        scrollTop,
        atBottom: false,
        anchorMessageId: node.dataset.messageId,
        anchorOffset: scrollTop - top,
      }
    }
  }

  return {
    scrollTop,
    atBottom: false,
  }
}

export function resolveScrollMemory(container: HTMLElement, state: ScrollMemoryState): number {
  if (state.atBottom) {
    return Math.max(0, container.scrollHeight - container.clientHeight)
  }

  if (state.anchorMessageId) {
    const anchor = container.querySelector<HTMLElement>(`[data-message-id="${state.anchorMessageId}"]`)
    if (anchor) {
      return clampScrollTop(container, anchor.offsetTop + (state.anchorOffset ?? 0))
    }
  }

  return clampScrollTop(container, state.scrollTop)
}
