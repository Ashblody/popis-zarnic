import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSpreadsheetBuffer } from './importSpreadsheet.ts'
import { buildWorkbook, workbookToArrayBuffer } from './export.ts'
import { STARTER_ITEMS } from './starterCatalog.ts'
import { uid } from './storage.ts'
import type { Article as Art } from './types.ts'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures')

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixtures, name)))
}

function toArticles(items = STARTER_ITEMS): Art[] {
  return items.map((item, i) => ({
    id: uid(),
    ime: item.ime,
    sifra: item.sifra,
    ean: i === 0 ? '12345670' : item.ean, // one EAN to check round-trip enrichment
    kolicina: item.kolicina,
    opomba: item.opomba,
    skupina: item.skupina,
    updatedAt: '2026-11-09T10:00:00.000Z',
  }))
}

describe('uvoz inventure', () => {
  it('iz uradnega XLT dobi 81 artiklov in 2643 kos, podvojitev ohrani', () => {
    const result = parseSpreadsheetBuffer(readFixture('inventura-lucke.xlt'), 'inventura-lucke.xlt')
    expect(result.items).toHaveLength(81)
    expect(result.total).toBe(2643)
    expect(result.duplicates).toEqual(['NL-T5 13W/840/65'])
    const same = result.items.filter((i) => i.ime === 'NL-T5 13W/840/65')
    expect(same).toHaveLength(2)
    expect(same.map((i) => i.kolicina)).toEqual([23, 23])
    expect(result.items[0]?.skupina).toBe('NL-T5')
  })

  it('enako prebere ODS, print XLT in CSV', () => {
    for (const name of ['inventura-lucke.ods', 'inventura-luck-print.xlt', 'inventura-lucke.csv']) {
      const result = parseSpreadsheetBuffer(readFixture(name), name)
      expect(result.items, name).toHaveLength(81)
      expect(result.total, name).toBe(2643)
      expect(result.duplicates, name).toEqual(['NL-T5 13W/840/65'])
    }
  })

  it('izvoz → uvoz ohrani 81 / 2643 in EAN s seznama', () => {
    const articles = toArticles()
    const buffer = workbookToArrayBuffer(buildWorkbook(articles))
    const result = parseSpreadsheetBuffer(new Uint8Array(buffer), 'roundtrip.xlsx')
    expect(result.items).toHaveLength(81)
    expect(result.total).toBe(2643)
    expect(result.duplicates).toEqual(['NL-T5 13W/840/65'])
    const withEan = result.items.filter((i) => i.ean)
    expect(withEan).toHaveLength(1)
    expect(withEan[0]?.ime).toBe(articles[0]?.ime)
    expect(withEan[0]?.ean).toBe('12345670')
  })

  it('začetni seznam je isti popis 81 / 2643', () => {
    expect(STARTER_ITEMS).toHaveLength(81)
    expect(STARTER_ITEMS.reduce((s, i) => s + i.kolicina, 0)).toBe(2643)
  })
})
