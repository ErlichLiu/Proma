/**
 * 渲染进程入口 — 向导 Agent（Fork Proma W1 减法版）
 *
 * 剥离：Electron IPC、Jotai、多模式（Chat/Agent/Scratch）、
 *       多 Provider、飞书、钉钉、自动更新、标签页等全部冗余。
 * 保留：React 18 + Vite + Tailwind CSS 变量主题 + Radix UI 组件库。
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
