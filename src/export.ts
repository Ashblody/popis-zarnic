import * as XLSX from 'xlsx'
import type { Article } from './types.ts'
import { columnForGroup, inferGroupFromName } from './group.ts'

export const EXPORT_COLUMNS = ['Šifra', 'Ime', 'EAN', 'Količina', 'Opomba', 'Skupina', 'Zadnja sprememba'] as const

/** Stolpci parov ime/količina kot v njihovem popisu: B/C, E/F, H/I, L/M. */
export const LAYOUT_NAME_COLS = [1, 4, 7, 11] as const

export function exportFileName(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `popis-zarnic-${y}-${m}-${d}.xlsx`
}

export function articlesToRows(articles: Article[]): (string | number)[][] {
  const sorted = [...articles].sort(
    (a, b) =>
      (a.skupina ?? '').localeCompare(b.skupina ?? '', 'sl', { sensitivity: 'base' }) ||
      a.sifra.localeCompare(b.sifra, 'sl', { sensitivity: 'base' }) ||
      a.ime.localeCompare(b.ime, 'sl', { sensitivity: 'base' }),
  )
  return sorted.map((a) => [
    a.sifra,
    a.ime,
    a.ean,
    a.kolicina,
    a.opomba,
    a.skupina ?? inferGroupFromName(a.ime),
    a.updatedAt,
  ])
}

function groupKey(article: Article): string {
  return article.skupina?.trim() || inferGroupFromName(article.ime) || 'Ostalo'
}

/** 4 stolpci parov ime/količina, prazna vrstica med skupinami. */
export function articlesToLayoutGrid(articles: Article[]): (string | number)[][] {
  const buckets: Article[][][] = [[], [], [], []]
  const byGroup = new Map<string, Article[]>()
  for (const article of articles) {
    const key = groupKey(article)
    const list = byGroup.get(key)
    if (list) list.push(article)
    else byGroup.set(key, [article])
  }
  const groupNames = [...byGroup.keys()].sort((a, b) => a.localeCompare(b, 'sl', { sensitivity: 'base' }))
  for (const name of groupNames) {
    const members = (byGroup.get(name) ?? []).slice().sort((a, b) => a.ime.localeCompare(b.ime, 'sl', { sensitivity: 'base' }))
    const col = columnForGroup(name, members[0]?.ime ?? '')
    buckets[col]!.push(members)
  }

  const columns: (string | number)[][][] = buckets.map((groups) => {
    const cells: (string | number)[][] = []
    groups.forEach((group, index) => {
      if (index > 0) cells.push(['', ''])
      for (const article of group) cells.push([article.ime, article.kolicina])
    })
    return cells
  })

  const height = Math.max(0, ...columns.map((c) => c.length))
  const rows: (string | number)[][] = []
  for (let r = 0; r < height; r += 1) {
    const row: (string | number)[] = []
    const lastCol = LAYOUT_NAME_COLS[LAYOUT_NAME_COLS.length - 1]! + 2
    for (let i = 0; i < lastCol; i += 1) row[i] = ''
    LAYOUT_NAME_COLS.forEach((nameCol, index) => {
      const pair = columns[index]?.[r]
      if (!pair) return
      row[nameCol] = pair[0] ?? ''
      row[nameCol + 1] = pair[1] ?? ''
    })
    rows.push(row)
  }
  return rows
}

export function buildWorkbook(articles: Article[]): XLSX.WorkBook {
  const layout = articlesToLayoutGrid(articles)
  const layoutSheet = XLSX.utils.aoa_to_sheet(layout.length ? layout : [['']])
  const listSheet = XLSX.utils.aoa_to_sheet([[...EXPORT_COLUMNS], ...articlesToRows(articles)])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, layoutSheet, 'Popis')
  XLSX.utils.book_append_sheet(workbook, listSheet, 'Seznam')
  return workbook
}

export function workbookToArrayBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  const written = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const bytes = written instanceof ArrayBuffer ? new Uint8Array(written) : new Uint8Array(written)
  const copy = new Uint8Array(bytes)
  return copy.buffer
}
