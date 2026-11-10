import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  EXPORT_COLUMNS,
  articlesToRows,
  buildWorkbook,
  exportFileName,
  workbookToArrayBuffer,
} from './export.ts'
import type { Article } from './types.ts'

const articles: Article[] = [
  {
    id: 'b' as Article['id'],
    sifra: 'B2',
    ime: 'Halogen',
    ean: '222',
    kolicina: 3,
    opomba: 'polica 2',
    updatedAt: '2026-11-02T08:00:00.000Z',
  },
  {
    id: 'a' as Article['id'],
    sifra: 'A1',
    ime: 'Žarnica E27',
    ean: '111',
    kolicina: 10,
    opomba: '',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
]

describe('export', () => {
  it('sestavi ime datoteke z lokalnim datumom', () => {
    expect(exportFileName(new Date(2026, 10, 10))).toBe('popis-zarnic-2026-11-10.xlsx')
  })

  it('uredi vrstice in ohrani stolpce', () => {
    const rows = articlesToRows(articles)
    const bySifra = Object.fromEntries(rows.map((r) => [r[0], r]))
    expect(bySifra.A1?.[1]).toBe('Žarnica E27')
    expect(bySifra.A1?.[2]).toBe('111')
    expect(bySifra.A1?.[3]).toBe(10)
    expect(bySifra.A1?.[6]).toBe('2026-11-01T08:00:00.000Z')
    expect(bySifra.B2?.[1]).toBe('Halogen')
  })

  it('zgradi veljaven xlsx, ki ga SheetJS prebere nazaj', () => {
    const book = buildWorkbook(articles)
    const buffer = workbookToArrayBuffer(book)
    const parsed = XLSX.read(buffer, { type: 'array' })
    expect(parsed.SheetNames).toEqual(['Popis', 'Seznam'])
    const list = parsed.Sheets.Seznam
    expect(list).toBeTruthy()
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(list!, { header: 1 })
    expect(rows[0]).toEqual([...EXPORT_COLUMNS])
    expect(rows).toHaveLength(3)
    const imes = rows.slice(1).map((r) => r[1])
    expect(imes).toContain('Žarnica E27')
    expect(imes).toContain('Halogen')
    const layout = XLSX.utils.sheet_to_json<(string | number)[]>(parsed.Sheets.Popis!, { header: 1, defval: '' })
    const names = layout.flat().filter((c) => typeof c === 'string' && c)
    expect(names).toContain('Žarnica E27')
    expect(names).toContain('Halogen')
  })
})
