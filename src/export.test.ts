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

  it('uredi vrstice po šifri in ohrani stolpce', () => {
    const rows = articlesToRows(articles)
    expect(rows[0]?.[0]).toBe('A1')
    expect(rows[1]?.[0]).toBe('B2')
    expect(rows[0]).toEqual(['A1', 'Žarnica E27', '111', 10, '', '2026-11-01T08:00:00.000Z'])
  })

  it('zgradi veljaven xlsx, ki ga SheetJS prebere nazaj', () => {
    const book = buildWorkbook(articles)
    const buffer = workbookToArrayBuffer(book)
    const parsed = XLSX.read(buffer, { type: 'array' })
    const sheet = parsed.Sheets.Popis
    expect(sheet).toBeTruthy()
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet!, { header: 1 })
    expect(rows[0]).toEqual([...EXPORT_COLUMNS])
    expect(rows).toHaveLength(3)
    expect(rows[1]?.[1]).toBe('Žarnica E27')
    expect(rows[2]?.[3]).toBe(3)
  })
})
