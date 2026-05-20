import { useState, useRef, useCallback, KeyboardEvent, useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  activeConvAtom, tokenAtom, streamingAtom, streamContentAtom, messagesAtom,
  settingsModelIdAtom, settingsChannelBaseUrlAtom, settingsChannelIdAtom, channelsAtom,
  permissionModeAtom, PERMISSION_MODE_ORDER, PERMISSION_MODE_CONFIG, type PermissionMode,
} from '../../atoms'
import { wsReq } from '../../lib/ws-client'
import { formatModel, getProviderIcon } from '../../utils/format'

export function InputBar({ disabled }: { disabled?: boolean }) {
  const [text, setText] = useState('')
  const active = useAtomValue(activeConvAtom)
  const token = useAtomValue(tokenAtom)
  const [streaming, setStreaming] = useAtom(streamingAtom)
  const setStreamContent = useSetAtom(streamContentAtom)
  const setMessages = useSetAtom(messagesAtom)
  const [modelId, setModelId] = useAtom(settingsModelIdAtom)
  const [channelBaseUrl, setChannelBaseUrl] = useAtom(settingsChannelBaseUrlAtom)
  const [channelId, setChannelId] = useAtom(settingsChannelIdAtom)
  const [permMode, setPermMode] = useAtom(permissionModeAtom)
  const channels = useAtomValue(channelsAtom)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  const handleSend = useCallback(async () => {
    const msg = text.trim()
    if (!msg || !active || !token) return
    setText('')
    if (taRef.current) { taRef.current.style.height = 'auto' }

    setMessages(prev => [...prev, { id: 'local-' + Date.now(), role: 'user', content: msg, createdAt: Date.now() }])

    setStreaming(true)
    setStreamContent('')
    try {
      if (active.type === 'agent') {
        await wsReq('agent.send', {
          token,
          sessionId: active.id,
          userMessage: msg,
          modelId: modelId || undefined,
          permissionMode: permMode,
        }, 15000)
      } else {
        await wsReq('conversations.send', {
          token,
          conversationId: active.id,
          userMessage: msg,
          channelId: channelId || undefined,
          modelId: modelId || undefined,
        }, 15000)
      }
    } catch (e: any) {
      setStreaming(false)
    }
  }, [text, active, token, modelId, channelId, permMode])

  const handleStop = useCallback(async () => {
    if (!active || !token) return
    try {
      if (active.type === 'agent') {
        await wsReq('agent.stop', { token, sessionId: active.id })
      } else {
        await wsReq('conversations.stop', { token, conversationId: active.id })
      }
    } catch {}
    setStreaming(false)
  }, [active, token])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  useEffect(() => {
    if (taRef.current && text) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + 'px'
    }
  }, [text])

  const cyclePermMode = useCallback(() => {
    const idx = PERMISSION_MODE_ORDER.indexOf(permMode)
    setPermMode(PERMISSION_MODE_ORDER[(idx + 1) % PERMISSION_MODE_ORDER.length])
  }, [permMode, setPermMode])

  const handleSelectModel = useCallback((chId: string, mId: string, mName: string) => {
    setChannelId(chId)
    setModelId(mId)
    const ch = channels.find(c => c.id === chId)
    setChannelBaseUrl(ch?.baseUrl ?? null)
    setModelPickerOpen(false)
  }, [channels, setChannelId, setModelId, setChannelBaseUrl])

  const modelName = formatModel(modelId)
  const modelIcon = getProviderIcon(modelId, channelBaseUrl)
  const permConfig = PERMISSION_MODE_CONFIG[permMode]

  return (
    <div className="px-2.5 pb-2.5 flex-shrink-0 relative" style={{ paddingBottom: 'calc(var(--safe-b, 0px) + 10px)' }}>
      {/* 大圆角卡片容器 */}
      <div className="rounded-2xl border border-border bg-background/80 focus-within:border-foreground/20 transition-colors">
        {/* 文本输入 */}
        <textarea
          ref={taRef}
          value={text}
          onChange={e => { setText(e.target.value) }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={active?.type === 'agent' ? '发送消息给 Agent...' : '输入消息...'}
          rows={1}
          className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />

        {/* 底部工具栏 */}
        <div className="flex items-center justify-between px-2 py-1.5 gap-2">
          {/* 左侧工具 */}
          <div className="flex items-center gap-0.5 min-w-0 flex-1">
            {/* 模型选择器按钮 */}
            <button onClick={() => setModelPickerOpen(!modelPickerOpen)}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
              <span className="text-xs">{modelIcon}</span>
              <span className="truncate max-w-[72px]">{modelName || '选择模型'}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
            </button>

            {/* 权限模式切换 */}
            <button onClick={cyclePermMode}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
              title={`${permConfig.label}：${permConfig.description}`}>
              <ModeIcon mode={permMode} />
              <span>{permConfig.label}</span>
            </button>
          </div>

          {/* 右侧发送/停止 */}
          {streaming ? (
            <button onClick={handleStop}
              className="w-9 h-9 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!text.trim() || disabled}
              className="w-9 h-9 rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-20 transition-opacity flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* 模型选择弹窗 */}
      {modelPickerOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setModelPickerOpen(false)}
            style={{ top: 'var(--safe-t)', bottom: 'var(--safe-b)' }} />
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-2.5 z-40 rounded-2xl border border-border bg-[#141416] shadow-xl overflow-hidden animate-dropdown-in"
            style={{ maxHeight: '50vh' }}>
            <ModelPicker channelId={channelId} modelId={modelId} channels={channels} onSelect={handleSelectModel} />
          </div>
        </>
      )}
    </div>
  )
}

// ===== 模型选择面板 =====

function ModelPicker({ channelId, modelId, channels, onSelect }: {
  channelId: string | null; modelId: string | null
  channels: Array<{ id: string; name: string; provider: string; baseUrl: string; models: Array<{ id: string; name: string }> }>
  onSelect: (channelId: string, modelId: string, modelName: string) => void
}) {
  const [search, setSearch] = useState('')
  const query = search.toLowerCase()

  const filtered = channels
    .map(ch => ({
      ...ch,
      models: ch.models.filter(m => !query || m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)),
    }))
    .filter(ch => ch.models.length > 0)

  return (
    <div className="flex flex-col" style={{ maxHeight: '50vh' }}>
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground flex-shrink-0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索模型..." autoFocus
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50" />
      </div>

      {/* 模型列表 */}
      <div className="overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-6">未找到模型</p>
        ) : filtered.map(ch => (
          <div key={ch.id}>
            {/* 供应商标题 */}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b border-border/30">
              <span className="text-xs">{getProviderIcon(null, ch.baseUrl)}</span>
              <span className="text-xs font-medium text-muted-foreground truncate">{ch.name}</span>
            </div>
            {/* 模型列表 */}
            {ch.models.map(m => {
              const selected = ch.id === channelId && m.id === modelId
              return (
                <button key={m.id} onClick={() => onSelect(ch.id, m.id, m.name)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${selected ? 'bg-primary/10 text-primary border-l-3 border-l-primary' : 'text-foreground/80 hover:bg-accent/30'}`}>
                  <span className="text-xs">{getProviderIcon(m.id, ch.baseUrl)}</span>
                  <span className="truncate flex-1">{m.name}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary flex-shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== 权限模式图标 =====

function ModeIcon({ mode }: { mode: PermissionMode }) {
  if (mode === 'auto') {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
  }
  if (mode === 'bypassPermissions') {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  }
  // plan
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
}
