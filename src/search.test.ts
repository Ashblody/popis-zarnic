import { describe, expect, it } from 'vitest'
import { articleMatches, normalizeSearch } from './search.ts'

describe('normalizeSearch', () => {
  it('odstrani slovenske šumnike', () => {
    expect(normalizeSearch('Žarnica Črna Škatla')).toBe('zarnica crna skatla')
    expect(normalizeSearch('  Ćevap  ')).toBe('cevap')
  })
})

describe('articleMatches', () => {
  const article = { sifra: 'ŽAR-104', ime: 'Žarnica E27 10W toplo', ean: '3830001234567' }

  it('najde po imenu brez šumnikov', () => {
    expect(articleMatches('zarnica', article)).toBe(true)
    expect(articleMatches('ŽAR', article)).toBe(true)
  })

  it('najde po šifri in EAN', () => {
    expect(articleMatches('zar-104', article)).toBe(true)
    expect(articleMatches('3830001234567', article)).toBe(true)
  })

  it('ne najde tujega niza', () => {
    expect(articleMatches('halogen', article)).toBe(false)
  })

  it('prazen iskalni niz pokaže vse', () => {
    expect(articleMatches('', article)).toBe(true)
    expect(articleMatches('   ', article)).toBe(true)
  })
})
