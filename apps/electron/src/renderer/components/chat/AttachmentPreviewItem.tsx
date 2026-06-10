/**
 * AttachmentPreviewItem - 附件预览卡片
 *
 * 对标 Cherry Studio 的 AttachmentPreview 风格：
 * - 图片：紧凑缩略图 + 圆角，点击可打开标注编辑器
 * - 非图片：teal 色标签 + 文件名截断
 * - hover 显示关闭按钮
 */

import * as React from 'react'
import { X, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageAnnotator } from '@/components/image-annotator/ImageAnnotator'

interface AttachmentPreviewItemProps {
  /** 附件唯一 ID */
  id: string
  /** 原始文件名 */
  filename: string
  /** MIME 类型 */
  mediaType: string
  /** 本地预览 URL（blob URL / data URL，图片用） */
  previewUrl?: string
  /** 删除回调 */
  onRemove: () => void
  /** 标注完成回调：返回新的 base64 图片数据 */
  onAnnotate?: (id: string, newBase64: string) => void
  /** 点击回调（用于打开文件预览等） */
  onClick?: () => void
  className?: string
}

/** 判断是否为图片类型 */
function isImage(mediaType: string): boolean {
  return mediaType.startsWith('image/')
}

/** 截断文件名显示 */
function truncateName(name: string, max: number = 20): string {
  return name.length > max ? name.slice(0, max - 3) + '...' : name
}

export function AttachmentPreviewItem({
  id,
  filename,
  mediaType,
  previewUrl,
  onRemove,
  onAnnotate,
  onClick,
  className,
}: AttachmentPreviewItemProps): React.ReactElement {
  const [annotatorOpen, setAnnotatorOpen] = React.useState(false)
  const handleRemoveClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onRemove()
  }, [onRemove])
  const handleRemoveKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  if (isImage(mediaType) && previewUrl) {
    // 图片预览 — 紧凑缩略图，点击可预览大图
    return (
      <div
        className={cn(
          'group/attachment relative size-[72px] shrink-0 rounded-lg overflow-hidden',
          className
        )}
      >
        <img
          src={previewUrl}
          alt={filename}
          className="size-full object-cover cursor-pointer"
          onClick={() => setAnnotatorOpen(true)}
        />
        {/* hover 关闭按钮 */}
        <button
          type="button"
          onClick={handleRemoveClick}
          onKeyDown={handleRemoveKeyDown}
          className={cn(
            'absolute top-1 right-1 size-[18px] rounded-full',
            'bg-black/50 text-white backdrop-blur-sm',
            'flex items-center justify-center',
            'opacity-0 group-hover/attachment:opacity-100 transition-opacity duration-200',
            'hover:bg-black/70'
          )}
        >
          <X className="size-3" />
        </button>
        <ImageAnnotator
          src={previewUrl}
          alt={filename}
          open={annotatorOpen}
          onOpenChange={setAnnotatorOpen}
          onConfirm={(newBase64) => {
            onAnnotate?.(id, newBase64)
          }}
        />
      </div>
    )
  }

  // 文件预览 — teal 标签样式（对标 Cherry Studio）
  return (
    <div
      className={cn(
        'group/attachment relative flex items-center gap-2 shrink-0',
        'rounded-lg bg-[#37a5aa]/10 border border-[#37a5aa]/20',
        'pl-2.5 pr-7 py-1.5 text-[13px] text-[#37a5aa]',
        'transition-colors hover:bg-[#37a5aa]/15',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <Paperclip className="size-4 shrink-0" />
      <span className="max-w-[160px] truncate">{truncateName(filename)}</span>
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={handleRemoveClick}
        onKeyDown={handleRemoveKeyDown}
        className={cn(
          'absolute top-1/2 right-1.5 -translate-y-1/2 size-[18px] rounded-full',
          'flex items-center justify-center',
          'text-[#37a5aa]/60 hover:text-[#37a5aa] hover:bg-[#37a5aa]/20',
          'opacity-0 group-hover/attachment:opacity-100 transition-all duration-200'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
