/**
 * 应用生命周期共享状态
 *
 * 抽取退出标志为独立模块，避免循环依赖。
 */

/** 是否正在退出应用（用于区分关闭窗口和退出应用） */
let _isQuitting = false

/** 是否因更新而退出应用（用于让窗口关闭事件正确处理） */
let _isQuittingForUpdate = false

export function getIsQuitting(): boolean {
  return _isQuitting
}

export function setQuitting(value = true): void {
  _isQuitting = value
}

export function getIsQuittingForUpdate(): boolean {
  return _isQuittingForUpdate
}

export function setQuittingForUpdate(value = true): void {
  _isQuittingForUpdate = value
}
