import { describe, expect, it } from 'vitest'
import { suggestFromOcr } from './ocrSuggest.ts'

/**
 * Dejanski izhod Tesseract.js (eng) na obrezani testni nalepki Mitutoyo
 * (label_oriented, sredinski izrez, 2×, PSM 6) — glej /tmp/label-tight/text_mid_x2.png.
 */
const TESSERACT_MID_CROP = '500-706-20 =€ |\nCD-P15P MADE IN JAPAN 4\n'

/** Isti izrez z omejenim naborom znakov (whitelist). */
const TESSERACT_MID_WHITELIST = '500-706-20\nCD-P15P MADE IN JAPAN 4\n'

/** OCR cele nalepke (QR + črtna koda motita branje modela). */
const TESSERACT_FULL_LABEL = 'EY 500-706-20 36\nCEE MEN]\n'

/** Šibkejši izrez: šifra je prava, model je napačno prebran. */
const TESSERACT_NOISY_MODEL = '500-706-20 °¢\nCD-F13P MADE IN JAPA\n'

describe('suggestFromOcr', () => {
  it('iz realnega Tesseract izhoda predlaga šifro 500-706-20 in ime CD-P15P', () => {
    expect(suggestFromOcr(TESSERACT_MID_CROP)).toEqual({
      sifra: '500-706-20',
      ime: 'CD-P15P',
    })
    expect(suggestFromOcr(TESSERACT_MID_WHITELIST)).toEqual({
      sifra: '500-706-20',
      ime: 'CD-P15P',
    })
  })

  it('iz šibkejšega OCR cele nalepke vseeno vzame šifro', () => {
    const sug = suggestFromOcr(TESSERACT_FULL_LABEL)
    expect(sug.sifra).toBe('500-706-20')
  })

  it('pri napačno prebranem modelu predlaga, kar je OCR res prebral', () => {
    expect(suggestFromOcr(TESSERACT_NOISY_MODEL)).toEqual({
      sifra: '500-706-20',
      ime: 'CD-F13P',
    })
  })

  it('zloži znamko in model v ime', () => {
    expect(suggestFromOcr('MITUTOYO\nCD-P15P\n500-706-20')).toEqual({
      sifra: '500-706-20',
      ime: 'Mitutoyo CD-P15P',
    })
  })

  it('pri praznem ali smetju ne izmisli predloga', () => {
    expect(suggestFromOcr('')).toEqual({ sifra: '', ime: '' })
    expect(suggestFromOcr('MADE IN JAPAN 3G')).toEqual({ sifra: '', ime: '' })
  })

  it('tudi enačaj namesto vezaja pri modelu (OCR napaka)', () => {
    expect(suggestFromOcr('CD=P15P 500-706-20').ime).toBe('CD-P15P')
  })
})
