/**
 * LanBridgeSettings - 局域网 Bridge 设置面板
 *
 * 内嵌 WS Server，让第三方客户端（lan-viewer、Web UI 等）接入 Proma。
 * PIN 配对认证，局域网内安全访问。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { Copy, Loader2, Power, PowerOff, RefreshCw, Wifi, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingsSection } from './primitives/SettingsSection'
import { SettingsCard } from './primitives/SettingsCard'
import { SettingsRow } from './primitives/SettingsRow'
import { SettingsInput } from './primitives/SettingsInput'
import { lanBridgeStateAtom, lanBridgeConfigAtom } from '@/atoms/lan-bridge-atoms'
import type { LanBridgeConfig, LanBridgeRuntimeState } from '@proma/shared'

const STATUS_CONFIG: Record<LanBridgeRuntimeState['status'], { color: string; label: string }> = {
  stopped: { color: 'bg-gray-400', label: '已停止' },
  starting: { color: 'bg-amber-400 animate-pulse', label: '启动中...' },
  running: { color: 'bg-green-500', label: '运行中' },
  error: { color: 'bg-red-500', label: '启动失败' },
}

export function LanBridgeSettings(): React.ReactElement {
  const [runtimeState, setRuntimeState] = useAtom(lanBridgeStateAtom)
  const [config, setConfig] = useAtom(lanBridgeConfigAtom)
  const [loaded, setLoaded] = React.useState(false)
  const [pin, setPin] = React.useState('')
  const [portInput, setPortInput] = React.useState(String(config.port))
  const [maxConnInput, setMaxConnInput] = React.useState(String(config.maxConnections))
  const [saving, setSaving] = React.useState(false)

  // 加载配置和状态
  React.useEffect(() => {
    Promise.all([
      window.electronAPI.getLanBridgeConfig(),
      window.electronAPI.getLanBridgeStatus(),
    ]).then(([cfg, state]) => {
      setConfig(cfg)
      setRuntimeState(state)
      setPortInput(String(cfg.port))
      setMaxConnInput(String(cfg.maxConnections))
      setLoaded(true)
    })
  }, [setConfig, setRuntimeState])

  // 订阅状态变化
  React.useEffect(() => {
    const unsubscribe = window.electronAPI.onLanBridgeStatusChanged((state: LanBridgeRuntimeState) => {
      setRuntimeState(state)
    })
    return unsubscribe
  }, [setRuntimeState])

  // 获取 PIN
  React.useEffect(() => {
    if (runtimeState.status === 'running') {
      window.electronAPI.getLanBridgePin().then(setPin)
    }
  }, [runtimeState.status])

  // 启动服务
  const handleStart = React.useCallback(async () => {
    try {
      await window.electronAPI.startLanBridge()
      toast.success('局域网 Bridge 已启动')
    } catch (error) {
      toast.error(`启动失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // 停止服务
  const handleStop = React.useCallback(async () => {
    try {
      await window.electronAPI.stopLanBridge()
      setPin('')
      toast.info('局域网 Bridge 已停止')
    } catch (error) {
      toast.error(`停止失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // 刷新 PIN
  const handleRefreshPin = React.useCallback(async () => {
    try {
      const newPin = await window.electronAPI.refreshLanBridgePin()
      setPin(newPin)
      toast.success('PIN 码已刷新')
    } catch (error) {
      toast.error(`刷新失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // 保存配置
  const handleSaveConfig = React.useCallback(async () => {
    const port = Number(portInput)
    const maxConnections = Number(maxConnInput)
    if (isNaN(port) || port < 1024 || port > 65535) {
      toast.error('端口范围: 1024-65535')
      return
    }
    if (isNaN(maxConnections) || maxConnections < 1 || maxConnections > 50) {
      toast.error('最大连接数范围: 1-50')
      return
    }
    setSaving(true)
    try {
      const updated = await window.electronAPI.updateLanBridgeConfig({ port, maxConnections })
      setConfig(updated)
      toast.success('配置已保存')
    } catch (error) {
      toast.error(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }, [portInput, maxConnInput, setConfig])

  // 复制到剪贴板
  const copyToClipboard = React.useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('已复制'))
  }, [])

  const statusConfig = STATUS_CONFIG[runtimeState.status]
  const isRunning = runtimeState.status === 'running'

  if (!loaded) return <div />

  return (
    <div className="space-y-8">
      {/* 服务状态 */}
      <SettingsSection
        title="局域网 Bridge"
        description="在局域网内暴露 WebSocket 接口，允许第三方客户端接入 Proma"
      >
        <SettingsCard>
          <SettingsRow label="服务状态">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
                <span className="text-sm text-muted-foreground">{statusConfig.label}</span>
              </div>
              {isRunning ? (
                <Button size="sm" variant="outline" onClick={handleStop}>
                  <PowerOff size={14} className="mr-1.5" />
                  停止
                </Button>
              ) : (
                <Button size="sm" onClick={handleStart} disabled={runtimeState.status === 'starting'}>
                  {runtimeState.status === 'starting' ? (
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                  ) : (
                    <Power size={14} className="mr-1.5" />
                  )}
                  启动
                </Button>
              )}
            </div>
          </SettingsRow>
        </SettingsCard>

        {/* 错误信息 */}
        {runtimeState.status === 'error' && runtimeState.errorMessage && (
          <div className="mt-2 px-3 py-2.5 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-sm">
            {runtimeState.errorMessage}
          </div>
        )}
      </SettingsSection>

      {/* PIN 码 */}
      {isRunning && (
        <SettingsSection
          title="PIN 码配对"
          description="客户端连接时需要输入此 PIN 码完成认证"
        >
          <SettingsCard>
            <SettingsRow label="当前 PIN">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-mono font-bold tracking-[0.5em] text-foreground select-all">
                  {pin || '------'}
                </span>
                <Button size="sm" variant="ghost" onClick={handleRefreshPin}>
                  <RefreshCw size={14} />
                </Button>
              </div>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}

      {/* 访问地址 */}
      {isRunning && (
        <SettingsSection
          title="访问地址"
          description="第三方客户端通过以下地址连接"
        >
          <SettingsCard>
            <SettingsRow label="局域网 WS">
              <div className="flex items-center gap-2">
                <code className="text-sm text-muted-foreground font-mono">
                  ws://{runtimeState.localIp}:{runtimeState.port}
                </code>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => copyToClipboard(`ws://${runtimeState.localIp}:${runtimeState.port}`)}>
                  <Copy size={12} />
                </Button>
              </div>
            </SettingsRow>
            <SettingsRow label="手机端网页">
              <div className="flex items-center gap-2">
                <code className="text-sm text-primary font-mono font-semibold">
                  http://{runtimeState.localIp}:{runtimeState.port}
                </code>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => copyToClipboard(`http://${runtimeState.localIp}:${runtimeState.port}`)}>
                  <Copy size={12} />
                </Button>
              </div>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}

      {/* 已连接设备 */}
      {isRunning && (
        <SettingsSection
          title="已连接设备"
          description={`当前 ${runtimeState.connectedClients.length} 个客户端`}
        >
          {runtimeState.connectedClients.length > 0 ? (
            <SettingsCard>
              {runtimeState.connectedClients.map((client, i) => (
                <SettingsRow key={client.id ?? i} label={client.ip}>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${client.authenticated ? 'bg-green-500' : 'bg-amber-400'}`} />
                    <span className="text-xs text-muted-foreground">
                      {client.authenticated ? '已认证' : '未认证'}
                    </span>
                  </div>
                </SettingsRow>
              ))}
            </SettingsCard>
          ) : (
            <div className="text-sm text-muted-foreground py-3">
              暂无连接
            </div>
          )}
        </SettingsSection>
      )}

      {/* 配置 */}
      <SettingsSection
        title="服务配置"
        description="修改配置后需重启服务生效"
      >
        <SettingsCard>
          <SettingsRow label="端口">
            <SettingsInput
              value={portInput}
              onChange={setPortInput}
              placeholder="29888"
              className="w-24 text-right"
              type="number"
            />
          </SettingsRow>
          <SettingsRow label="最大连接数">
            <SettingsInput
              value={maxConnInput}
              onChange={setMaxConnInput}
              placeholder="5"
              className="w-24 text-right"
              type="number"
            />
          </SettingsRow>
        </SettingsCard>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleSaveConfig} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
            保存配置
          </Button>
        </div>
      </SettingsSection>

      {/* 使用说明 */}
      <SettingsSection
        title="使用说明"
        description="两种接入方式：内置手机端 或 对接 WS 协议"
      >
        <SettingsCard divided={false}>
          <div className="px-4 py-4 space-y-6 text-sm">
            {/* 方案一：内置手机端 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs font-semibold flex items-center justify-center">📱</span>
                <span className="font-medium text-foreground">方案一：内置手机端（开箱即用）</span>
              </div>
              <p className="pl-7 text-muted-foreground">
                手机连接同一 WiFi，浏览器打开上方「手机端网页」地址，输入 PIN 码即可使用。
                支持查看 Chat/Agent 对话、发送消息、切换模型、实时流式回复。
              </p>
              <div className="pl-7 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">1</span>
                  <span>启动服务，获取 PIN 码</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">2</span>
                  <span>手机浏览器打开 <code className="px-1 py-0.5 bg-muted rounded text-[11px]">http://{isRunning ? runtimeState.localIp : 'IP'}:{config.port}</code></span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">3</span>
                  <span>输入 PIN 码，开始对话</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* 方案二：WS 协议对接 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold flex items-center justify-center">🔌</span>
                <span className="font-medium text-foreground">方案二：对接 WS 协议（自研客户端）</span>
              </div>
              <p className="pl-7 text-muted-foreground">
                任何第三方（Web UI、IDE 插件、CLI 工具等）均可通过 WebSocket 协议接入 Proma，
                实现对话查询、Agent 交互、实时流式推送等全部能力。
              </p>

              {/* 认证流程 */}
              <div className="pl-7 space-y-1.5">
                <span className="text-xs font-medium text-foreground/80">认证流程</span>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">1</span>
                  <span>连接 <code className="px-1 py-0.5 bg-muted rounded text-[11px]">ws://{'{'}IP{'}'}:{config.port}</code></span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">2</span>
                  <span>发送 <code className="px-1 py-0.5 bg-muted rounded text-[11px]">{'{'} "type": "auth.pair", "data": {'{'} "pin": "123456" {'}'} {'}'}</code> 获取 Token（24h 有效）</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">3</span>
                  <span>后续请求在 <code className="px-1 py-0.5 bg-muted rounded text-[11px]">data</code> 中携带 <code className="px-1 py-0.5 bg-muted rounded text-[11px]">token</code></span>
                </div>
              </div>

              {/* API 列表 */}
              <div className="pl-7 space-y-1.5">
                <span className="text-xs font-medium text-foreground/80">可用命令</span>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground/70">auth.pair / verify / refresh</span>
                  <span>认证</span>
                  <span className="font-mono text-foreground/70">conversations.list / messages</span>
                  <span>Chat 对话</span>
                  <span className="font-mono text-foreground/70">agent.sessions / messages</span>
                  <span>Agent 会话</span>
                  <span className="font-mono text-foreground/70">agent.send / stop</span>
                  <span>Agent 交互</span>
                  <span className="font-mono text-foreground/70">agent.session.create</span>
                  <span>新建会话</span>
                  <span className="font-mono text-foreground/70">workspaces.list</span>
                  <span>工作区</span>
                  <span className="font-mono text-foreground/70">settings.get / channels</span>
                  <span>设置/模型</span>
                  <span className="font-mono text-foreground/70">subscribe / unsubscribe</span>
                  <span>实时事件</span>
                  <span className="font-mono text-foreground/70">conversations.search</span>
                  <span>搜索</span>
                </div>
              </div>

              {/* 推送事件 */}
              <div className="pl-7 space-y-1.5">
                <span className="text-xs font-medium text-foreground/80">服务端推送事件（subscribe 后接收）</span>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground/70">stream.chunk</span>
                  <span>流式文本片段</span>
                  <span className="font-mono text-foreground/70">stream.tool_start</span>
                  <span>工具调用开始</span>
                  <span className="font-mono text-foreground/70">stream.complete</span>
                  <span>流式完成</span>
                  <span className="font-mono text-foreground/70">stream.error</span>
                  <span>流式错误</span>
                  <span className="font-mono text-foreground/70">session.updated</span>
                  <span>会话元数据变更</span>
                </div>
              </div>

              {/* 消息格式 */}
              <div className="pl-7 space-y-1.5">
                <span className="text-xs font-medium text-foreground/80">消息格式</span>
                <pre className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5 overflow-x-auto leading-relaxed">{`请求: { "type": "命令", "id": "可选", "data": { "token": "..." } }
响应: { "type": "命令", "id": "...", "ok": true, "data": { ... } }
推送: { "type": "stream.chunk", "data": { "text": "..." } }`}</pre>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <Wifi size={12} />
                <span className="font-medium">安全提示</span>
              </div>
              仅限局域网（RFC 1918 私有地址）访问，PIN + HMAC Token 双重认证，
              API Key 不会暴露给客户端。连接限制 {config.maxConnections} 个客户端。
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
