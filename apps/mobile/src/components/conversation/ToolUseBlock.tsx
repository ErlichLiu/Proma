import type { ToolUseContent, ToolResultContent, TextBlock } from '../../atoms'

const TOOL_NAMES: Record<string, string> = {
  Read: '读取文件', Edit: '编辑文件', Write: '写入文件', Bash: '执行命令',
  Grep: '搜索内容', Glob: '搜索文件', WebSearch: '网络搜索', WebFetch: '获取网页',
  Agent: '调用子代理', TaskCreate: '创建任务', TaskUpdate: '更新任务',
  TaskGet: '获取任务', TaskList: '列出任务', NotebookEdit: '编辑笔记本',
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📄', Edit: '✏️', Write: '📝', Bash: '⌨️',
  Grep: '🔍', Glob: '📂', WebSearch: '🌐', WebFetch: '🔗',
  Agent: '🤖', TaskCreate: '📋', TaskUpdate: '✅',
}

function getToolSummary(name: string, input: Record<string, unknown>): string {
  const displayName = TOOL_NAMES[name] || name.replace(/^mcp__/, '').replace(/__/g, ' → ')
  if (name === 'Read' || name === 'Edit' || name === 'Write') {
    const path = String(input.file_path ?? '').split('/').pop() || ''
    return `${displayName} ${path}`
  }
  if (name === 'Bash') {
    const cmd = String(input.command ?? '').slice(0, 60)
    return `${displayName}: ${cmd}`
  }
  if (name === 'Grep') return `${displayName}: ${input.pattern ?? ''}`
  if (name === 'Glob') return `${displayName}: ${input.pattern ?? ''}`
  if (name === 'WebSearch') return `${displayName}: ${input.query ?? ''}`
  return displayName
}

export function getToolResultText(block: ToolResultContent): string {
  const content = block.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is TextBlock => c.type === 'text')
      .map(c => c.text || '')
      .join('\n')
  }
  return ''
}

export function ToolUseBlock({ toolUse, result }: { toolUse: ToolUseContent; result?: ToolResultContent }) {
  const name = toolUse.name
  const input = toolUse.input ?? {}
  const summary = getToolSummary(name, input)
  const resultText = result ? getToolResultText(result) : ''
  const hasError = result?.is_error === true
  const resultPreview = resultText.slice(0, 500)

  return (
    <details className="group rounded-lg bg-muted/60 border border-border/40 overflow-hidden">
      <summary className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer select-none hover:bg-muted/80 transition-colors">
        <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
        <span className="text-xs">{TOOL_ICONS[name] || '🔧'}</span>
        <span className="text-foreground/80 flex-1 truncate">{summary}</span>
        {result && (
          <span className={`text-[10px] ${hasError ? 'text-red-400' : 'text-green-400'}`}>
            {hasError ? '✗' : '✓'}
          </span>
        )}
      </summary>
      {resultPreview && (
        <div className="px-3 py-2 border-t border-border/30">
          {hasError ? (
            <pre className="text-[11px] text-red-400/90 whitespace-pre-wrap break-all font-mono">{resultPreview}</pre>
          ) : (
            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all font-mono">{resultPreview}</pre>
          )}
          {resultText.length > 500 && (
            <span className="text-[10px] text-muted-foreground/60">...共 {resultText.length} 字符</span>
          )}
        </div>
      )}
    </details>
  )
}
