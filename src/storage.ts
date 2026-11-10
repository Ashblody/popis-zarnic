import { DATA_KEY, type Article, type ArticleId, type InventoryData } from './types.ts'

export function emptyData(): InventoryData {
  return { version: 1, articles: [] }
}

export function uid(prefix = 'art'): ArticleId {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `${prefix}-${crypto.randomUUID()}`
      : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return raw as ArticleId
}

export function isArticle(raw: unknown): raw is Article {
  if (!raw || typeof raw !== 'object') return false
  const a = raw as Record<string, unknown>
  return (
    typeof a.id === 'string' &&
    typeof a.sifra === 'string' &&
    typeof a.ime === 'string' &&
    typeof a.ean === 'string' &&
    typeof a.kolicina === 'number' &&
    Number.isFinite(a.kolicina) &&
    typeof a.opomba === 'string' &&
    typeof a.updatedAt === 'string' &&
    (a.skupina === undefined || typeof a.skupina === 'string') &&
    (a.updatedBy === undefined || typeof a.updatedBy === 'string') &&
    (a.deleted === undefined || typeof a.deleted === 'boolean')
  )
}

export function parseInventory(raw: unknown): InventoryData {
  if (!raw || typeof raw !== 'object') return emptyData()
  const doc = raw as Record<string, unknown>
  const articles = Array.isArray(doc.articles) ? doc.articles.filter(isArticle) : []
  const data: InventoryData = { version: 1, articles }
  if (doc.importMeta && typeof doc.importMeta === 'object') {
    const m = doc.importMeta as Record<string, unknown>
    if (typeof m.fileName === 'string' && typeof m.importedAt === 'string') {
      data.importMeta = { fileName: m.fileName, importedAt: m.importedAt }
    }
  }
  if (doc.sync && typeof doc.sync === 'object') {
    const s = doc.sync as Record<string, unknown>
    data.sync = {
      sheetId: typeof s.sheetId === 'string' ? s.sheetId : undefined,
      lastSyncAt: typeof s.lastSyncAt === 'string' ? s.lastSyncAt : undefined,
    }
  }
  return data
}

export function loadData(): InventoryData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (!raw) return emptyData()
    return parseInventory(JSON.parse(raw) as unknown)
  } catch {
    return emptyData()
  }
}

export function saveData(data: InventoryData): void {
  data.version = 1
  localStorage.setItem(DATA_KEY, JSON.stringify(data))
}

export function normalizeEan(ean: string): string {
  return ean.replace(/\s+/g, '').trim()
}

export function findByEan(data: InventoryData, ean: string): Article | undefined {
  const needle = normalizeEan(ean)
  if (!needle) return undefined
  return data.articles.find((a) => !a.deleted && normalizeEan(a.ean) === needle)
}

export function findById(data: InventoryData, id: string): Article | undefined {
  return data.articles.find((a) => a.id === id)
}

export function findBySifra(data: InventoryData, sifra: string): Article | undefined {
  const needle = sifra.trim()
  if (!needle) return undefined
  return data.articles.find((a) => !a.deleted && a.sifra.trim() === needle)
}

export function upsertArticle(data: InventoryData, article: Article): InventoryData {
  const existing = data.articles.findIndex((a) => a.id === article.id)
  const articles =
    existing === -1
      ? [article, ...data.articles]
      : data.articles.map((a, i) => (i === existing ? article : a))
  return { ...data, articles }
}

export function resetQuantities(data: InventoryData, nowIso: string): InventoryData {
  return {
    ...data,
    articles: data.articles.map((a) =>
      a.kolicina === 0
        ? a
        : { ...a, kolicina: 0, updatedAt: nowIso },
    ),
  }
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sl-SI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
    /* offline first-load or restricted context */
  })
}
