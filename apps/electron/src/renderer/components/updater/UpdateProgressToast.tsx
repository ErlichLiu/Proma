/**
 * UpdateProgressToast - 下载进度浮层组件
 *
 * 固定在右下角显示下载进度，包含进度条、百分比和下载速度。
 * 当下载状态时自动显示，下载完成或失败时自动隐藏。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Download } from 'lucide-react'
import { updateStatusAtom, isDownloadingAtom } from '@/atoms/updater'
import { cn } from '@/lib/utils'

/**
 * 格式化字节显示
 * 将字节转换为人类可读的格式（KB、MB、GB）
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)

  // 根据单位决定小数位数
  const decimals = i === 0 ? 0 : i === 1 ? 1 : 2
  return `${size.toFixed(decimals)} ${units[i]}`
}

/**
 * 格式化下载速度
 */
function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * 格式化进度百分比
 */
function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`
}

/**
 * 下载进度浮层组件
 */
export function UpdateProgressToast(): React.ReactElement | null {
  const isDownloading = useAtomValue(isDownloadingAtom)
  const status = useAtomValue(updateStatusAtom)

  // 非下载状态或无进度信息时不渲染
  if (!isDownloading || !status.progress) return null

  const { percent, bytesPerSecond, total, transferred } = status.progress

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'bg-popover text-popover-foreground rounded-lg shadow-lg border',
        'w-64 p-4',
        'animate-in slide-in-from-bottom-4 fade-in duration-300'
      )}
    >
      {/* 标题区域 */}
      <div className="flex items-center gap-2 mb-3">
        <Download className="h-4 w-4 text-primary animate-pulse" />
        <span className="text-sm font-medium">正在下载更新</span>
      </div>

      {/* 进度条 */}
      <div className="space-y-2">
        {/* 进度条轨道 */}
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          {/* 进度条填充 */}
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>

        {/* 进度信息 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {/* 已下载 / 总大小 */}
          <span>
            {formatBytes(transferred)} / {formatBytes(total)}
          </span>

          {/* 百分比 */}
          <span className="font-medium">{formatPercent(percent)}</span>
        </div>

        {/* 下载速度 */}
        <div className="text-xs text-muted-foreground">
          下载速度: {formatSpeed(bytesPerSecond)}
        </div>
      </div>
    </div>
  )
}