import { useAtomValue, useSetAtom } from 'jotai'
import {
  currentWorkspaceConvsAtom, activeConvAtom, convDropdownOpenAtom,
  tokenAtom, conversationsAtom, drawerOpenAtom, type ConvItem,
} from '../../atoms'
import { loadData } from '../../App'
import { createAgentConversation, saveActiveConv } from '../../utils/session'
import { formatRelativeTime } from '../../utils/format'

interface Props {
  onClose: () => void
}

export function ConvDropdown({ onClose }: Props) {
  const convs = useAtomValue(currentWorkspaceConvsAtom)
  const active = useAtomValue(activeConvAtom)
  const setActive = useSetAtom(activeConvAtom)
  const setOpen = useSetAtom(convDropdownOpenAtom)
  const token = useAtomValue(tokenAtom)
  const setConvs = useSetAtom(conversationsAtom)
  const setDrawerOpen = useSetAtom(drawerOpenAtom)

  const handleSwitch = (conv: ConvItem) => {
    setActive(conv)
    saveActiveConv(conv)
    setOpen(false)
    onClose()
  }

  const handleCreate = async () => {
    if (!token || !active) return
    try {
      const newConv = await createAgentConversation(token, active.workspaceId)
      setActive(newConv)
      saveActiveConv(newConv)
      setOpen(false)
      onClose()
      loadData(setConvs, () => {}, token)
    } catch { /* TODO: toast */ }
  }

  const handleViewAll = () => {
    setOpen(false)
    setDrawerOpen(true)
    onClose()
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-30 transition-opacity duration-200 opacity-100"
        onClick={() => { setOpen(false); onClose() }}
        style={{ top: 'var(--safe-t)', bottom: 'var(--safe-b)' }} />

      {/* 下拉面板 */}
      <div className="absolute left-0 right-0 z-40 top-full mt-0 mx-2 rounded-b-xl border border-border border-t-0 bg-[#141416] shadow-lg overflow-hidden animate-dropdown-in"
        style={{ maxHeight: '60vh' }}>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 48px)' }}>
          {convs.map(c => (
            <button key={c.id} onClick={() => handleSwitch(c)}
              className={`w-full text-left px-4 py-2.5 border-b border-border/30 hover:bg-accent/30 transition-colors flex items-center gap-2 ${active?.id === c.id ? 'bg-accent/20' : ''}`}>
              <span className="text-sm text-foreground truncate flex-1">{c.title || '新对话'}</span>
              {c.updatedAt ? (
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatRelativeTime(c.updatedAt)}
                </span>
              ) : null}
              {active?.id === c.id && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          {convs.length === 0 && (
            <p className="text-center text-muted-foreground text-xs py-4">暂无对话</p>
          )}
        </div>
        <div className="flex items-center border-t border-border px-3 py-2 gap-2">
          <button onClick={handleCreate}
            className="flex-1 text-xs text-center py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            + 新建对话
          </button>
          <button onClick={handleViewAll}
            className="flex-1 text-xs text-center py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-accent/20 transition-colors">
            查看全部
          </button>
        </div>
      </div>
    </>
  )
}
