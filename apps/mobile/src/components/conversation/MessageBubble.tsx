import { ToolUseBlock } from './ToolUseBlock'
import { renderMd } from '../../utils/markdown'
import type { Message, ContentBlock, ToolUseContent, ToolResultContent } from '../../atoms'

function getContent(m: Message): ContentBlock[] | string | undefined {
  if (m.message?.content) return m.message.content
  return m.content
}

function asBlocks(content: ContentBlock[] | string | undefined): ContentBlock[] {
  if (Array.isArray(content)) return content
  return []
}

function extractText(m: Message): string {
  const content = getContent(m)
  if (Array.isArray(content)) {
    return content
      .filter((c): c is typeof c & { text: string } => c.type === 'text' && 'text' in c)
      .map(c => c.text)
      .join('\n')
  }
  if (typeof content === 'string') return content
  return ''
}

function extractThinking(m: Message): string {
  const content = getContent(m)
  if (Array.isArray(content)) {
    return content
      .filter((c): c is typeof c & { thinking: string } => c.type === 'thinking' && 'thinking' in c)
      .map(c => c.thinking)
      .join('\n')
  }
  return m.reasoning ?? ''
}

function extractToolUse(m: Message): ToolUseContent[] {
  return asBlocks(getContent(m)).filter((c): c is ToolUseContent => c.type === 'tool_use')
}

function hasToolResult(m: Message): boolean {
  return asBlocks(getContent(m)).some((c): c is ToolResultContent => c.type === 'tool_result')
}

export function MessageBubble({ message: m, resultMap }: { message: Message; resultMap: Map<string, ToolResultContent> }) {
  const isUser = m.type === 'user' || m.role === 'user'
  const text = extractText(m)
  const reasoning = !isUser ? extractThinking(m) : ''

  if (isUser && hasToolResult(m) && !text) return null

  const toolUses = !isUser ? extractToolUse(m) : []

  if (!isUser && !text && !reasoning && toolUses.length > 0) {
    return (
      <div className="flex gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">AI</div>
        <div className="flex-1 min-w-0 space-y-1">
          {toolUses.map(tu => (
            <ToolUseBlock key={tu.id} toolUse={tu} result={resultMap.get(tu.id)} />
          ))}
        </div>
      </div>
    )
  }

  if (!isUser && !text && toolUses.length === 0 && reasoning) {
    return (
      <div className="flex gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-white">AI</div>
        <div className="flex-1 min-w-0">
          <div className="rounded-xl px-3 py-2 text-sm bg-muted text-foreground rounded-tl-sm">
            <details>
              <summary className="text-xs text-purple-400 cursor-pointer">🧠 思考过程</summary>
              <div className="mt-1 text-xs text-muted-foreground border-l-2 border-purple-500/30 pl-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderMd(reasoning) }} />
            </details>
          </div>
        </div>
      </div>
    )
  }

  if (!text && !reasoning && toolUses.length === 0) return null

  if (!isUser) {
    return (
      <div className="flex gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">AI</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-foreground/60">{m.model || 'AI 助手'}</span>
            {m.createdAt && <span className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {toolUses.map(tu => (
            <ToolUseBlock key={tu.id} toolUse={tu} result={resultMap.get(tu.id)} />
          ))}
          {reasoning && (
            <div className="rounded-xl px-3 py-2 text-sm bg-muted text-foreground rounded-tl-sm">
              <details>
                <summary className="text-xs text-purple-400 cursor-pointer">🧠 思考过程</summary>
                <div className="mt-1 text-xs text-muted-foreground border-l-2 border-purple-500/30 pl-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderMd(reasoning) }} />
              </details>
            </div>
          )}
          {text && (
            <div className="rounded-xl px-3 py-2 text-sm bg-muted text-foreground rounded-tl-sm">
              <div className="prose prose-sm prose-invert max-w-none break-words overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isUser && hasToolResult(m) && text) {
    return (
      <div className="flex gap-2 flex-row-reverse min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">我</div>
        <div className="flex flex-col items-end min-w-0" style={{ maxWidth: 'calc(100% - 36px)' }}>
          <div className="bg-primary/10 text-foreground rounded-xl rounded-tr-sm px-3 py-2 text-sm">
            <div className="prose prose-sm prose-invert max-w-none break-words" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 flex-row-reverse min-w-0">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">我</div>
      <div className="flex flex-col items-end min-w-0" style={{ maxWidth: 'calc(100% - 36px)' }}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-medium text-foreground/60">我</span>
          {m.createdAt && <span className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <div className="bg-primary/10 text-foreground rounded-xl rounded-tr-sm px-3 py-2 text-sm">
          <div className="prose prose-sm prose-invert max-w-none break-words" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
        </div>
      </div>
    </div>
  )
}

export function MessageList({ messages }: { messages: Message[] }) {
  const resultMap = new Map<string, ToolResultContent>()
  for (const m of messages) {
    const blocks = asBlocks(getContent(m))
    for (const block of blocks) {
      if (block.type === 'tool_result') {
        resultMap.set(block.tool_use_id, block as ToolResultContent)
      }
    }
  }

  return (
    <>
      {messages.map((m, i) => (
        <MessageBubble key={m.id || i} message={m} resultMap={resultMap} />
      ))}
    </>
  )
}
