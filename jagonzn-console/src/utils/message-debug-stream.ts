import type { MessageLogResponse } from '@/api/device'
import { currentIdentityEpoch } from '@/utils/http/identity-scope'

export type MessageDebugStatus =
  | 'stopped'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'denied'
  | 'busy'
interface Options {
  token: () => string
  onStatus: (status: MessageDebugStatus) => void
  onItems: (items: MessageLogResponse[]) => void
  onGap: () => void
  onConnected: () => void
  socketFactory?: (url: string, protocols: string[]) => WebSocket
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** 单设备、最多200条内存展示。身份和连接代次围栏拒绝迟到帧；历史恢复交给既有分页API。 */
export class MessageDebugStream {
  private socket?: WebSocket
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private rows: MessageLogResponse[] = []
  constructor(private readonly options: Options) {}

  close() {
    this.generation++
    clearTimeout(this.timer)
    const old = this.socket
    this.socket = undefined
    old?.close(1000, 'debug closed')
    this.rows = []
    this.options.onItems([])
    this.options.onStatus('stopped')
  }

  connect(projectId: string, deviceId: string) {
    this.close()
    const token = this.options.token()
    if (!projectId || !deviceId || !token) return
    const generation = this.generation,
      identity = currentIdentityEpoch()
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const base = String(import.meta.env.VITE_API_URL || '').replace(/^https?:\/\/[^/]+/, '')
    const path = `${base.replace(/\/$/, '')}/api/v1/realtime/messages`.replace(/\/+/g, '/')
    this.options.onStatus('connecting')
    let socket: WebSocket
    try {
      socket = (this.options.socketFactory ?? ((url, protocols) => new WebSocket(url, protocols)))(
        `${scheme}//${window.location.host}${path}?deviceId=${encodeURIComponent(deviceId)}`,
        ['tc-v1', `bearer.${token}`]
      )
    } catch {
      this.options.onStatus('disconnected')
      return
    }
    this.socket = socket
    const current = () =>
      this.socket === socket &&
      this.generation === generation &&
      currentIdentityEpoch() === identity
    let ready = false
    const heartbeat = () => {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        if (current()) socket.close(4000, 'debug heartbeat timeout')
      }, 6000)
    }
    heartbeat()
    socket.onopen = () => {
      if (current() && socket.protocol !== 'tc-v1') socket.close(4000, 'protocol mismatch')
    }
    socket.onmessage = (event) => {
      if (!current() || typeof event.data !== 'string' || event.data.length > 32768) return
      let value: unknown
      try {
        value = JSON.parse(event.data)
      } catch {
        return
      }
      if (!record(value) || value.projectId !== projectId || value.deviceId !== deviceId) return
      if (value.type === 'READY' && !ready) {
        ready = true
        heartbeat()
        this.options.onStatus('connected')
        this.options.onConnected()
      } else if (
        ready &&
        value.type === 'MESSAGE_BATCH' &&
        Array.isArray(value.items) &&
        value.items.length <= 10 &&
        typeof value.resyncRequired === 'boolean'
      ) {
        const valid = value.items.every(
          (item) =>
            record(item) &&
            typeof item.id === 'string' &&
            item.deviceId === deviceId &&
            (item.direction === 'UP' || item.direction === 'DOWN')
        )
        if (!valid) return
        heartbeat()
        const incoming = value.items as MessageLogResponse[]
        const ids = new Set(incoming.map((item) => item.id))
        const combined = [...incoming, ...this.rows.filter((item) => !ids.has(item.id))]
        if (value.resyncRequired || combined.length > 200) this.options.onGap()
        this.rows = combined.slice(0, 200)
        this.options.onItems([...this.rows])
      }
    }
    socket.onerror = () => {
      if (current()) socket.close()
    }
    socket.onclose = (event) => {
      if (!current()) return
      clearTimeout(this.timer)
      this.socket = undefined
      this.options.onStatus(
        event.code === 1008 ? 'denied' : event.code === 1013 ? 'busy' : 'disconnected'
      )
      if (event.code === 1008) {
        this.rows = []
        this.options.onItems([])
      } else this.options.onGap()
    }
  }
}
