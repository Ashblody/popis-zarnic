import { describe, expect, it } from 'vitest'
import { findByEan, parseInventory, resetQuantities, upsertArticle } from './storage.ts'
import type { Article, InventoryData } from './types.ts'

function art(partial: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sifra: 'S1',
    ime: 'Žarnica',
    ean: '123',
    kolicina: 4,
    opomba: '',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...partial,
  }
}

describe('parseInventory', () => {
  it('vrne prazen seznam ob smetju', () => {
    expect(parseInventory(null).articles).toEqual([])
    expect(parseInventory({ version: 1, articles: [{ id: 1 }] }).articles).toEqual([])
  })

  it('ohrani veljavne artikle in pripravljena polja za kasneje', () => {
    const parsed = parseInventory({
      version: 1,
      articles: [art({ id: 'art-1' as Article['id'] })],
      importMeta: { fileName: 'zaloga.xlsx', importedAt: '2026-11-10T00:00:00.000Z' },
      sync: { sheetId: 'abc', lastSyncAt: '2026-11-10T00:00:00.000Z' },
    })
    expect(parsed.articles).toHaveLength(1)
    expect(parsed.importMeta?.fileName).toBe('zaloga.xlsx')
    expect(parsed.sync?.sheetId).toBe('abc')
  })
})

describe('findByEan in reset', () => {
  const data: InventoryData = {
    version: 1,
    articles: [
      art({ id: 'a1' as Article['id'], ean: ' 383 001 ', kolicina: 7 }),
      art({ id: 'a2' as Article['id'], ean: '999', kolicina: 0, ime: 'LED' }),
    ],
  }

  it('najde EAN brez presledkov', () => {
    expect(findByEan(data, '383001')?.id).toBe('a1')
    expect(findByEan(data, '000')).toBeUndefined()
  })

  it('ponastavi samo količine', () => {
    const next = resetQuantities(data, '2026-11-10T09:00:00.000Z')
    expect(next.articles.map((a) => a.kolicina)).toEqual([0, 0])
    expect(next.articles[0]?.ime).toBe('Žarnica')
    expect(next.articles[0]?.updatedAt).toBe('2026-11-10T09:00:00.000Z')
    expect(next.articles[1]?.updatedAt).toBe('2026-11-01T10:00:00.000Z')
  })

  it('doda nov artikel na vrh', () => {
    const created = art({ id: 'a3' as Article['id'], ime: 'Nova' })
    const next = upsertArticle(data, created)
    expect(next.articles[0]?.id).toBe('a3')
    expect(next.articles).toHaveLength(3)
  })
})
