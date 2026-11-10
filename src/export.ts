import * as XLSX from 'xlsx'
import type { Article } from './types.ts'

export const EXPORT_COLUMNS = ['Šifra', 'Ime', 'EAN', 'Količina', 'Opomba', 'Zadnja sprememba'] as const

export function exportFileName(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `popis-zarnic-${y}-${m}-${d}.xlsx`
}

export function articlesToRows(articles: Article[]): (string | number)[][] {
  const sorted = [...articles].sort((a, b) =>
    a.sifra.localeCompare(b.sifra, 'sl', { sensitivity: 'base' }) ||
    a.ime.localeCompare(b.ime, 'sl', { sensitivity: 'base' }),
  )
  return sorted.map((a) => [a.sifra, a.ime, a.ean, a.kolicina, a.opomba, a.updatedAt])
}

export function buildWorkbook(articles: Article[]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...EXPORT_COLUMNS],
    ...articlesToRows(articles),
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Popis')
  return workbook
}

export function workbookToArrayBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  const written = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const bytes = written instanceof ArrayBuffer ? new Uint8Array(written) : new Uint8Array(written)
  const copy = new Uint8Array(bytes)
  return copy.buffer
}
