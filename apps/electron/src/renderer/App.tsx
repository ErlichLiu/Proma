/**
 * App.tsx — 向导 Agent 主界面（Fork Proma W1 减法版）
 *
 * 原文件含：AppShell + Onboarding + Settings + Tutorial + EnvironmentCheck +
 * Migration + Jotai 状态管理 + 多模式路由。全部剥离。
 *
 * 替换为向导三栏布局：[左对话] | [右沙箱预览] | [底时间轴]
 * 直接使用 Proma 的 Radix UI 组件库和 CSS 变量主题，状态用 React useState。
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ===== 类型 =====

interface Message {
  id: string
  role: 'system' | 'user'
  text: string
  options?: { label: string; value: string }[]
}

// ===== 对话预设 =====

const INITIAL_MESSAGES: Message[] = [
  { id: '1', role: 'system', text: '你好！你想做什么？告诉我你的想法，我帮你实现。' },
  { id: '2', role: 'user', text: '帮我做一个日常记账应用' },
  {
    id: '3', role: 'system', text: '明白了。主要记录什么类型的开销？',
    options: [
      { label: '🍜 日常开销', value: 'daily' },
      { label: '💼 生意账目', value: 'business' },
      { label: '✨ 你帮我决定', value: 'auto' },
    ],
  },
  { id: '4', role: 'user', text: '日常开销' },
  { id: '5', role: 'system', text: '好的，让我先生成一个草图给你看看方向对不对……右边已经可以看到预览了。试试点击右侧预览中的任意元素，告诉我哪里不满意。' },
]

// ===== Mock HTML（记账应用草图 — 分类用快捷标签点选） =====

const MOCK_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#0f0f11;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.card{background:#1a1a1e;border-radius:20px;padding:28px 24px;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 8px 32px rgba(0,0,0,.4);max-width:400px;width:100%}
h1{font-size:20px;color:#e8e8ed;margin-bottom:20px;text-align:center;font-weight:700}
.amount-row{display:flex;gap:10px;margin-bottom:14px}
.amount-input{flex:1;background:#25252b;border:1px solid #2e2e36;border-radius:12px;padding:12px 14px;font-size:18px;color:#e8e8ed;outline:none;font-weight:600;transition:border-color .2s}
.amount-input:focus{border-color:#a78bfa}
.amount-input::placeholder{color:#5a5a66;font-weight:400}
.tag-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.tag{padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;font-weight:500;user-select:none;transition:all .15s;background:#25252b;color:#9d9dab;border:1px solid transparent}
.tag:hover{background:#2e2e38;color:#c8c8d4}
.tag.active{background:rgba(139,92,246,.15);color:#a78bfa;border-color:rgba(139,92,246,.35)}
.save-btn{width:100%;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}
.save-btn:hover{background:#7c3aed}
.record-list{margin-top:18px;list-style:none;display:flex;flex-direction:column;gap:8px}
.record-list li{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#25252b;border-radius:12px;font-size:14px;color:#d4d4dc}
.record-list .amount{font-weight:700;color:#a78bfa;font-size:15px}
.record-list .cat{font-size:11px;color:#7a7a8a;background:rgba(139,92,246,.08);padding:3px 10px;border-radius:8px}
.record-list .name{flex:1;margin-left:10px;color:#c4c4ce}
.wizard-highlight{outline:2px solid #f87171!important;outline-offset:4px;border-radius:8px;animation:pulse .7s infinite alternate}
@keyframes pulse{from{outline-color:#f87171}to{outline-color:#fca5a5}}
</style></head><body>
<div class="card"><h1>💰 记账应用</h1>
<div class="amount-row"><input class="amount-input" placeholder="输入金额" id="amount" autocomplete="off"></div>
<div class="tag-row" id="tagRow">
<span class="tag active" data-cat="餐饮">🍜 餐饮</span>
<span class="tag" data-cat="交通">🚇 交通</span>
<span class="tag" data-cat="购物">🛍 购物</span>
<span class="tag" data-cat="娱乐">🎮 娱乐</span>
<span class="tag" data-cat="其他">📦 其他</span>
</div>
<button class="save-btn" id="saveBtn">记一笔</button>
<ul class="record-list" id="recordList">
<li><span class="name">🍜 午餐</span><span class="cat">餐饮</span><span class="amount">¥30</span></li>
<li><span class="name">🚇 地铁</span><span class="cat">交通</span><span class="amount">¥15</span></li>
<li><span class="name">☕ 咖啡</span><span class="cat">餐饮</span><span class="amount">¥22</span></li>
</ul></div>
<script>
var selCat='餐饮'
document.getElementById('tagRow').addEventListener('click',function(e){var t=e.target.closest('.tag');if(!t)return;document.querySelectorAll('.tag').forEach(function(el){el.classList.remove('active')});t.classList.add('active');selCat=t.dataset.cat})
document.getElementById('saveBtn').addEventListener('click',function(){var a=document.getElementById('amount').value.trim();if(!a||isNaN(a)){alert('请输入有效金额');return}var li=document.createElement('li');var icons={餐饮:'🍜',交通:'🚇',购物:'🛍',娱乐:'🎮',其他:'📦'};li.innerHTML='<span class="name">'+(icons[selCat]||'📝')+' '+selCat+'</span><span class="cat">'+selCat+'</span><span class="amount">¥'+a+'</span>';document.getElementById('recordList').appendChild(li);document.getElementById('amount').value=''})
var hl=null;document.addEventListener('click',function(e){if(e.target.tagName==='INPUT'&&document.activeElement===e.target)return;e.stopPropagation();e.preventDefault();if(hl)hl.classList.remove('wizard-highlight');var t=e.target.closest('.tag')||e.target.closest('.save-btn')||e.target.closest('li')||e.target.closest('.amount-input')||e.target;t.classList.add('wizard-highlight');hl=t;window.parent.postMessage({type:'element-clicked',data:{tag:t.tagName,textContent:(t.textContent||'').trim().substring(0,50)}},'*')},true)
window.addEventListener('message',function(e){if(e.data==='clear-highlight'&&hl){hl.classList.remove('wizard-highlight');hl=null}})
</script></body></html>`

// ===== 时间轴 =====

const TIMELINE_NODES = [
  { label: '📐 验证草图 v1', active: true },
  { label: '🚀 MVP v1', active: false },
  { label: '📍 当前版本', active: false },
]

// ===== App 主组件 =====

export default function App(): React.ReactElement {
  const [messages, setMessages] = React.useState<Message[]>(INITIAL_MESSAGES)
  const [inputValue, setInputValue] = React.useState('')
  const [correction, setCorrection] = React.useState<{ tag: string; textContent: string } | null>(null)
  const chatEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // PRD 接口 6：监听 iframe postMessage 元素点击
  React.useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'element-clicked') setCorrection(e.data.data)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const send = (): void => {
    const text = inputValue.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text }])
    setInputValue('')
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'system', text: '收到，正在根据你的反馈修改……改好了，你看看右边效果？' },
      ])
    }, 800)
  }

  // PRD 接口 7：纠错反馈
  const closeCorrection = (feedback: string | null): void => {
    setCorrection(null)
    document.querySelector('iframe')?.contentWindow?.postMessage('clear-highlight', '*')
    if (feedback) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', text: `🔧 纠错: ${feedback}` },
      ])
    }
  }

  return (
    <div className="h-screen flex flex-col shell-bg">
      {/* ===== 顶栏 ===== */}
      <header className="flex items-center gap-3 px-5 py-3 shrink-0">
        <span className="font-bold text-sm text-foreground">💰 记账应用</span>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
          快消型
        </span>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">向导 Agent 多智能体协同开发平台</span>
      </header>

      {/* ===== 主体：左对话 + 右预览 ===== */}
      <div className="flex-1 flex min-h-0 px-2 pb-2 gap-2">
        {/* ---- 左：对话区 ---- */}
        <div className="flex-1 min-w-0 bg-card rounded-2xl shadow-minimal flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-muted-foreground shrink-0">
            💬 对话
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md border border-border'
                  )}
                >
                  {msg.role === 'system' && (
                    <div className="text-[11px] text-primary mb-1 font-semibold">🤖 向导 Agent</div>
                  )}
                  <div>{msg.text}</div>
                  {msg.options && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {msg.options.map((opt) => (
                        <Button
                          key={opt.value}
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() =>
                            setMessages((prev) => [
                              ...prev,
                              { id: Date.now().toString(), role: 'user', text: opt.label },
                            ])
                          }
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2.5">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="输入你的需求..."
              className="flex-1 rounded-xl"
            />
            <Button onClick={send} size="sm">发送</Button>
          </div>
        </div>

        {/* ---- 右：沙箱预览 ---- */}
        <div className="w-[420px] shrink-0 bg-card rounded-2xl shadow-minimal flex flex-col overflow-hidden relative">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between text-sm font-semibold text-muted-foreground bg-muted/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />预览
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              🖱 点击纠错 <span className="text-primary">●</span>
            </span>
          </div>

          <iframe
            className="flex-1 w-full border-0"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={MOCK_HTML}
            title="预览"
          />

          {/* PRD 接口 6→7：纠错弹窗 */}
          {correction && (
            <div
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl"
              onClick={() => closeCorrection(null)}
            >
              <div
                className="bg-dialog text-dialog-foreground rounded-2xl p-6 w-[340px] shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent"
                  onClick={() => closeCorrection(null)}
                >✕</button>
                <div className="text-base font-bold mb-1">💬 这里有什么问题？</div>
                <div className="text-xs text-muted-foreground mb-4">
                  点击了「{correction.textContent || correction.tag}」
                </div>
                <Input
                  className="w-full rounded-xl mb-3"
                  placeholder="描述一下哪里不满意……"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') closeCorrection((e.target as HTMLInputElement).value.trim() || null)
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => closeCorrection(null)}>
                    😶 此处不满意
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== 底：时间轴 ===== */}
      <nav className="flex items-center gap-2 px-5 py-2.5 shrink-0 bg-card/80 mx-2 mb-2 rounded-xl shadow-minimal">
        <span className="text-xs text-muted-foreground">⏱ 时间轴</span>
        {TIMELINE_NODES.map((node) => (
          <React.Fragment key={node.label}>
            <span className="text-border mx-1">→</span>
            <span
              className={cn(
                'text-xs px-3 py-1 rounded-lg font-medium cursor-pointer transition-colors',
                node.active
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >{node.label}</span>
          </React.Fragment>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground">点击任意节点一键回退</span>
      </nav>
    </div>
  )
}
