import { describe, expect, it } from 'vitest'
import { matchScore, rankArticlesWithoutEan } from './linkMatch.ts'

const articles = [
  { id: '1', ime: 'NL-T5 13W/840/65', ean: '', skupina: 'NL-T5' },
  { id: '2', ime: 'RL-PAR 16 50/840/WFL 4,3W', ean: '', skupina: 'RL-PAR' },
  { id: '3', ime: 'RCC-TC 70W NDL/RX7S', ean: '3830000000000', skupina: 'RCC-TC' },
  { id: '4', ime: 'NL-T8 36W/840-1G13', ean: '', skupina: 'NL-T8' },
]

describe('povezava EAN', () => {
  it('artikle z EAN izloči, ostale razvrsti po ujemanju z OCR/QR', () => {
    const ranked = rankArticlesWithoutEan(articles, 'NL-T5 13W 840')
    expect(ranked.map((r) => r.article.id)).toEqual(['1', '4', '2'])
    expect(ranked[0]?.article.ime).toBe('NL-T5 13W/840/65')
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  it('prazno iskanje vrne vse brez EAN, z oceno 0', () => {
    const ranked = rankArticlesWithoutEan(articles, '')
    expect(ranked).toHaveLength(3)
    expect(ranked.every((r) => r.score === 0)).toBe(true)
  })

  it('točen naziv ima visoko oceno', () => {
    expect(matchScore('RL-PAR 16 50/840/WFL 4,3W', articles[1]!)).toBe(100)
  })
})
