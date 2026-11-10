import { uid } from './storage.ts'
import {
  SYNC_SETTINGS_KEY,
  isConfigured,
  type RemoteArticle,
  type SyncConfig,
  type SyncOp,
} from './sync.ts'

const CALLBACK_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function loadSyncConfig(): SyncConfig | undefined {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    if (!parsed || typeof parsed !== 'object') return undefined
    const config: SyncConfig = {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
      deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : uid('dev'),
      deviceName: typeof parsed.deviceName === 'string' ? parsed.deviceName : '',
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
      pending: Array.isArray(parsed.pending) ? (parsed.pending as SyncOp[]) : [],
    }
    return config
  } catch {
    return undefined
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(config))
}

export function clearSyncConfig(): void {
  localStorage.removeItem(SYNC_SETTINGS_KEY)
}

export function ensureSyncConfig(partial: { url: string; pin: string; deviceName?: string }): SyncConfig {
  const prev = loadSyncConfig()
  const config: SyncConfig = {
    url: partial.url.trim(),
    pin: partial.pin.trim(),
    deviceId: prev?.deviceId || uid('dev'),
    deviceName: (partial.deviceName ?? prev?.deviceName ?? '').trim(),
    lastSyncAt: prev?.lastSyncAt,
    pending: prev?.pending ?? [],
  }
  saveSyncConfig(config)
  return config
}

type SyncResponse = { ok: boolean; error?: string; pong?: boolean; articles?: RemoteArticle[] }

function normalizeExecUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function jsonpRequest(webAppUrl: string, params: Record<string, string>, timeoutMs = 20000): Promise<SyncResponse> {
  return new Promise((resolve, reject) => {
    const callback = `pz_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    if (!CALLBACK_RE.test(callback)) {
      reject(new Error('callback'))
      return
    }
    const target = new URL(normalizeExecUrl(webAppUrl))
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) target.searchParams.set(key, value)
    }
    target.searchParams.set('callback', callback)
    const script = document.createElement('script')
    let done = false
    const timer = window.setTimeout(() => finish(new Error('timeout')), timeoutMs)
    function finish(err?: Error, data?: SyncResponse) {
      if (done) return
      done = true
      window.clearTimeout(timer)
      script.remove()
      delete (window as unknown as Record<string, unknown>)[callback]
      if (err) reject(err)
      else resolve(data ?? { ok: false, error: 'empty' })
    }
    ;(window as unknown as Record<string, unknown>)[callback] = (payload: SyncResponse) => {
      finish(undefined, payload)
    }
    script.onerror = () => finish(new Error('network'))
    script.src = target.toString()
    document.head.appendChild(script)
  })
}

const CHUNK = 12

export async function syncPing(config: SyncConfig): Promise<SyncResponse> {
  return jsonpRequest(config.url, { action: 'ping', pin: config.pin, device: config.deviceName || config.deviceId })
}

export async function syncPull(config: SyncConfig): Promise<SyncResponse> {
  return jsonpRequest(config.url, { action: 'pull', pin: config.pin, device: config.deviceName || config.deviceId })
}

export async function syncPush(config: SyncConfig, ops: SyncOp[]): Promise<SyncResponse> {
  if (!ops.length) return syncPull(config)
  const compacted = ops
  let last: SyncResponse = { ok: false, error: 'empty' }
  for (let i = 0; i < compacted.length; i += CHUNK) {
    const slice = compacted.slice(i, i + CHUNK)
    last = await jsonpRequest(config.url, {
      action: 'push',
      pin: config.pin,
      device: config.deviceName || config.deviceId,
      ops: JSON.stringify(slice),
    })
    if (!last.ok) return last
  }
  return last
}

export { isConfigured }
