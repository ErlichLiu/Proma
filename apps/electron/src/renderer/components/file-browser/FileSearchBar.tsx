/**
 * FileSearchBar — 文件搜索栏
 *
 * 位于侧面板工作区文件和会话文件之间，输入关键词搜索所有文件。
 * 分别搜索会话目录和工作区文件目录，确保两边都使用相对路径。
 */

import * as React from 'react'
import { Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileTypeIcon } from './FileTypeIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { FileIndexEntry } from '@proma/shared'

interface FileSearchBarProps {
  workspaceFilesPath: string | null
  sessionPath: string | null
  sessionAttachedDirs: string[]
  workspaceAttachedDirs: string[]
  placeholder?: string
  onFilePreview?: (filePath: string) => void
}

export function FileSearchBar({
  workspaceFilesPath,
  sessionPath,
  sessionAttachedDirs,
  workspaceAttachedDirs,
  placeholder = '搜索文件...',
  onFilePreview,
}: FileSearchBarProps): React.ReactElement | null {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<FileIndexEntry[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [searching, setSearching] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>()
  const abortRef = React.useRef<AbortController>()

  const hasAnyRoot = !!workspaceFilesPath || !!sessionPath

  // 防抖搜索 — 分别搜索两个目录
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    const trimmed = query.trim()
    if (!trimmed || !hasAnyRoot) {
      setResults([])
      setIsOpen(false)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const allResults: FileIndexEntry[] = []

        // 分别搜索工作区文件和会话文件，确保两边都用相对路径
        const searches: Promise<FileIndexEntry[]>[] = []

        if (workspaceFilesPath) {
          searches.push(
            window.electronAPI.searchWorkspaceFiles(
              workspaceFilesPath,
              trimmed,
              30,
              workspaceAttachedDirs.length > 0 ? workspaceAttachedDirs : undefined,
            ).then((r) => r.entries.map((e) => ({ ...e, source: 'workspace' as const })))
            .catch(() => [] as FileIndexEntry[]),
          )
        }

        if (sessionPath) {
          searches.push(
            window.electronAPI.searchWorkspaceFiles(
              sessionPath,
              trimmed,
              30,
              sessionAttachedDirs.length > 0 ? sessionAttachedDirs : undefined,
            ).then((r) => r.entries.map((e) => ({ ...e, source: 'session' as const })))
            .catch(() => [] as FileIndexEntry[]),
          )
        }

        const results_ = await Promise.all(searches)
        for (const r of results_) allResults.push(...r)

        if (ac.signal.aborted) return

        setResults(allResults)
        setSelectedIndex(0)
        setIsOpen(allResults.length > 0)
      } catch (err) {
        console.error('[FileSearchBar] 搜索失败:', err)
        if (!ac.signal.aborted) {
          setResults([])
          setIsOpen(false)
        }
      } finally {
        if (!ac.signal.aborted) setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, workspaceFilesPath, sessionPath, sessionAttachedDirs, workspaceAttachedDirs, hasAnyRoot])

  // 点击外部关闭
  React.useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    // 忽略 IME 组合输入期间的按键（如中文输入法敲回车确认候选词）
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0))
      return
    }
    if (e.key === 'Enter' && isOpen && results.length > 0) {
      e.preventDefault()
      const entry = results[selectedIndex]
      if (entry && entry.type === 'file') {
        onFilePreview?.(entry.path)
        setIsOpen(false)
      }
    }
  }, [results, selectedIndex, isOpen, onFilePreview])

  const handleClick = React.useCallback((entry: FileIndexEntry) => {
    if (entry.type === 'file') {
      onFilePreview?.(entry.path)
    }
    setIsOpen(false)
  }, [onFilePreview])

  if (!hasAnyRoot) return null

  const sessionResults = results.filter((e) => e.source === 'session')
  const workspaceResults = results.filter((e) => e.source === 'workspace')

  return (
    <div ref={containerRef} className="relative mx-2 flex-shrink-0">
      {/* 搜索输入框 */}
      <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/40 border border-transparent focus-within:border-primary/40 focus-within:bg-muted/70 transition-colors">
        {searching ? (
          <Loader2 className="size-3 text-muted-foreground flex-shrink-0 animate-spin" />
        ) : (
          <Search className="size-3 text-muted-foreground flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          onKeyDown={handleKeyDown}
        />
        {query && !searching && (
          <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
            {results.length}
          </span>
        )}
      </div>

      {/* 结果浮层（绝对定位，不影响布局） */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
            {/* 会话文件分组 */}
            {sessionResults.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30">
                  <span>会话文件</span>
                  <span className="text-muted-foreground/40">{sessionResults.length}</span>
                </div>
                {sessionResults.map((entry) => {
                  const globalIdx = results.indexOf(entry)
                  return (
                    <ResultItem
                      key={entry.path}
                      entry={entry}
                      isSelected={globalIdx === selectedIndex}
                      onClick={handleClick}
                      onHover={() => setSelectedIndex(globalIdx)}
                    />
                  )
                })}
              </>
            )}

            {/* 工作区文件分组 */}
            {workspaceResults.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30">
                  <span>工作区文件</span>
                  <span className="text-muted-foreground/40">{workspaceResults.length}</span>
                </div>
                {workspaceResults.map((entry) => {
                  const globalIdx = results.indexOf(entry)
                  return (
                    <ResultItem
                      key={entry.path}
                      entry={entry}
                      isSelected={globalIdx === selectedIndex}
                      onClick={handleClick}
                      onHover={() => setSelectedIndex(globalIdx)}
                    />
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 单条搜索结果 */
function ResultItem({
  entry,
  isSelected,
  onClick,
  onHover,
}: {
  entry: FileIndexEntry
  isSelected: boolean
  onClick: (entry: FileIndexEntry) => void
  onHover: () => void
}): React.ReactElement {
  // 从完整路径中提取父目录（去掉文件名），避免路径里重复显示文件名
  const dirPath = entry.path === entry.name
    ? ''
    : entry.path.endsWith(`/${entry.name}`)
      ? entry.path.slice(0, -(entry.name.length + 1))
      : entry.path

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
            isSelected ? 'bg-accent' : 'hover:bg-accent/40',
          )}
          onClick={() => onClick(entry)}
          onMouseEnter={onHover}
        >
          <FileTypeIcon name={entry.name} isDirectory={entry.type === 'dir'} size={12} />
          <span className="text-[11px] font-medium truncate max-w-[90px]">
            {entry.name}
          </span>
          {dirPath && (
            <span
              className="text-[10px] text-muted-foreground/55 truncate flex-1 min-w-0"
            >
              {dirPath}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="z-[10000] max-w-xs break-all">
        <p>{entry.path}</p>
      </TooltipContent>
    </Tooltip>
  )
}
