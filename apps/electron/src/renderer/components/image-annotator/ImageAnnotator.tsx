/**
 * ImageAnnotator - 图片标注编辑器
 *
 * 在发送图片前对图片进行圈画标注，让 AI 关注特定区域。
 * 支持：画笔、圆形、矩形、箭头、文字标注。
 * 标注完成后导出为 PNG base64，替换原图发送。
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  Pencil,
  Circle,
  Square,
  ArrowRight,
  Type,
  Undo2,
  Trash2,
  Check,
  X,
  Minus,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ===== 类型定义 =====

type Tool = 'pen' | 'circle' | 'rect' | 'arrow' | 'text'

interface Point {
  x: number
  y: number
}

interface Stroke {
  tool: Exclude<Tool, 'text'>
  color: string
  width: number
  points: Point[] // pen: 多点路径; circle/rect/arrow: [起点, 终点]
}

interface TextAnnotation {
  id: string
  text: string
  x: number
  y: number
  color: string
  fontSize: number
}

interface ImageAnnotatorProps {
  /** 图片 src（data URL / blob URL） */
  src: string | null
  /** 是否打开 */
  open: boolean
  /** 关闭回调 */
  onOpenChange: (open: boolean) => void
  /** 确认回调：返回标注后的 base64 PNG */
  onConfirm: (annotatedBase64: string) => void
  /** 图片 alt / 文件名 */
  alt?: string
}

// ===== 常量 =====

const COLORS = [
  { value: '#ef4444', label: '红' },
  { value: '#eab308', label: '黄' },
  { value: '#22c55e', label: '绿' },
  { value: '#3b82f6', label: '蓝' },
  { value: '#f97316', label: '橙' },
  { value: '#a855f7', label: '紫' },
  { value: '#000000', label: '黑' },
  { value: '#ffffff', label: '白' },
]

const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'pen', icon: <Pencil className="size-4" />, label: '画笔' },
  { id: 'circle', icon: <Circle className="size-4" />, label: '圆形' },
  { id: 'rect', icon: <Square className="size-4" />, label: '矩形' },
  { id: 'arrow', icon: <ArrowRight className="size-4" />, label: '箭头' },
  { id: 'text', icon: <Type className="size-4" />, label: '文字' },
]

const MIN_WIDTH = 1
const MAX_WIDTH = 12
const WIDTH_STEP = 1

// ===== 绘制辅助函数 =====

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 主线
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  // 箭头
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const arrowLength = Math.max(12, width * 4)
  const arrowAngle = Math.PI / 6

  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(
    to.x - arrowLength * Math.cos(angle - arrowAngle),
    to.y - arrowLength * Math.sin(angle - arrowAngle),
  )
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(
    to.x - arrowLength * Math.cos(angle + arrowAngle),
    to.y - arrowLength * Math.sin(angle + arrowAngle),
  )
  ctx.stroke()

  ctx.restore()
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number,
): void {
  const cx = (from.x + to.x) / 2
  const cy = (from.y + to.y) / 2
  const rx = Math.abs(to.x - from.x) / 2
  const ry = Math.abs(to.y - from.y) / 2

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width: number,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y)
  ctx.stroke()
  ctx.restore()
}

