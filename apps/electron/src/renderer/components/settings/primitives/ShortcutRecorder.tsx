/**
 * ShortcutRecorder - 快捷键录制组件
 *
 * 监听键盘输入并格式化为 Electron accelerator 格式。
 */

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface ShortcutRecorderProps {
  value: string
  onChange: (accelerator: string) => void
  onValidate?: (accelerator: string) => Promise<boolean>
  placeholder?: string
}

export function ShortcutRecorder({
  value,
  onChange,
  onValidate,
  placeholder = '按下快捷键组合...',
}: ShortcutRecorderProps): React.ReactElement {
  const [isRecording, setIsRecording] = React.useState(false)
  const [isValid, setIsValid] = React.useState(true)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleKeyDown = React.useCallback(
    async (e: React.KeyboardEvent) => {
      if (!isRecording) return

      e.preventDefault()
      e.stopPropagation()

      // 构建 accelerator 字符串
      const modifiers: string[] = []
      if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')

      // 获取主键
      let key = e.key
      if (key === ' ') key = 'Space'
      if (key.length === 1) key = key.toUpperCase()

      // 忽略单独的修饰键
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(key)) return

      const accelerator = [...modifiers, key].join('+')

      // 验证快捷键
      if (onValidate) {
        const valid = await onValidate(accelerator)
        setIsValid(valid)
        if (!valid) return
      }

      onChange(accelerator)
      setIsRecording(false)
      inputRef.current?.blur()
    },
    [isRecording, onChange, onValidate]
  )

  const handleClear = () => {
    onChange('')
    setIsValid(true)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={isRecording ? '等待输入...' : value}
        onFocus={() => setIsRecording(true)}
        onBlur={() => setIsRecording(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly
        className={!isValid ? 'border-red-500' : ''}
      />
      {value && (
        <Button variant="ghost" size="icon" onClick={handleClear}>
          <X size={16} />
        </Button>
      )}
      {!isValid && (
        <span className="text-xs text-red-500">快捷键已被占用</span>
      )}
    </div>
  )
}
