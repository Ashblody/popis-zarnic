import { describe, expect, it } from 'vitest'
import type { Article, ArticleId } from './types.ts'
import {
  addHistory,
  articlesToCsv,
  buildBackup,
  filterArticles,
  fitWithin,
  formatDelta,
  HISTORY_LIMIT,
  makeSnapshot,
  parseBackup,
  popisToArticles,
  totals,
  undoQuantity,
  type HistoryEntry,
} from './features.ts'

const NOW = Date.parse('2026-11-11T10:00:00Z')

function art(id: string, ime: string, kolicina: number, updatedAt = '2026-11-01T08:00:00Z', extra: Partial<Article> = {}): Article {
  return { id: id as ArticleId, ime, sifra: '', ean: '', kolicina, opomba: '', updatedAt, ...extra }
}

const LIST = [
  art('a', 'NL-T5 13W/840/65', 23),
  art('b', 'RX-L 36W/840', 0),
  art('c', 'RL-PAR 16 50/840', 160, '2026-11-11T09:30:00Z'),
  art('d', 'Izbrisana', 5, '2026-11-11T09:59:00Z', { deleted: true }),
]

describe('filter in vsote', () => {
  it('Vse skrije izbrisane, Brez zaloge pokaže samo 0, Nedavno zadnjih 24 ur', () => {
    expect(filterArticles(LIST, '', 'all', NOW).map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(filterArticles(LIST, '', 'zero', NOW).map((a) => a.id)).toEqual(['b'])
    expect(filterArticles(LIST, '', 'recent', NOW).map((a) => a.id)).toEqual(['c'])
  })

  it('iskanje in filter delujeta skupaj', () => {
    expect(filterArticles(LIST, 'rx', 'zero', NOW).map((a) => a.id)).toEqual(['b'])
    expect(filterArticles(LIST, 'nl-t5', 'zero', NOW)).toEqual([])
  })

  it('vsota kosov in artiklov brez izbrisanih', () => {
    expect(totals(LIST)).toEqual({ count: 3, pcs: 183 })
  })
})

describe('razveljavi', () => {
  it('odšteje samo svojo spremembo, ne prepiše tujih', () => {
    // 23 → 24 na tem telefonu, vmes drug telefon +5 → 29; razveljavi da 28
    expect(undoQuantity(29, { before: 23, after: 24 })).toBe(28)
    expect(undoQuantity(1, { before: 0, after: 10 })).toBe(0)
  })
})

describe('zgodovina', () => {
  it('novo spredaj, omejena dolžina, +/- besedilo', () => {
    const e = (i: number): HistoryEntry => ({ at: `t${i}`, device: 'Telefon-ab12', articleId: 'a', ime: 'x', before: i, after: i + 1, kind: 'qty' })
    let h: HistoryEntry[] = []
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) h = addHistory(h, e(i))
    expect(h).toHaveLength(HISTORY_LIMIT)
    expect(h[0]!.at).toBe(`t${HISTORY_LIMIT + 4}`)
    expect(formatDelta({ before: 3, after: 5 })).toBe('+2')
    expect(formatDelta({ before: 5, after: 3 })).toBe('-2')
  })
})

describe('Zaključi popis', () => {
  it('posnetek z datumom in vsotami, izvoz nazaj v artikle', () => {
    const snap = makeSnapshot(LIST, '2026-11-11T10:00:00Z', 'Telefon-ab12')
    expect(snap.count).toBe(3)
    expect(snap.pcs).toBe(183)
    expect(snap.items.map((i) => i.ime)).not.toContain('Izbrisana')
    const back = popisToArticles(snap)
    expect(back.map((a) => a.kolicina)).toEqual([23, 0, 160])
  })
})

describe('CSV', () => {
  it('podpičje, BOM, šumniki in narekovaji', () => {
    const csv = articlesToCsv([art('a', 'Žarnica "topla"; E27', 3, '2026-11-11T09:00:00Z', { sifra: 'Š-1' })], { a: 'klet' })
    expect(csv.startsWith('\uFEFFŠifra;Ime;EAN;Količina;Skupina;Lokacija;Opomba')).toBe(true)
    expect(csv).toContain('Š-1;"Žarnica ""topla""; E27";;3;;klet;;')
  })
})

describe('varnostna kopija', () => {
  it('JSON tja in nazaj, tuje datoteke zavrne', () => {
    const data = { version: 1 as const, articles: LIST }
    const extras = { lokacija: { a: 'klet' }, history: [], popisi: [] }
    const text = JSON.stringify(buildBackup(data, extras, '2026-11-11T10:00:00Z', { a: 'data:image/jpeg;base64,AAAA' }))
    const back = parseBackup(text)
    expect(back?.data.articles).toHaveLength(4)
    expect(back?.extras.lokacija).toEqual({ a: 'klet' })
    expect(back?.photos).toEqual({ a: 'data:image/jpeg;base64,AAAA' })
    expect(parseBackup('{"foo":1}')).toBeUndefined()
    expect(parseBackup('ni json')).toBeUndefined()
  })
})

describe('slika', () => {
  it('pomanjša na 800 px po daljši stranici, manjših ne poveča', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 600, height: 800 })
    expect(fitWithin(500, 300)).toEqual({ width: 500, height: 300 })
  })
})