function drawPen(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
): void {
  ctx.save()
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  ctx.textBaseline = 'top'

  // 测量文字
  const metrics = ctx.measureText(text)
  const padding = 4
  const bgW = metrics.width + padding * 2
  const bgH = fontSize + padding * 2

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.beginPath()
  ctx.roundRect(x - padding, y - padding, bgW, bgH, 4)
  ctx.fill()

  // 文字
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ===== 组件 =====

export function ImageAnnotator({
  src,
  open,
  onOpenChange,
  onConfirm,
  alt,
}: ImageAnnotatorProps): React.ReactElement | null {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const imageRef = React.useRef<HTMLImageElement | null>(null)

  const [tool, setTool] = React.useState<Tool>('circle')
  const [color, setColor] = React.useState(COLORS[0]!.value)
  const [width, setWidth] = React.useState(3)
  const [strokes, setStrokes] = React.useState<Stroke[]>([])
  const [texts, setTexts] = React.useState<TextAnnotation[]>([])
  const [currentStroke, setCurrentStroke] = React.useState<Stroke | null>(null)
  const [isDrawing, setIsDrawing] = React.useState(false)
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [textInput, setTextInput] = React.useState('')
  const [textInputPos, setTextInputPos] = React.useState<Point | null>(null)

  // 用 ref 同步状态，供 render 直接读取（避免闭包延迟）
  const strokesRef = React.useRef(strokes)
  const textsRef = React.useRef(texts)
  const currentStrokeRef = React.useRef(currentStroke)
  React.useEffect(() => { strokesRef.current = strokes }, [strokes])
  React.useEffect(() => { textsRef.current = texts }, [texts])
  React.useEffect(() => { currentStrokeRef.current = currentStroke }, [currentStroke])

  // 渲染函数：直接读取 ref，不依赖 state
  const render = React.useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current
    if (!canvas || !ctx || !img) return

    // 清空并绘制原图
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)

    const currentStrokes = strokesRef.current
    const currentTexts = textsRef.current
    const activeStroke = currentStrokeRef.current

    // 绘制已完成的 strokes
    for (const s of currentStrokes) {
      switch (s.tool) {
        case 'pen':
          drawPen(ctx, s.points, s.color, s.width)
          break
        case 'circle':
          if (s.points.length >= 2) {
            drawCircle(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
        case 'rect':
          if (s.points.length >= 2) {
            drawRect(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
        case 'arrow':
          if (s.points.length >= 2) {
            drawArrow(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
      }
    }

    // 绘制当前正在画的 stroke
    if (activeStroke) {
      const s = activeStroke
      switch (s.tool) {
        case 'pen':
          drawPen(ctx, s.points, s.color, s.width)
          break
        case 'circle':
          if (s.points.length >= 2) {
            drawCircle(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
        case 'rect':
          if (s.points.length >= 2) {
            drawRect(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
        case 'arrow':
          if (s.points.length >= 2) {
            drawArrow(ctx, s.points[0]!, s.points[1]!, s.color, s.width)
          }
          break
      }
    }

    // 绘制文字标注
    for (const t of currentTexts) {
      drawText(ctx, t.text, t.x, t.y, t.color, t.fontSize)
    }
  }, [])

  // 加载图片
  React.useEffect(() => {
    if (!open || !src) {
      setImageLoaded(false)
      imageRef.current = null
      return
    }

    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
      }
      // 重置状态
      setStrokes([])
      setTexts([])
      setCurrentStroke(null)
      setTextInput('')
      setTextInputPos(null)
      setImageLoaded(true)
      // 初始渲染（只画原图）
      requestAnimationFrame(render)
    }
    img.onerror = () => {
      console.error('[ImageAnnotator] 图片加载失败')
    }
    img.src = src
  }, [open, src, render])

  // 坐标转换：鼠标坐标 → canvas 像素坐标
  const getCanvasPoint = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    },
    [],
  )

  // 鼠标按下
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool === 'text') {
        const point = getCanvasPoint(e)
        setTextInputPos(point)
        setTextInput('')
        return
      }

      const point = getCanvasPoint(e)
      const stroke: Stroke = { tool, color, width, points: [point] }
      currentStrokeRef.current = stroke
      setCurrentStroke(stroke)
      setIsDrawing(true)
      render()
    },
    [tool, color, width, getCanvasPoint, render],
  )

  // 鼠标移动
  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !currentStrokeRef.current || tool === 'text') return
      const point = getCanvasPoint(e)
      const prev = currentStrokeRef.current
      if (prev.tool === 'pen') {
        currentStrokeRef.current = { ...prev, points: [...prev.points, point] }
      } else {
        currentStrokeRef.current = { ...prev, points: [prev.points[0]!, point] }
      }
      render()
    },
    [isDrawing, tool, getCanvasPoint, render],
  )

  // 鼠标抬起
  const handleMouseUp = React.useCallback(() => {
    if (!isDrawing || !currentStrokeRef.current) return
    const stroke = currentStrokeRef.current
    strokesRef.current = [...strokesRef.current, stroke]
    setStrokes((prev) => [...prev, stroke])
    currentStrokeRef.current = null
    setCurrentStroke(null)
    setIsDrawing(false)
    render()
  }, [isDrawing, render])

  // 鼠标离开 canvas
  const handleMouseLeave = React.useCallback(() => {
    if (isDrawing && currentStrokeRef.current) {
      const stroke = currentStrokeRef.current
      strokesRef.current = [...strokesRef.current, stroke]
      setStrokes((prev) => [...prev, stroke])
      currentStrokeRef.current = null
      setCurrentStroke(null)
      setIsDrawing(false)
      render()
    }
  }, [isDrawing, render])

  // 提交文字标注
  const handleTextSubmit = React.useCallback(() => {
    if (!textInput.trim() || !textInputPos) return
    const newText: TextAnnotation = {
      id: `text-${Date.now()}`,
      text: textInput.trim(),
      x: textInputPos.x,
      y: textInputPos.y,
      color,
      fontSize: Math.max(14, width * 4),
    }
    textsRef.current = [...textsRef.current, newText]
    setTexts((prev) => [...prev, newText])
    setTextInput('')
    setTextInputPos(null)
    render()
  }, [textInput, textInputPos, color, width, render])

  // 撤销
  const handleUndo = React.useCallback(() => {
    if (textsRef.current.length > 0) {
      textsRef.current = textsRef.current.slice(0, -1)
      setTexts((prev) => prev.slice(0, -1))
    } else if (strokesRef.current.length > 0) {
      strokesRef.current = strokesRef.current.slice(0, -1)
      setStrokes((prev) => prev.slice(0, -1))
    }
    render()
  }, [render])

  // 清空
  const handleClear = React.useCallback(() => {
    strokesRef.current = []
    textsRef.current = []
    currentStrokeRef.current = null
    setStrokes([])
    setTexts([])
    setCurrentStroke(null)
    setTextInput('')
    setTextInputPos(null)
    render()
  }, [render])

  // 确认：导出标注后的图片
  const handleConfirm = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onConfirm(dataUrl)
    onOpenChange(false)
  }, [onConfirm, onOpenChange])

  // 取消
  const handleCancel = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // 键盘快捷键
  React.useEffect(() => {
    if (!open) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 如果文字输入框打开，先关闭输入框
        if (textInputPos) {
          setTextInputPos(null)
          setTextInput('')
          return
        }
        handleCancel()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, textInputPos, handleCancel, handleUndo])

  if (!open || !src) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/60 backdrop-blur-sm titlebar-no-drag">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-background/90 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground/80 truncate max-w-[300px]">
            {alt || '图片标注'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-foreground/60 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Canvas 区域 */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4 relative"
      >
        {!imageLoaded && (
          <div className="text-muted-foreground text-sm">加载图片中...</div>
        )}

        {imageLoaded && (
          <>
            <canvas
              ref={canvasRef}
              className={cn(
                'max-w-full max-h-full object-contain shadow-2xl rounded-lg',
                tool === 'text' && 'cursor-text',
                tool !== 'text' && 'cursor-crosshair',
              )}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              draggable={false}
            />

            {/* 文字输入浮动框 */}
            {textInputPos && (
              <div
                className="absolute z-10 flex items-center gap-2 bg-background border border-border rounded-lg shadow-lg p-2"
                style={{
                  left: '50%',
                  bottom: '80px',
                  transform: 'translateX(-50%)',
                }}
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleTextSubmit()
                    }
                    if (e.key === 'Escape') {
                      setTextInputPos(null)
                      setTextInput('')
                    }
                  }}
                  placeholder="输入标注文字..."
                  autoFocus
                  className="w-[200px] h-8 px-2 text-sm bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="p-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Check className="size-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 bg-background/90 border-t border-border shrink-0">
        {/* 工具选择 */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              title={t.label}
              className={cn(
                'p-2 rounded-md transition-colors',
                tool === t.id
                  ? 'bg-background text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-border" />

        {/* 颜色选择 */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.label}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-all',
                color === c.value
                  ? 'border-foreground scale-110 shadow-sm'
                  : 'border-transparent hover:scale-105',
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-border" />

        {/* 线条粗细 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWidth((w) => Math.max(MIN_WIDTH, w - WIDTH_STEP))}
            disabled={width <= MIN_WIDTH}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <Minus className="size-3.5" />
          </button>
          <div className="flex items-center justify-center w-8">
            <div
              className="rounded-full"
              style={{
                width: Math.min(width * 2, 16),
                height: Math.min(width * 2, 16),
                backgroundColor: color,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setWidth((w) => Math.min(MAX_WIDTH, w + WIDTH_STEP))}
            disabled={width >= MAX_WIDTH}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-border" />

        {/* 操作按钮 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0 && texts.length === 0}
            title="撤销 (Ctrl+Z)"
            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0 && texts.length === 0}
            title="清空"
            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-border" />

        {/* 确认/取消 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Check className="size-4" />
            确认
          </button>
        </div>
      </div>
    </div>
  , document.body)
}
