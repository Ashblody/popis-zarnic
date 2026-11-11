import type { Article, ArticleId } from './types.ts'
import { normalizeEan } from './storage.ts'

export type SyncFields = {
  skupina?: string
  sifra?: string
  ime?: string
  ean?: string
  opomba?: string
  deleted?: boolean
}

export type SyncOp = {
  id: string
  qtyDelta: number
  fields?: SyncFields
  updatedAt: string
  updatedBy: string
}

export type RemoteArticle = {
  id: string
  skupina: string
  sifra: string
  ime: string
  ean: string
  kolicina: number
  opomba: string
  updatedAt: string
  updatedBy: string
  deleted: boolean
}

export type SyncConfig = {
  url: string
  pin: string
  deviceId: string
  deviceName: string
  lastSyncAt?: string
  pending: SyncOp[]
  /** Uporabnik je izklopil skupno zalogo (ostane samo na tem telefonu). */
  localOnly?: boolean
}

export const SYNC_SETTINGS_KEY = 'popis-zarnic-sync-v1'

/** Javni naslov spletne aplikacije (ni skrivnost). PIN ostane v Script Properties. */
export const DEFAULT_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbzQGpKejoWzXcE2KDTmjreGaeQ5jH_mQqRGtv1pyjzCbFeyJRGT7cevJBGHj-ZXgy_e/exec'

export function effectiveSyncUrl(config: Partial<SyncConfig> | undefined): string {
  const url = (config?.url || DEFAULT_SYNC_URL).trim().replace(/\/+$/, '')
  return url || DEFAULT_SYNC_URL
}

/** Ključ, vgrajen ob gradnji (iz datoteke izven gita). V testih je prazen. */
export const BUILTIN_SYNC_PIN: string = typeof __BUILTIN_SYNC_PIN__ === 'string' ? __BUILTIN_SYNC_PIN__ : ''

/** Ročno vpisan PIN (Napredno) ima prednost, sicer vgrajen ključ. */
export function effectivePin(config: Partial<SyncConfig> | undefined, builtin: string = BUILTIN_SYNC_PIN): string {
  if (!config || config.localOnly) return ''
  return config.pin?.trim() || builtin.trim()
}

export function isConfigured(config: Partial<SyncConfig> | undefined, builtin: string = BUILTIN_SYNC_PIN): boolean {
  return Boolean(effectivePin(config, builtin))
}

/** Privzeto ime naprave, npr. »Telefon-k3f9«. */
export function defaultDeviceName(random: () => number = Math.random): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 4; i += 1) id += alphabet[Math.floor(random() * alphabet.length) % alphabet.length]
  return `Telefon-${id}`
}

export function compactOps(ops: SyncOp[]): SyncOp[] {
  const byId = new Map<string, SyncOp>()
  for (const op of ops) {
    const prev = byId.get(op.id)
    if (!prev) {
      byId.set(op.id, { ...op, fields: op.fields ? { ...op.fields } : undefined })
      continue
    }
    const fields = { ...(prev.fields ?? {}), ...(op.fields ?? {}) }
    const newer = op.updatedAt >= prev.updatedAt ? op : prev
    byId.set(op.id, {
      id: op.id,
      qtyDelta: prev.qtyDelta + op.qtyDelta,
      fields: Object.keys(fields).length ? fields : undefined,
      updatedAt: newer.updatedAt,
      updatedBy: newer.updatedBy,
    })
  }
  return [...byId.values()]
}

export function enqueueOp(pending: SyncOp[], op: SyncOp): SyncOp[] {
  return compactOps([...pending, op])
}

export function opFromUpsert(prev: Article | undefined, next: Article, updatedBy: string): SyncOp {
  const qtyDelta = next.kolicina - (prev?.kolicina ?? 0)
  const fields: SyncFields = {}
  if (!prev || prev.ime !== next.ime) fields.ime = next.ime
  if (!prev || prev.sifra !== next.sifra) fields.sifra = next.sifra
  if (!prev || prev.ean !== next.ean) fields.ean = next.ean
  if (!prev || prev.opomba !== next.opomba) fields.opomba = next.opomba
  if (!prev || (prev.skupina ?? '') !== (next.skupina ?? '')) fields.skupina = next.skupina ?? ''
  const deleted = Boolean((next as Article & { deleted?: boolean }).deleted)
  const wasDeleted = Boolean((prev as (Article & { deleted?: boolean }) | undefined)?.deleted)
  if (!prev || wasDeleted !== deleted) fields.deleted = deleted
  return {
    id: next.id,
    qtyDelta,
    fields: Object.keys(fields).length ? fields : undefined,
    updatedAt: next.updatedAt,
    updatedBy,
  }
}

