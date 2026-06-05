/**
 * WizardApp — 向导 Agent 主界面
 *
 * 布局：[左：对话区] | [右：沙箱预览 iframe] | [底：时间轴]
 *
 * 复用 Proma UI 组件（Button, Input）+ 主题 CSS 变量。
 * 状态自包含，不依赖 Jotai / Electron / IPC。
 */

import React, { useState, useRef, useEffect } from 'react'
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

// ===== Mock HTML（记账应用草图） =====

const MOCK_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;width:100%}
h1{font-size:22px;color:#1a1a2e;margin-bottom:20px;text-align:center}
.input-group{display:flex;gap:6px;margin-bottom:16px}
input{flex:1;padding:10px 12px;border:2px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none}input:focus{border-color:#6366f1}
button{padding:10px 18px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600}button:hover{background:#4f46e5}
.record-list{list-style:none}.record-list li{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8f9ff;border-radius:10px;margin-bottom:6px;font-size:14px}
.record-list .amount{font-weight:700;color:#6366f1}.record-list .category{font-size:11px;color:#888;background:#eef0ff;padding:2px 8px;border-radius:6px}
.wizard-highlight{outline:3px solid #ef4444!important;outline-offset:3px;animation:pulse .7s infinite alternate}
@keyframes pulse{from{outline-color:#ef4444}to{outline-color:#f87171}}
</style></head><body>
<div class="card"><h1>💰 记账应用</h1>
<div class="input-group"><input type="text" placeholder="金额" id="amount"><input type="text" placeholder="分类" id="category"><button id="saveBtn">保存</button></div>
<ul class="record-list" id="recordList">
<li><span>🍜 午餐</span><span class="category">餐饮</span><span class="amount">¥30</span></li>
<li><span>🚇 地铁</span><span class="category">交通</span><span class="amount">¥15</span></li>
<li><span>☕ 咖啡</span><span class="category">餐饮</span><span class="amount">¥22</span></li>
</ul></div>
<script>
document.getElementById('saveBtn').addEventListener('click',function(){var a=document.getElementById('amount').value.trim();var c=document.getElementById('category').value.trim()||'其他';if(!a){alert('请输入金额');return}var li=document.createElement('li');li.innerHTML='<span>📝 '+c+'</span><span class="category">'+c+'</span><span class="amount">¥'+a+'</span>';document.getElementById('recordList').appendChild(li);document.getElementById('amount').value='';document.getElementById('category').value=''});
var hl=null;document.addEventListener('click',function(e){if(e.target.tagName==='INPUT'&&document.activeElement===e.target)return;e.stopPropagation();e.preventDefault();if(hl)hl.classList.remove('wizard-highlight');e.target.classList.add('wizard-highlight');hl=e.target;window.parent.postMessage({type:'element-clicked',data:{tag:e.target.tagName,textContent:(e.target.textContent||'').trim().substring(0,50)}},'*')},true);
window.addEventListener('message',function(e){if(e.data==='clear-highlight'&&hl){hl.classList.remove('wizard-highlight');hl=null}});
</script></body></html>`

// ===== 时间轴节点 =====

const TIMELINE_NODES = [
  { label: '📐 验证草图 v1', active: true },
  { label: '🚀 MVP v1', active: false },
  { label: '📍 当前版本', active: false },
]

// ===== 主组件 =====

export function WizardApp(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [inputValue, setInputValue] = useState('')
  const [correction, setCorrection] = useState<{ tag: string; textContent: string } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // 对话滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 监听 iframe postMessage（点选纠错）
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'element-clicked') {
        setCorrection(e.data.data)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // 发送消息
  const send = (): void => {
    const text = inputValue.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text }])
    setInputValue('')
    // 模拟 Agent 回复
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'system', text: '收到，正在根据你的反馈修改……改好了，你看看右边效果？' },
      ])
    }, 800)
  }

  // 关闭纠错弹窗
  const closeCorrection = (feedback: string | null): void => {
    setCorrection(null)
    // 清除 iframe 内高亮
    document.querySelector('iframe')?.contentWindow?.postMessage('clear-highlight', '*')
    if (feedback) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', text: `🔧 纠错: ${feedback}` },
      ])
    }
  }

  // 快捷选项点击
  const selectOption = (label: string): void => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text: label }])
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-zinc-50 to-zinc-100 text-foreground">
      {/* ===== 顶栏 ===== */}
      <header className="flex items-center gap-3 px-5 py-3 shrink-0">
        <span className="font-bold text-sm">💰 记账应用</span>
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
          {/* 标题 */}
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-muted-foreground shrink-0">
            💬 对话
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md border border-border'
                  )}
                >
                  {msg.role === 'system' && (
                    <div className="text-[11px] text-primary mb-1 font-semibold">
                      🤖 向导 Agent
                    </div>
                  )}
                  <div>{msg.text}</div>

                  {/* 快捷选项 */}
                  {msg.options && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {msg.options.map((opt) => (
                        <Button
                          key={opt.value}
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => selectOption(opt.label)}
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

          {/* 输入框 */}
          <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2.5">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="输入你的需求..."
              className="flex-1 rounded-xl"
            />
            <Button onClick={send} size="sm" className="rounded-xl px-5">
              发送
            </Button>
          </div>
        </div>

        {/* ---- 右：沙箱预览 + 纠错弹窗 ---- */}
        <div className="w-[420px] shrink-0 bg-card rounded-2xl shadow-minimal flex flex-col overflow-hidden relative">
          {/* 预览标题 */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between text-sm font-semibold text-muted-foreground bg-muted/50 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              预览
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              🖱 点击纠错 <span className="text-primary">●</span>
            </span>
          </div>

          {/* 沙箱 iframe */}
          <iframe
            className="flex-1 w-full border-0"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={MOCK_HTML}
            title="预览"
          />

          {/* 纠错弹窗 */}
          {correction && (
            <div
              className="absolute inset-0 bg-black/35 flex items-center justify-center z-10 rounded-2xl"
              onClick={() => closeCorrection(null)}
            >
              <div
                className="bg-card rounded-2xl p-6 w-[340px] shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent"
                  onClick={() => closeCorrection(null)}
                >
                  ✕
                </button>
                <div className="text-base font-bold mb-1">💬 这里有什么问题？</div>
                <div className="text-xs text-muted-foreground mb-4">
                  点击了「{correction.textContent || correction.tag}」
                </div>
                <Input
                  className="w-full rounded-xl mb-3"
                  placeholder="描述一下哪里不满意……比如：按钮太小了"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement
                      closeCorrection(target.value.trim() || null)
                    }
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => closeCorrection(null)}>
                    😶 就是不满意，你猜
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
            >
              {node.label}
            </span>
          </React.Fragment>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground">点击任意节点一键回退</span>
      </nav>
    </div>
  )
}
