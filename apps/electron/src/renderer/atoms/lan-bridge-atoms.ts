/**
 * LAN Bridge Jotai atoms
 */

import { atom } from 'jotai'
import type { LanBridgeConfig, LanBridgeRuntimeState } from '@proma/shared'

const DEFAULT_RUNTIME_STATE: LanBridgeRuntimeState = {
  status: 'stopped',
  pin: '',
  port: 29888,
  localIp: '',
  connectedClients: [],
}

/** LAN Bridge 运行时状态 */
export const lanBridgeStateAtom = atom<LanBridgeRuntimeState>(DEFAULT_RUNTIME_STATE)

/** LAN Bridge 配置 */
export const lanBridgeConfigAtom = atom<LanBridgeConfig>({
  enabled: false,
  port: 29888,
  maxConnections: 5,
})
