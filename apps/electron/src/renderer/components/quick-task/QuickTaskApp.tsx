/**
 * QuickTaskApp — 快速任务窗口根组件
 *
 * 当 URL 含 ?window=quick-task 时渲染此组件（替代主 App）。
 * 轻量级独立窗口：多行输入 + 附件粘贴 + 模式切换 + 默认模型展示。
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { fileToBase64 } from '@/lib/file-utils'
import type { AgentProfile } from '@proma/shared'

/** 任务模式 */
type TaskMode = 'chat' | 'agent'

/** 待上传附件（仅在快速任务窗口内使用） */
interface QuickAttachment {
  id: string
  filename: string
  mediaType: string
  base64: string
  size: number
  previewUrl?: string
}

/** 模型展示信息 */
interface ModelInfo {
  channelName: string
  modelId: string
}

export function QuickTaskApp(): React.ReactElement {
  const [mode, setMode] = useState<TaskMode>('agent')
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<QuickAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [agentFilterText, setAgentFilterText] = useState('')
  const [pickerPos, setPickerPos] = useState({ left: 0, top: 0 })
  const [pickerIndex, setPickerIndex] = useState(0)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // 设置透明背景
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  // 加载默认模型信息
  const loadModelInfo = useCallback(async (): Promise<void> => {
    try {
      const [settings, channels] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.listChannels(),
      ])

      if (mode === 'agent') {
        const channelId = settings.agentChannelId
        const modelId = settings.agentModelId
        if (channelId && modelId) {
          const channel = channels.find((c) => c.id === channelId)
          if (channel) {
            setModelInfo({ channelName: channel.name, modelId })
            return
          }
        }
      } else {
        // Chat 模式读取 localStorage 中的 selectedModel
        const raw = localStorage.getItem('proma-selected-model')
        if (raw) {
          try {
            const selected = JSON.parse(raw) as { channelId: string; modelId: string }
            const channel = channels.find((c) => c.id === selected.channelId)
            if (channel) {
              setModelInfo({ channelName: channel.name, modelId: selected.modelId })
              return
            }
          } catch { /* 忽略解析错误 */ }
        }
      }
      setModelInfo(null)
    } catch {
      setModelInfo(null)
    }
  }, [mode])

  useEffect(() => {
    loadModelInfo()
  }, [loadModelInfo])

  // Agent 模式下加载 Profile 列表
  useEffect(() => {
    if (mode === 'agent') {
      window.electronAPI.listAgentProfiles().then(setAgentProfiles).catch(console.error)
    }
  }, [mode])

  // 聚焦输入框
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [])

  // 监听主进程的聚焦通知（窗口每次显示时）
  useEffect(() => {
    const cleanup = window.electronAPI.onQuickTaskFocus(() => {
      setText('')
      setAttachments([])
      setSelectedAgent(null)
      setShowAgentPicker(false)
      setAgentFilterText('')
      setPickerIndex(0)
      focusInput()
      loadModelInfo()
      // 每次聚焦时重新加载 Agent Profile 列表（设置页可能已新增/修改）
      window.electronAPI.listAgentProfiles().then(setAgentProfiles).catch(console.error)
    })
    return cleanup
  }, [focusInput, loadModelInfo])

  // 初始聚焦
  useEffect(() => {
    focusInput()
  }, [focusInput])

  // 自动调整 textarea 高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  // 计算 @ 字符在 textarea 中的像素坐标（用 mirror div 技术）
  const measureCaretPosition = useCallback((textUpToCaret: string) => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return { left: 0, top: 0 }

    const style = getComputedStyle(textarea)
    // 同步 mirror 样式
    mirror.style.font = style.font
    mirror.style.fontSize = style.fontSize
    mirror.style.letterSpacing = style.letterSpacing
    mirror.style.lineHeight = style.lineHeight
    mirror.style.padding = style.padding
    mirror.style.width = `${textarea.clientWidth}px`
    mirror.style.wordWrap = style.wordWrap
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = style.overflowWrap

    // 在 mirror 中放入 @ 前的文本 + 一个 marker span
    mirror.textContent = ''
    const textNode = document.createTextNode(textUpToCaret)
    const marker = document.createElement('span')
    marker.textContent = '@'
    mirror.appendChild(textNode)
    mirror.appendChild(marker)

    const markerRect = marker.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()

    return {
      left: markerRect.left - mirrorRect.left,
      top: markerRect.top - mirrorRect.top + markerRect.height + 4,
    }
  }, [])

  // 过滤后的 agent 列表
  const filteredAgents = agentProfiles.filter((a) =>
    !agentFilterText ||
    a.name.toLowerCase().includes(agentFilterText.toLowerCase()) ||
    a.description?.toLowerCase().includes(agentFilterText.toLowerCase())
  )

  // 全局键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showAgentPicker) {
          e.preventDefault()
          setShowAgentPicker(false)
          return
        }
        e.preventDefault()
        window.electronAPI.hideQuickTask()
        return
      }

      const isMac = navigator.userAgent.includes('Mac')
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key === '1') {
        e.preventDefault()
        setMode('chat')
        return
      }
      if (mod && e.key === '2') {
        e.preventDefault()
        setMode('agent')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAgentPicker])

  // 添加文件为附件
  const addFiles = useCallback(async (files: File[]) => {
    const newAttachments: QuickAttachment[] = []
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file)
        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined
        newAttachments.push({
          id: crypto.randomUUID(),
          filename: file.name,
          mediaType: file.type || 'application/octet-stream',
          base64,
          size: file.size,
          previewUrl,
        })
      } catch (err) {
        console.error('[快速任务] 读取文件失败:', err)
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }, [])

  // 移除附件
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  // 粘贴事件
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }, [addFiles])

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFiles(files)
  }, [addFiles])

  // 文件选择
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) addFiles(files)
    e.target.value = '' // 允许重复选择同一文件
  }, [addFiles])

  // 选择 Agent
  const selectAgent = useCallback((agent: AgentProfile) => {
    setSelectedAgent(agent)
    setShowAgentPicker(false)
    setPickerIndex(0)
    // 清除 @xxx 文本
    const atIndex = text.lastIndexOf('@')
    setText(atIndex !== -1 ? text.slice(0, atIndex) : '')
    textareaRef.current?.focus()
  }, [text])

  // 提交任务
  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || isSubmitting) return

    setIsSubmitting(true)
    try {
      await window.electronAPI.submitQuickTask({
        text: trimmed,
        mode,
        files: attachments.map(({ filename, mediaType, base64, size }) => ({
          filename, mediaType, base64, size,
        })),
        agentProfileId: selectedAgent?.id,
      })
      setText('')
      setAttachments([])
    } catch (err) {
      console.error('[快速任务] 提交失败:', err)
    } finally {
      setIsSubmitting(false)
    }
  }, [text, mode, attachments, isSubmitting, selectedAgent])

  // 键盘事件：Enter 提交 / Shift+Enter 换行 / 弹窗导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAgentPicker) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPickerIndex((i) => Math.min(i + 1, filteredAgents.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPickerIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (filteredAgents[pickerIndex]) {
          selectAgent(filteredAgents[pickerIndex])
        }
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (filteredAgents[pickerIndex]) {
          selectAgent(filteredAgents[pickerIndex])
        }
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit, showAgentPicker, filteredAgents, pickerIndex, selectAgent])

  // 滚动 picker 使高亮项可见
  useEffect(() => {
    if (!showAgentPicker || !pickerRef.current) return
    const items = pickerRef.current.querySelectorAll('[data-picker-item]')
    items[pickerIndex]?.scrollIntoView({ block: 'nearest' })
  }, [pickerIndex, showAgentPicker])

  const hasContent = text.trim().length > 0 || attachments.length > 0

  return (
    <div
      className="flex h-screen w-screen items-start justify-center p-3 bg-transparent"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`quick-task-container flex w-full flex-col rounded-2xl bg-background transition-colors ${isDragOver ? 'ring-2 ring-primary/50' : ''}`}>
        {/* 顶栏：模式切换 + 模型信息 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            {/* 模式切换器 */}
            <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  mode === 'chat'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMode('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  mode === 'agent'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMode('agent')}
              >
                Agent
              </button>
            </div>

            {/* 模型信息 */}
            {modelInfo && (
              <span className="text-[11px] text-muted-foreground/70 truncate max-w-[280px]">
                {modelInfo.channelName} / {modelInfo.modelId}
              </span>
            )}
          </div>

          {/* 快捷键提示 */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
            <span>⌘1 Chat</span>
            <span>⌘2 Agent</span>
            <span>Esc 关闭</span>
          </div>
        </div>

        {/* 输入区域 — 内联 mention + textarea */}
        <div className="relative flex-1 px-4 py-2">
          <div className="flex items-start gap-0 flex-wrap">
            {/* 内联 Agent mention 标签 */}
            {selectedAgent && mode === 'agent' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 pl-1.5 pr-1 py-0.5 text-xs text-primary mr-1.5 mt-[3px] shrink-0 group/mention cursor-default"
              >
                <span className="text-sm leading-none">{selectedAgent.icon || '🤖'}</span>
                <span className="font-medium">{selectedAgent.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedAgent(null)}
                  className="ml-0.5 size-3.5 rounded-full flex items-center justify-center text-primary/40 hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </span>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                const newText = e.target.value
                setText(newText)
                // Agent 模式下检测 @ 触发
                if (mode === 'agent' && !selectedAgent) {
                  const lastChar = newText.slice(-1)
                  if (lastChar === '@') {
                    setShowAgentPicker(true)
                    setAgentFilterText('')
                    setPickerIndex(0)
                    // 用 mirror div 测量 @ 字符的位置
                    requestAnimationFrame(() => {
                      const atIdx = newText.lastIndexOf('@')
                      const pos = measureCaretPosition(newText.slice(0, atIdx))
                      setPickerPos(pos)
                    })
                  } else if (showAgentPicker) {
                    const atIndex = newText.lastIndexOf('@')
                    if (atIndex !== -1) {
                      setAgentFilterText(newText.slice(atIndex + 1))
                      setPickerIndex(0)
                    } else {
                      setShowAgentPicker(false)
                    }
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                mode === 'agent'
                  ? (selectedAgent
                      ? `向 ${selectedAgent.name} 描述任务，Enter 发送...`
                      : '输入 @ 选择 Agent，或直接描述任务...')
                  : '向 Proma 发送消息，Enter 发送...'
              }
              className="flex-1 min-w-0 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 leading-relaxed"
              style={{ minHeight: '60px', maxHeight: '160px' }}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Mirror div（不可见），用于精确计算 @ 字符位置 */}
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className="invisible absolute overflow-hidden whitespace-pre-wrap break-words"
            style={{ top: 0, left: 0, pointerEvents: 'none' }}
          />

          {/* Agent 选择弹窗 — 紧跟 @ 字符 */}
          {showAgentPicker && mode === 'agent' && (
            <div
              ref={pickerRef}
              className="absolute w-52 max-h-44 overflow-hidden rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl shadow-black/10 z-50"
              style={{
                left: `${Math.min(Math.max(pickerPos.left, 0), (textareaRef.current?.clientWidth ?? 500) - 208)}px`,
                top: `${pickerPos.top + 8}px`,
              }}
            >
              {/* 搜索提示 */}
              {agentFilterText && (
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] text-muted-foreground/50">搜索: {agentFilterText}</span>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto">
                {filteredAgents.map((agent, idx) => (
                  <button
                    key={agent.id}
                    type="button"
                    data-picker-item
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      idx === pickerIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50'
                    }`}
                    onClick={() => selectAgent(agent)}
                    onMouseEnter={() => setPickerIndex(idx)}
                  >
                    <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-sm shrink-0">
                      {agent.icon || '🤖'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{agent.name}</div>
                      {agent.description && (
                        <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{agent.description}</div>
                      )}
                    </div>
                    {agent.isBuiltin && (
                      <span className="text-[9px] text-muted-foreground/50 bg-muted rounded px-1 py-0.5 shrink-0">内置</span>
                    )}
                  </button>
                ))}
                {filteredAgents.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground/60">
                    {agentProfiles.length === 0
                      ? '暂无 Agent，在设置中创建'
                      : '无匹配结果'
                    }
                  </div>
                )}
              </div>
              {/* 底部操作提示 */}
              {filteredAgents.length > 0 && (
                <div className="border-t border-border/40 px-3 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/40">
                  <span>↑↓ 选择</span>
                  <span>↵ 确认</span>
                  <span>esc 取消</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 附件预览区 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.id}
                filename={att.filename}
                mediaType={att.mediaType}
                previewUrl={att.previewUrl}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
          </div>
        )}

        {/* 底栏：附件按钮 + 发送 */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="flex items-center gap-1">
            {/* 附件按钮 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              title="添加附件"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              附件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* 拖拽/粘贴提示 */}
            <span className="text-[10px] text-muted-foreground/30 ml-1">
              支持粘贴或拖拽文件
            </span>
          </div>

          {/* 发送按钮 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasContent || isSubmitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            )}
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 附件小标签 =====

interface AttachmentChipProps {
  filename: string
  mediaType: string
  previewUrl?: string
  onRemove: () => void
}

function AttachmentChip({ filename, mediaType, previewUrl, onRemove }: AttachmentChipProps): React.ReactElement {
  const isImage = mediaType.startsWith('image/')
  const displayName = filename.length > 20 ? filename.slice(0, 17) + '...' : filename

  if (isImage && previewUrl) {
    return (
      <div className="group/chip relative size-14 shrink-0 rounded-lg overflow-hidden">
        <img src={previewUrl} alt={filename} className="size-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="group/chip relative flex items-center gap-1.5 shrink-0 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
      <span className="max-w-[120px] truncate">{displayName}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 size-3.5 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover/chip:opacity-100 transition-all"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  )
}
