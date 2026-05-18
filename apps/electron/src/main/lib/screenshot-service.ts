/**
 * 截图导出服务
 *
 * 参考 bozeman 的离屏渲染管线：
 * 隐藏 BrowserWindow + offscreen + pathToFileURL 加载临时 HTML + capturePage 截图
 * 长文档通过 pngjs 拼接分段截图。
 */

import { BrowserWindow, clipboard, dialog, nativeImage, screen, type NativeImage } from 'electron'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'

const SCREENSHOT_SCALE = 3
const SCREENSHOT_MAX_SEGMENT = 4000
const SCREENSHOT_SEGMENT_MARGIN = 96

/* ── 离屏窗口单例 ── */

let _screenshotWin: BrowserWindow | null = null

function getScreenshotWindow(): BrowserWindow {
  if (_screenshotWin && !_screenshotWin.isDestroyed()) return _screenshotWin
  _screenshotWin = new BrowserWindow({
    width: 960,
    height: 100,
    show: false,
    skipTaskbar: true,
    webPreferences: { offscreen: { deviceScaleFactor: SCREENSHOT_SCALE } as unknown as boolean },
  })
  return _screenshotWin
}

/* ── 串行锁（防并发截图） ── */

let _lock = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolve: () => void
  const prev = _lock
  _lock = new Promise((r) => { resolve = r })
  return prev.then(() => fn().finally(() => resolve!()))
}

/* ── 最大分段高度（参考屏幕工作区） ── */

function resolveMaxSegmentHeight(): number {
  try {
    const display = screen.getPrimaryDisplay()
    const h = display?.workArea?.height || display?.bounds?.height
    if (Number.isFinite(h) && h > 0) {
      return Math.max(1, Math.min(SCREENSHOT_MAX_SEGMENT, h - SCREENSHOT_SEGMENT_MARGIN))
    }
  } catch { /* 降级 */ }
  return SCREENSHOT_MAX_SEGMENT
}

function stitchScreenshotSegments(segments: NativeImage[], scale: number): Buffer {
  const parts = segments.map((segment) => PNG.sync.read(segment.toPNG({ scaleFactor: scale })))
  if (parts.length === 0) {
    throw new Error('没有捕获到截图分段')
  }

  const width = parts[0]?.width
  if (!width) {
    throw new Error('截图分段宽度无效')
  }

  let height = 0
  for (const part of parts) {
    if (part.width !== width) {
      throw new Error(`截图分段宽度不一致：期望 ${width}px，实际 ${part.width}px`)
    }
    height += part.height
  }

  const full = new PNG({ width, height })
  let yOffset = 0
  for (const part of parts) {
    part.data.copy(full.data, yOffset * width * 4)
    yOffset += part.height
  }

  return PNG.sync.write(full)
}

/* ── 构建截图 HTML ── */

function buildScreenshotHtml(htmlContent: string, isDark: boolean): string {
  const bg = isDark ? '#111827' : '#ffffff'

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;background:${bg};scrollbar-width:none;-ms-overflow-style:none}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}
body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
img,video,canvas,svg{max-width:100%}
.proma-screenshot-sheet{width:max-content;max-width:100%;margin:0 auto;background:${bg}}
.proma-screenshot-sheet [contenteditable],
.proma-screenshot-sheet [contenteditable="false"]{outline:none}
.proma-screenshot-sheet .ProseMirror-selectednode,
.proma-screenshot-sheet .selectedCell::after{display:none!important}
.watermark{display:flex;align-items:center;justify-content:flex-end;gap:.4em;margin:16px 16px 0;padding-top:10px;border-top:1px solid rgba(127,127,127,.18);font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(127,127,127,.55)}
</style></head><body>
<main class="proma-screenshot-sheet">${htmlContent}</main>
<footer class="watermark"><span>Proma</span></footer>
</body></html>`
}

/* ── 核心截图函数 ── */

async function screenshotCapture(htmlContent: string, width: number): Promise<Buffer> {
  const win = getScreenshotWindow()
  win.setSize(width, 100)

  const tmpPath = join(tmpdir(), `proma-ss-${Date.now()}.html`)
  writeFileSync(tmpPath, htmlContent, 'utf-8')

  try {
    await win.loadURL(pathToFileURL(tmpPath).href)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 300))

    const totalHeight: number = await win.webContents.executeJavaScript(`
      Math.max(document.body.scrollHeight, document.body.offsetHeight,
               document.documentElement.scrollHeight, document.documentElement.offsetHeight)
    `)

    const maxH = resolveMaxSegmentHeight()

    if (totalHeight <= maxH) {
      win.setSize(width, totalHeight)
      await new Promise((r) => setTimeout(r, 200))
      const image = await win.webContents.capturePage(
        { x: 0, y: 0, width, height: totalHeight },
      )
      return image.toPNG({ scaleFactor: SCREENSHOT_SCALE })
    }

    // 分段截图（长文档）
    const segments: NativeImage[] = []
    let captured = 0
    while (captured < totalHeight) {
      const segH = Math.min(maxH, totalHeight - captured)
      win.setSize(width, segH)
      await win.webContents.executeJavaScript(`window.scrollTo(0, ${captured})`)
      await new Promise((r) => setTimeout(r, 300))
      const seg = await win.webContents.capturePage(
        { x: 0, y: 0, width, height: segH },
      )
      segments.push(seg)
      captured += segH
    }

    return stitchScreenshotSegments(segments, SCREENSHOT_SCALE)
  } finally {
    try { unlinkSync(tmpPath) } catch { /* 清理 */ }
  }
}

/* ── 公开接口 ── */

export interface ScreenshotInput {
  html: string
  isDark: boolean
  width?: number
  mode: 'clipboard' | 'file'
}

export interface ScreenshotResult {
  success: boolean
  message: string
  filePath?: string
}

export function captureScreenshot(input: ScreenshotInput): Promise<ScreenshotResult> {
  return withLock(async () => {
    try {
      const { html, isDark, width = 960, mode } = input
      const htmlContent = buildScreenshotHtml(html, isDark)
      const pngBuffer = await screenshotCapture(htmlContent, width)

      if (mode === 'clipboard') {
        const img = nativeImage.createFromBuffer(pngBuffer)
        clipboard.writeImage(img)
        return { success: true, message: '截图已复制到剪贴板' }
      }

      const pad = (n: number) => String(n).padStart(2, '0')
      const now = new Date()
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '保存截图',
        defaultPath: join(homedir(), 'Desktop', `proma-${ts}.png`),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      })

      if (canceled || !filePath) {
        return { success: false, message: '已取消保存' }
      }

      writeFileSync(filePath, pngBuffer)
      return { success: true, message: '截图已保存', filePath }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '截图失败'
      console.error('[截图服务]', err)
      return { success: false, message: msg }
    }
  })
}
