/** Čiste funkcije za filter, vsote, zgodovino, popise, razveljavitev, CSV in varnostno kopijo. */
import type { Article, InventoryData } from './types.ts'
import { articleMatches } from './search.ts'
import { parseInventory } from './storage.ts'

export type QuickFilter = 'all' | 'zero' | 'recent'

export const RECENT_MS = 24 * 60 * 60 * 1000

export function filterArticles(articles: Article[], query: string, filter: QuickFilter, now = Date.now()): Article[] {
  const live = articles.filter((a) => !a.deleted && articleMatches(query, a))
  if (filter === 'zero') return live.filter((a) => a.kolicina === 0)
  if (filter === 'recent') {
    return live
      .filter((a) => {
        const t = Date.parse(a.updatedAt)
        return Number.isFinite(t) && now - t <= RECENT_MS
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  return live
}

export function totals(articles: Article[]): { count: number; pcs: number } {
  const live = articles.filter((a) => !a.deleted)
  return { count: live.length, pcs: live.reduce((sum, a) => sum + (Number.isFinite(a.kolicina) ? a.kolicina : 0), 0) }
}

export type HistoryEntry = {
  at: string
  device: string
  articleId: string
  ime: string
  before: number
  after: number
  /** qty = sprememba količine; undo = razveljavitev; delete = izbris; restore = obnova iz kopije */
  kind: 'qty' | 'undo' | 'delete'
}

export const HISTORY_LIMIT = 500

export function addHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_LIMIT)
}

export function formatDelta(entry: Pick<HistoryEntry, 'before' | 'after'>): string {
  const d = entry.after - entry.before
  return d > 0 ? `+${d}` : String(d)
}

export type LastChange = {
  articleId: string
  ime: string
  before: number
  after: number
  at: string
}

/**
 * Razveljavi zadnjo spremembo količine kot nasprotno spremembo (delta),
 * da skupna zaloga ne izgubi tujih sprememb vmes.
 */
export function undoQuantity(current: number, change: Pick<LastChange, 'before' | 'after'>): number {
  return Math.max(0, current - (change.after - change.before))
}

export type PopisItem = { ime: string; sifra: string; ean: string; skupina: string; kolicina: number }

export type Popis = {
  id: string
  at: string
  device: string
  count: number
  pcs: number
  items: PopisItem[]
}

export function makeSnapshot(articles: Article[], at: string, device: string, id = `popis-${at}`): Popis {
  const live = articles.filter((a) => !a.deleted)
  const { count, pcs } = totals(live)
  return {
    id,
    at,
    device,
    count,
    pcs,
    items: live.map((a) => ({ ime: a.ime, sifra: a.sifra, ean: a.ean, skupina: a.skupina ?? '', kolicina: a.kolicina })),
  }
}

export function popisToArticles(p: Popis): Article[] {
  return p.items.map(
    (item, i) =>
      ({
        id: `${p.id}-${i}`,
        ime: item.ime,
        sifra: item.sifra,
        ean: item.ean,
        skupina: item.skupina || undefined,
        kolicina: item.kolicina,
        opomba: '',
        updatedAt: p.at,
      }) as Article,
  )
}

function csvCell(value: string | number): string {
  const s = String(value ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** CSV s podpičjem (slovenski Excel ga odpre pravilno) in BOM za šumnike. */
export function articlesToCsv(articles: Article[], lokacija: Record<string, string> = {}): string {
  const header = ['Šifra', 'Ime', 'EAN', 'Količina', 'Skupina', 'Lokacija', 'Opomba', 'Zadnja sprememba']
  const rows = articles
    .filter((a) => !a.deleted)
    .map((a) => [a.sifra, a.ime, a.ean, a.kolicina, a.skupina ?? '', lokacija[a.id] ?? '', a.opomba, a.updatedAt])
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

export function csvFileName(now = new Date(), prefix = 'popis-zarnic'): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${prefix}-${y}-${m}-${d}.csv`
}

export type LocalExtras = {
  lokacija: Record<string, string>
  history: HistoryEntry[]
  popisi: Popis[]
  lastChange?: LastChange
}

export function emptyExtras(): LocalExtras {
  return { lokacija: {}, history: [], popisi: [] }
}

export function parseExtras(raw: unknown): LocalExtras {
  const out = emptyExtras()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (r.lokacija && typeof r.lokacija === 'object') {
    for (const [k, v] of Object.entries(r.lokacija as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out.lokacija[k] = v
    }
  }
  if (Array.isArray(r.history)) {
    out.history = r.history
      .filter(
        (h): h is HistoryEntry =>
          !!h && typeof h === 'object' && typeof (h as HistoryEntry).at === 'string' && typeof (h as HistoryEntry).articleId === 'string' &&
          typeof (h as HistoryEntry).before === 'number' && typeof (h as HistoryEntry).after === 'number',
      )
      .slice(0, HISTORY_LIMIT)
  }
  if (Array.isArray(r.popisi)) {
    out.popisi = r.popisi.filter(
      (p): p is Popis => !!p && typeof p === 'object' && typeof (p as Popis).id === 'string' && Array.isArray((p as Popis).items),
    )
  }
  if (r.lastChange && typeof r.lastChange === 'object') {
    const c = r.lastChange as LastChange
    if (typeof c.articleId === 'string' && typeof c.before === 'number' && typeof c.after === 'number') out.lastChange = c
  }
  return out
}

export type Backup = {
  app: 'popis-zarnic'
  backupVersion: 1
  createdAt: string
  data: InventoryData
  extras: LocalExtras
  photos?: Record<string, string>
}

export function buildBackup(data: InventoryData, extras: LocalExtras, createdAt: string, photos?: Record<string, string>): Backup {
  return { app: 'popis-zarnic', backupVersion: 1, createdAt, data, extras, ...(photos && Object.keys(photos).length ? { photos } : {}) }
}

/** Vrne undefined, če datoteka ni varnostna kopija te aplikacije. */
export function parseBackup(text: string): Backup | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.app !== 'popis-zarnic' || !r.data) return undefined
  const data = parseInventory(r.data)
  const photos: Record<string, string> = {}
  if (r.photos && typeof r.photos === 'object') {
    for (const [k, v] of Object.entries(r.photos as Record<string, unknown>)) {
      if (typeof v === 'string' && v.startsWith('data:image/')) photos[k] = v
    }
  }
  return {
    app: 'popis-zarnic',
    backupVersion: 1,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    data,
    extras: parseExtras(r.extras),
    ...(Object.keys(photos).length ? { photos } : {}),
  }
}

export function backupFileName(now = new Date()): string {
  return csvFileName(now, 'popis-zarnic-kopija').replace(/\.csv$/, '.json')
}

/** Mere slike, pomanjšane tako, da daljša stranica ni večja od max. */
export function fitWithin(width: number, height: number, max = 800): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
