// ===== 简易 Markdown 渲染（从 ChatView 提取）=====

export function renderMd(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-foreground/10 px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-semibold mt-3 mb-1 border-b border-border pb-1">$1</h1>')
    .replace(/^\- (.+)$/gm, '<li class="ml-4 text-sm">• $1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-primary/50 pl-3 my-1 text-muted-foreground italic">$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p class="my-1">')
    .replace(/\n/g, '<br/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      if (/^(https?:\/\/|mailto:)/i.test(url)) return `<a href="${url}" class="text-blue-400 underline" target="_blank" rel="noopener">${text}</a>`
      return `<span class="text-muted-foreground">${text}</span>`
    })
}
