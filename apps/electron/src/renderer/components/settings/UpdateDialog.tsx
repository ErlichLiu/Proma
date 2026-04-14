/**
 * UpdateDialog - 更新确认弹窗组件
 *
 * 包含两个弹窗：
 * 1. DownloadConfirmDialog - 发现新版本时询问用户是否立即下载
 * 2. InstallConfirmDialog - 下载完成后询问用户是否立即重启安装
 *
 * 同一版本只弹一次，使用 shownVersion 记录已弹出的版本。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Download, RefreshCw } from 'lucide-react'
import type { GitHubRelease } from '@proma/shared'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  updateStatusAtom,
  downloadUpdate,
  quitAndInstall,
} from '@/atoms/updater'
import { ReleaseNotesViewer } from './ReleaseNotesViewer'

export function UpdateDialog(): React.ReactElement | null {
  const updateStatus = useAtomValue(updateStatusAtom)
  // 下载确认弹窗状态
  const [downloadDialogOpen, setDownloadDialogOpen] = React.useState(false)
  // 安装确认弹窗状态
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false)
  // 当前弹窗锁定的版本号
  const [dialogVersion, setDialogVersion] = React.useState<string | null>(null)
  // Release 信息
  const [release, setRelease] = React.useState<GitHubRelease | null>(null)
  // 记录已弹出过的版本号（下载确认和安装确认共用）
  const shownVersionRef = React.useRef<string | null>(null)

  // 当状态变为 available 且是新版本时，弹出下载确认弹窗
  React.useEffect(() => {
    if (
      updateStatus.status === 'available' &&
      updateStatus.version &&
      shownVersionRef.current !== updateStatus.version
    ) {
      const version = updateStatus.version
      shownVersionRef.current = version
      setDialogVersion(version)
      setRelease(null)

      // 获取 Release 信息
      window.electronAPI
        .getReleaseByTag(`v${version}`)
        .then((r) => {
          if (r) setRelease(r)
        })
        .catch((err) => {
          console.error('[更新弹窗] 获取 Release 信息失败:', err)
        })

      setDownloadDialogOpen(true)
    }
  }, [updateStatus.status, updateStatus.version])

  // 当状态变为 downloaded 且版本未弹出过时，弹出安装确认弹窗
  React.useEffect(() => {
    if (
      updateStatus.status === 'downloaded' &&
      updateStatus.version &&
      shownVersionRef.current !== updateStatus.version
    ) {
      const version = updateStatus.version
      shownVersionRef.current = version
      setDialogVersion(version)
      setRelease(null)

      // 获取 Release 信息
      window.electronAPI
        .getReleaseByTag(`v${version}`)
        .then((r) => {
          if (r) setRelease(r)
        })
        .catch((err) => {
          console.error('[更新弹窗] 获取 Release 信息失败:', err)
        })

      setInstallDialogOpen(true)
    }
  }, [updateStatus.status, updateStatus.version])

  // 处理下载确认
  const handleDownload = async (): Promise<void> => {
    setDownloadDialogOpen(false)
    try {
      await downloadUpdate()
    } catch (err) {
      console.error('[更新弹窗] 下载失败:', err)
    }
  }

  // 处理安装确认
  const handleInstall = async (): Promise<void> => {
    setInstallDialogOpen(false)
    try {
      await quitAndInstall()
    } catch (err) {
      console.error('[更新弹窗] 安装失败:', err)
    }
  }

  // 关闭下载确认弹窗
  const handleDismissDownload = (): void => {
    setDownloadDialogOpen(false)
    // 关闭后清除版本锁定，允许用户手动触发时再次弹出
    // 但保留 shownVersionRef 防止自动检测时重复弹出
  }

  // 关闭安装确认弹窗
  const handleDismissInstall = (): void => {
    setInstallDialogOpen(false)
  }

  if (!dialogVersion) return null

  return (
    <>
      {/* 下载确认弹窗 */}
      <AlertDialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>发现新版本</AlertDialogTitle>
            <AlertDialogDescription>
              v{dialogVersion} 已发布，是否立即下载更新？
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Release Notes */}
          {release && (
            <div className="max-h-64 overflow-y-auto rounded-md border p-3">
              <ReleaseNotesViewer release={release} showHeader={false} compact />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDismissDownload}>
              稍后再说
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1.5" />
              立即下载
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 安装确认弹窗 */}
      <AlertDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>更新已准备好</AlertDialogTitle>
            <AlertDialogDescription>
              v{dialogVersion} 已下载完成，是否立即重启应用进行安装？
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Release Notes */}
          {release && (
            <div className="max-h-64 overflow-y-auto rounded-md border p-3">
              <ReleaseNotesViewer release={release} showHeader={false} compact />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDismissInstall}>
              稍后再说
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleInstall}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              立即重启
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