export function pendingDeltaFor(pending: SyncOp[], id: string): number {
  return pending.filter((op) => op.id === id).reduce((sum, op) => sum + op.qtyDelta, 0)
}

export function pendingFieldsFor(pending: SyncOp[], id: string): { fields?: SyncFields; updatedAt?: string; updatedBy?: string } {
  const ops = pending.filter((op) => op.id === id && op.fields)
  if (!ops.length) return {}
  const latest = ops.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b))
  const fields = ops.reduce<SyncFields>((acc, op) => ({ ...acc, ...op.fields }), {})
  return { fields, updatedAt: latest.updatedAt, updatedBy: latest.updatedBy }
}

export function remoteToArticle(remote: RemoteArticle): Article {
  return {
    id: remote.id as ArticleId,
    sifra: remote.sifra ?? '',
    ime: remote.ime ?? '',
    ean: remote.ean ?? '',
    kolicina: Number.isFinite(remote.kolicina) ? Math.max(0, remote.kolicina) : 0,
    opomba: remote.opomba ?? '',
    skupina: remote.skupina || undefined,
    updatedAt: remote.updatedAt || '',
    updatedBy: remote.updatedBy || undefined,
    deleted: remote.deleted || undefined,
  } as Article
}

export function applyPull(
  local: Article[],
  remote: RemoteArticle[],
  pending: SyncOp[],
): Article[] {
  const pendingById = compactOps(pending)
  const pendingMap = new Map(pendingById.map((op) => [op.id, op]))
  const localMap = new Map(local.map((a) => [a.id, a]))
  const seen = new Set<string>()
  const out: Article[] = []

  for (const rem of remote) {
    seen.add(rem.id)
    const op = pendingMap.get(rem.id)
    const delta = op?.qtyDelta ?? 0
    const fieldWin = op?.fields && op.updatedAt >= (rem.updatedAt || '')
    const merged: RemoteArticle = {
      ...rem,
      kolicina: Math.max(0, rem.kolicina + delta),
      skupina: fieldWin && op.fields?.skupina !== undefined ? op.fields.skupina : rem.skupina,
      sifra: fieldWin && op.fields?.sifra !== undefined ? op.fields.sifra : rem.sifra,
      ime: fieldWin && op.fields?.ime !== undefined ? op.fields.ime : rem.ime,
      ean: fieldWin && op.fields?.ean !== undefined ? op.fields.ean : rem.ean,
      opomba: fieldWin && op.fields?.opomba !== undefined ? op.fields.opomba : rem.opomba,
      deleted: fieldWin && op.fields?.deleted !== undefined ? Boolean(op.fields.deleted) : rem.deleted,
      updatedAt: fieldWin ? op.updatedAt : rem.updatedAt,
      updatedBy: fieldWin ? op.updatedBy : rem.updatedBy,
    }
    out.push(remoteToArticle(merged))
  }

  for (const [id, op] of pendingMap) {
    if (seen.has(id)) continue
    const localArt = localMap.get(id as ArticleId)
    const base = localArt ?? remoteToArticle({
      id,
      skupina: op.fields?.skupina ?? '',
      sifra: op.fields?.sifra ?? '',
      ime: op.fields?.ime ?? '',
      ean: op.fields?.ean ?? '',
      kolicina: 0,
      opomba: op.fields?.opomba ?? '',
      updatedAt: op.updatedAt,
      updatedBy: op.updatedBy,
      deleted: Boolean(op.fields?.deleted),
    })
    out.push({
      ...base,
      kolicina: Math.max(0, (localArt ? localArt.kolicina : 0) + (localArt ? 0 : op.qtyDelta)),
      ...(op.fields ?? {}),
      id: id as ArticleId,
      updatedAt: op.updatedAt,
    } as Article)
    seen.add(id)
  }

  for (const art of local) {
    if (seen.has(art.id)) continue
    out.push(art)
  }

  return out
}


export function seedPendingFromLocal(
  local: Article[],
  remote: RemoteArticle[],
  pending: SyncOp[],
  updatedBy: string,
): SyncOp[] {
  const remMap = new Map(remote.map((r) => [r.id, r]))
  const pendingIds = new Set(compactOps(pending).map((op) => op.id))
  let next = pending
  for (const art of local) {
    if (pendingIds.has(art.id)) continue
    const rem = remMap.get(art.id)
    const prev = rem ? remoteToArticle(rem) : undefined
    const op = opFromUpsert(prev, art, art.updatedBy || updatedBy)
    if (op.qtyDelta || op.fields) {
      next = enqueueOp(next, op)
      pendingIds.add(art.id)
    }
  }
  return next
}

