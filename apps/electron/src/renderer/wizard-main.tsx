/**
 * wizard-main.tsx — 向导 Agent 独立入口
 *
 * 不依赖 Electron、Jotai、IPC。
 * 复用 Proma 的 UI 组件库和主题系统。
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WizardApp } from './WizardApp'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WizardApp />
  </React.StrictMode>
)
