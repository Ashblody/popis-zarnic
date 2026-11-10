import { describe, expect, it } from 'vitest'
import { applyOcrPrefill } from './ocrPrefill.ts'
import { pickBestOcrText, scoreOcrText } from './ocrSuggest.ts'

const GARBAGE =
  'B® da 000; T0e-20 + JIALL NN\ni =U CD-Pi15P woe IN wean 4 946368 693927'
const CLEAN = 'BR ze 500-706-20 ° [INI I)\n7 a2 CD-P15P aE IN JAPAN 4 946368 693927'

describe('applyOcrPrefill', () => {
  it('ne prepiše EAN in šifre iz kode z OCR', () => {
    const out = applyOcrPrefill({
      previousSifra: '500-706-20',
      previousEan: '4946368693927',
      sug: { sifra: 'T0e-20', ime: 'CD-P15P' },
    })
    expect(out.sifra).toBe('500-706-20')
    expect(out.ean).toBe('4946368693927')
    expect(out.ime).toBe('CD-P15P')
    expect(out.linkBits).toBe('500-706-20 CD-P15P')
    expect(out.linkBits).not.toMatch(/T0e/)
    expect(out.message).toMatch(/Šifra in EAN sta iz kode/)
  })

  it('če kode niso dale šifre, jo sme predlagati OCR, EAN pa ostane iz kode', () => {
    const out = applyOcrPrefill({
      previousSifra: '',
      previousEan: '4946368693927',
      sug: { sifra: '500-706-20', ime: 'CD-P15P' },
    })
    expect(out.sifra).toBe('500-706-20')
    expect(out.ean).toBe('4946368693927')
    expect(out.linkBits).toBe('500-706-20 CD-P15P')
  })

  it('v iskanje povezave ne vrže surovega OCR smetja', () => {
    const out = applyOcrPrefill({
      previousSifra: '',
      previousEan: '',
      sug: { sifra: '', ime: '' },
    })
    expect(out.linkBits).toBe('')
    expect(out.ean).toBe('')
  })
})

describe('pickBestOcrText', () => {
  it('izbere izhod z šifro in modelom pred smetjem iz iste slike', () => {
    expect(scoreOcrText(CLEAN)).toBeGreaterThan(scoreOcrText(GARBAGE))
    expect(pickBestOcrText([GARBAGE, CLEAN])).toMatch(/500-706-20/)
    expect(pickBestOcrText([GARBAGE, CLEAN])).toMatch(/CD-P15P/)
  })
})
