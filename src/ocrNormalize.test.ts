import { describe, expect, it } from 'vitest'
import { compactLampText, formatOcrLabel, lampTokens, normalizeLampText } from './ocrNormalize.ts'
import { matchScore, topMatches } from './linkMatch.ts'
import { STARTER_ITEMS } from './starterCatalog.ts'

describe('normalizeLampText', () => {
  it('uskladi ločila, velike črke in zmede O/0 ter l/I/1, brez menjave L v NL', () => {
    expect(normalizeLampText('NL-T5 l3W/84O/65')).toBe('NL-T5 13W/840/65')
    expect(normalizeLampText('NLT5 13W 840 65')).toBe('NLT5 13W 840 65')
    expect(compactLampText('NL-T5 l3W/84O/65')).toBe(compactLampText('NL-T5 13W/840/65'))
    expect(compactLampText('NLT5 13W 840 65')).toBe(compactLampText('NL-T5 13W/840/65'))
    expect(normalizeLampText('  rl-par 16  50 / 840 / wfl ')).toContain('RL-PAR')
  })

  it('žetoni vključujejo 13W, 840 in T5', () => {
    const tokens = lampTokens('NL-T5 13W/840/65')
    expect(tokens).toEqual(expect.arrayContaining(['NL', 'T5', '13W', '840', '65']))
    expect(lampTokens('NLT5 13W 840 65')).toEqual(expect.arrayContaining(['NL', 'T5', '13W', '840', '65']))
  })

  it('formatOcrLabel očisti predlog za obrazec', () => {
    expect(formatOcrLabel('nl-t5 l3W / 84O / 65')).toBe('NL-T5 13W/840/65')
  })
})

describe('ujemanje s seznamom 81 artiklov', () => {
  it('šumen OCR in zapis brez ločil mapirata na NL-T5 13W/840/65', () => {
    for (const query of ['NL-T5 l3W/84O/65', 'NLT5 13W 840 65', 'NL-T5 13W/840/65']) {
      const top = topMatches(STARTER_ITEMS, query, 5)
      expect(top[0]?.article.ime, query).toBe('NL-T5 13W/840/65')
      expect(top[0]?.score, query).toBeGreaterThan(80)
    }
  })

  it('13W in 840 ločita T5 od T8', () => {
    const t5 = STARTER_ITEMS.find((a) => a.ime === 'NL-T5 13W/840/65')
    const t8 = STARTER_ITEMS.find((a) => a.ime === 'NL-T8 36W/840-1G13')
    expect(t5 && t8).toBeTruthy()
    const q = 'NL-T5 13W 840'
    expect(matchScore(q, t5!)).toBeGreaterThan(matchScore(q, t8!))
  })
})