/** Enkratno ujemanje lokalnih artiklov (brez skupnega id) z oddaljenimi. */
export function matchLocalToRemote(local: Article[], remote: RemoteArticle[]): { local: Article[]; remaps: Array<{ from: string; to: string }> } {
  const usedRemote = new Set<string>()
  const remaps: Array<{ from: string; to: string }> = []
  const remoteById = new Map(remote.map((r) => [r.id, r]))

  function take(id: string): RemoteArticle | undefined {
    if (usedRemote.has(id)) return undefined
    const r = remoteById.get(id)
    if (r) usedRemote.add(id)
    return r
  }

  function findUnique(pred: (r: RemoteArticle) => boolean): RemoteArticle | undefined {
    const hits = remote.filter((r) => !usedRemote.has(r.id) && pred(r))
    return hits.length === 1 ? hits[0] : undefined
  }

  function findFirst(pred: (r: RemoteArticle) => boolean): RemoteArticle | undefined {
    return remote.find((r) => !usedRemote.has(r.id) && pred(r))
  }

  const next = local.map((art) => {
    if (remoteById.has(art.id) && !usedRemote.has(art.id)) {
      take(art.id)
      return art
    }
    const byEan =
      art.ean &&
      findUnique((r) => Boolean(r.ean) && normalizeEan(r.ean) === normalizeEan(art.ean) && r.deleted !== true)
    if (byEan) {
      remaps.push({ from: art.id, to: byEan.id })
      usedRemote.add(byEan.id)
      return { ...art, id: byEan.id as ArticleId }
    }
    const bySifra =
      art.sifra.trim() &&
      findUnique(
        (r) => r.sifra.trim() === art.sifra.trim() && r.ime === art.ime && r.deleted !== true,
      )
    if (bySifra) {
      remaps.push({ from: art.id, to: bySifra.id })
      usedRemote.add(bySifra.id)
      return { ...art, id: bySifra.id as ArticleId }
    }
    const byImeQty = findFirst(
      (r) => r.ime === art.ime && r.kolicina === art.kolicina && r.deleted !== true,
    )
    if (byImeQty) {
      remaps.push({ from: art.id, to: byImeQty.id })
      usedRemote.add(byImeQty.id)
      return { ...art, id: byImeQty.id as ArticleId }
    }
    const byIme = findFirst((r) => r.ime === art.ime && r.deleted !== true)
    if (byIme) {
      remaps.push({ from: art.id, to: byIme.id })
      usedRemote.add(byIme.id)
      return { ...art, id: byIme.id as ArticleId }
    }
    return art
  })

  return { local: next, remaps }
}

export function opsAfterRemap(pending: SyncOp[], remaps: Array<{ from: string; to: string }>): SyncOp[] {
  if (!remaps.length) return pending
  const map = new Map(remaps.map((r) => [r.from, r.to]))
  return compactOps(pending.map((op) => ({ ...op, id: map.get(op.id) ?? op.id })))
}

export function parseSetupLink(raw: string): { url: string; pin: string } | undefined {
  const text = raw.trim()
  if (!text) return undefined
  try {
    const href = text.includes('://') || text.startsWith('#') ? text : `https://placeholder.local/${text}`
    const url = new URL(href, 'https://ashblody.github.io/popis-zarnic/')
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash.includes('=') ? hash : ''
    const params = new URLSearchParams(url.search)
    const hashParams = new URLSearchParams(hashQuery)
    const web = params.get('url') || hashParams.get('url') || ''
    const pin = params.get('pin') || hashParams.get('pin') || ''
    if (web && pin) return { url: web, pin }
  } catch {
    /* fall through */
  }
  return undefined
}

export function buildSetupLink(appBase: string, webAppUrl: string, pin: string): string {
  const base = appBase.endsWith('/') ? appBase : `${appBase}/`
  const params = new URLSearchParams({ url: webAppUrl, pin })
  return `${base}#setup?${params.toString()}`
}

export function formatSyncTime(iso: string): string {
  try {
    const then = new Date(iso)
    return then.toLocaleTimeString('sl-SI', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Ljubljana',
    })
  } catch {
    return iso
  }
}

export function syncStatusText(opts: {
  configured: boolean
  online: boolean
  syncing?: boolean
  error?: string
  lastSyncAt?: string
}): string {
  if (!opts.configured) return ''
  if (!opts.online) return 'Brez povezave'
  if (opts.syncing) return 'Sinhronizacija…'
  if (opts.error) return 'Napaka sinhronizacije'
  if (opts.lastSyncAt) return `Sinhronizirano ${formatSyncTime(opts.lastSyncAt)}`
  return 'Skupna zaloga'
}
