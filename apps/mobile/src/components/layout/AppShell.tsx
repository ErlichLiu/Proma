import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  viewAtom, drawerOpenAtom, activeConvAtom, convDropdownOpenAtom,
  tokenAtom, conversationsAtom, workspacesAtom, currentWorkspaceIdAtom,
  settingsModelIdAtom, settingsChannelBaseUrlAtom, settingsChannelIdAtom, channelsAtom,
  type ChannelInfo,
} from '../../atoms'
import { Drawer } from './Drawer'
import { ChatView } from '../conversation/ChatView'
import { ConvDropdown } from '../conversation/ConvDropdown'
import { useEffect, useCallback } from 'react'
import { wsReq } from '../../lib/ws-client'
import { loadData } from '../../App'

interface SettingsResponse { agentModelId?: string; channelBaseUrl?: string; agentChannelId?: string }
interface ChannelsResponse { channels: ChannelInfo[] }

export function AppShell() {
  const [view] = useAtom(viewAtom)
  const [drawerOpen, setDrawerOpen] = useAtom(drawerOpenAtom)
  const [active] = useAtom(activeConvAtom)
  const [dropdownOpen, setDropdownOpen] = useAtom(convDropdownOpenAtom)
  const token = useAtomValue(tokenAtom)
  const setConvs = useSetAtom(conversationsAtom)
  const setWorkspaces = useSetAtom(workspacesAtom)
  const setCurrentWsId = useSetAtom(currentWorkspaceIdAtom)
  const [modelId, setModelId] = useAtom(settingsModelIdAtom)
  const [channelBaseUrl, setChannelBaseUrl] = useAtom(settingsChannelBaseUrlAtom)
  const setChannelId = useSetAtom(settingsChannelIdAtom)
  const setChannels = useSetAtom(channelsAtom)

  useEffect(() => {
    if (!token || view !== 'chat') return
    wsReq('settings.get', { token }).then(d => {
      const s = d as SettingsResponse
      setModelId(s.agentModelId || null)
      setChannelBaseUrl(s.channelBaseUrl || null)
      setChannelId(s.agentChannelId || null)
    }).catch(() => {})
    wsReq('settings.channels', { token }).then(d => {
      setChannels((d as ChannelsResponse).channels ?? [])
    }).catch(() => {})
  }, [token, view])

  const isInChat = view === 'chat' && active

  const refreshData = useCallback(() => {
    if (token) loadData(setConvs, setWorkspaces, token, setCurrentWsId)
  }, [token, setConvs, setWorkspaces, setCurrentWsId])

  const handleOpenDrawer = () => {
    setDrawerOpen(true)
    refreshData()
  }

  const handleToggleDropdown = () => {
    const next = !dropdownOpen
    setDropdownOpen(next)
    if (next) refreshData()
  }

  return (
    <div className="flex flex-col h-full bg-background" style={{ paddingTop: 'var(--safe-t)', paddingBottom: 'var(--safe-b)' }}>
      {/* 全局顶部栏 */}
      <header className="relative flex items-center gap-2 px-3 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        {/* 汉堡菜单 — 始终可见 */}
        <button onClick={handleOpenDrawer}
          className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {isInChat ? (
          <>
            {/* 可点击标题 → 下拉切换同工作区对话 */}
            <button onClick={handleToggleDropdown}
              className="flex items-center justify-center gap-1 flex-1 min-w-0">
              <span className="text-base font-semibold text-foreground truncate">{active.title}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-muted-foreground flex-shrink-0 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {dropdownOpen && <ConvDropdown onClose={() => setDropdownOpen(false)} />}
          </>
        ) : (
          <h1 className="text-base font-semibold text-foreground truncate mx-2 flex-1 text-center">Proma</h1>
        )}
      </header>

      {/* 侧边栏遮罩 + 抽屉 */}
      <div
        className={`fixed inset-0 z-40 flex transition-opacity duration-300 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ top: 'var(--safe-t)', bottom: 'var(--safe-b)' }}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
        <div className={`transition-transform duration-300 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Drawer onClose={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* 主内容 */}
      <main className="flex-1 overflow-hidden min-w-0">
        {view === 'chat' && <ChatView />}
      </main>
    </div>
  )
}
