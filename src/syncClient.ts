import { uid } from './storage.ts'
import {
  DEFAULT_SYNC_URL,
  SYNC_SETTINGS_KEY,
  defaultDeviceName,
  effectivePin,
  effectiveSyncUrl,
  isConfigured,
  type RemoteArticle,
  type SyncConfig,
  type SyncOp,
} from './sync.ts'

const CALLBACK_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export { DEFAULT_SYNC_URL, effectiveSyncUrl, isConfigured }

export function loadSyncConfig(): SyncConfig | undefined {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    if (!parsed || typeof parsed !== 'object') return undefined
    const config: SyncConfig = {
      url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : DEFAULT_SYNC_URL,
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
      deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : uid('dev'),
      deviceName: typeof parsed.deviceName === 'string' ? parsed.deviceName : '',
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
      pending: Array.isArray(parsed.pending) ? (parsed.pending as SyncOp[]) : [],
      localOnly: parsed.localOnly === true ? true : undefined,
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

export function ensureSyncConfig(partial: { url?: string; pin: string; deviceName?: string; localOnly?: boolean }): SyncConfig {
  const prev = loadSyncConfig()
  const url = (partial.url ?? prev?.url ?? DEFAULT_SYNC_URL).trim() || DEFAULT_SYNC_URL
  const config: SyncConfig = {
    url,
    pin: partial.pin.trim(),
    deviceId: prev?.deviceId || uid('dev'),
    deviceName: (partial.deviceName ?? prev?.deviceName ?? '').trim() || prev?.deviceName || defaultDeviceName(),
    lastSyncAt: prev?.lastSyncAt,
    pending: prev?.pending ?? [],
    localOnly: partial.localOnly ? true : undefined,
  }
  saveSyncConfig(config)
  return config
}

/**
 * Brez prijave: ob odprtju vedno obstaja nastavitev. Obstoječi PIN in ime ostaneta;
 * novi telefon dobi privzeto ime in vgrajen ključ.
 */
export function autoSyncConfig(): SyncConfig {
  const prev = loadSyncConfig()
  if (prev) {
    if (prev.deviceName.trim()) return prev
    const named = { ...prev, deviceName: defaultDeviceName() }
    saveSyncConfig(named)
    return named
  }
  const fresh: SyncConfig = {
    url: DEFAULT_SYNC_URL,
    pin: '',
    deviceId: uid('dev'),
    deviceName: defaultDeviceName(),
    pending: [],
  }
  saveSyncConfig(fresh)
  return fresh
}

type SyncResponse = { ok: boolean; error?: string; pong?: boolean; articles?: RemoteArticle[] }

export function parseSyncResponseText(text: string): SyncResponse {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  if (/accounts\.google\.com|Sign in – Google|Sign in - Google|Use your Google Account/i.test(trimmed)) {
    return { ok: false, error: 'google_login' }
  }
  const jsonp = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*\((.*)\)\s*$/s)
  const raw = jsonp ? jsonp[1] : trimmed
  try {
    const parsed = JSON.parse(raw) as SyncResponse
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'bad_json' }
    return parsed
  } catch {
    return { ok: false, error: 'bad_json' }
  }
}

async function postPlain(webAppUrl: string, payload: Record<string, unknown>, timeoutMs = 25000): Promise<SyncResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(effectiveSyncUrl({ url: webAppUrl }), {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      credentials: 'omit',
      // text/plain is a CORS-safelisted type: no preflight, no custom headers.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await res.text()
    return parseSyncResponseText(text)
  } finally {
    clearTimeout(timer)
  }
}

export function jsonpRequest(webAppUrl: string, params: Record<string, string>, timeoutMs = 20000): Promise<SyncResponse> {
  return new Promise((resolve, reject) => {
    const callback = `pz_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    if (!CALLBACK_RE.test(callback)) {
      reject(new Error('callback'))
      return
    }
    const target = new URL(effectiveSyncUrl({ url: webAppUrl }))
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

function payloadOf(config: SyncConfig, action: string, ops?: SyncOp[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    action,
    pin: effectivePin(config),
    device: config.deviceName || config.deviceId,
  }
  if (ops) body.ops = ops
  return body
}

async function syncCall(config: SyncConfig, action: string, ops?: SyncOp[]): Promise<SyncResponse> {
  const url = effectiveSyncUrl(config)
  try {
    return await postPlain(url, payloadOf(config, action, ops))
  } catch (err) {
    if (typeof document === 'undefined') {
      const message = err instanceof Error ? err.message : 'network'
      return { ok: false, error: message === 'The user aborted a request.' ? 'timeout' : 'network' }
    }
    try {
      const params: Record<string, string> = {
        action,
        pin: effectivePin(config),
        device: config.deviceName || config.deviceId,
      }
      if (ops) params.ops = JSON.stringify(ops)
      return await jsonpRequest(url, params)
    } catch {
      const message = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network'
      return { ok: false, error: message }
    }
  }
}

export async function syncPing(config: SyncConfig): Promise<SyncResponse> {
  return syncCall(config, 'ping')
}

export async function syncPull(config: SyncConfig): Promise<SyncResponse> {
  return syncCall(config, 'pull')
}

export async function syncPush(config: SyncConfig, ops: SyncOp[]): Promise<SyncResponse> {
  if (!ops.length) return syncPull(config)
  let last: SyncResponse = { ok: false, error: 'empty' }
  for (let i = 0; i < ops.length; i += CHUNK) {
    last = await syncCall(config, 'push', ops.slice(i, i + CHUNK))
    if (!last.ok) return last
  }
  return last
}
