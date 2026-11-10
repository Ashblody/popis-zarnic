import { describe, expect, it } from 'vitest'
import {
  NATIVE_BARCODE_FORMATS,
  eanChecksumOk,
  extractEan,
  extractSifra,
  parseCodeText,
  pickPreferredScan,
} from './scanParse.ts'

const MITUTOYO_QR = '00|500-706-20|3G|4946368693927||01|01'
const MITUTOYO_EAN = '4946368693927'

describe('NATIVE_BARCODE_FORMATS', () => {
  it('vključuje QR in Data Matrix poleg EAN', () => {
    expect(NATIVE_BARCODE_FORMATS).toContain('qr_code')
    expect(NATIVE_BARCODE_FORMATS).toContain('data_matrix')
    expect(NATIVE_BARCODE_FORMATS).toContain('ean_13')
    expect(NATIVE_BARCODE_FORMATS).toContain('ean_8')
    expect(NATIVE_BARCODE_FORMATS).toContain('code_128')
  })
})

describe('EAN', () => {
  it('potrdi kontrolno vsoto Mitutoyo EAN-13', () => {
    expect(eanChecksumOk(MITUTOYO_EAN)).toBe(true)
    expect(eanChecksumOk('4946368693928')).toBe(false)
    expect(eanChecksumOk('123')).toBe(false)
  })

  it('najde EAN v QR nizu z ločili', () => {
    expect(extractEan(MITUTOYO_QR)).toBe(MITUTOYO_EAN)
    expect(extractEan('EAN 4 946368 693927')).toBe(MITUTOYO_EAN)
  })
})

describe('parseCodeText / QR', () => {
  it('iz Mitutoyo QR vzame šifro in EAN', () => {
    expect(parseCodeText(MITUTOYO_QR)).toEqual({
      ean: MITUTOYO_EAN,
      sifra: '500-706-20',
      raw: MITUTOYO_QR,
    })
  })

  it('iz surovega QR brez šifre/EAN ohrani vsebino', () => {
    expect(parseCodeText('HELLO-WORLD')).toEqual({
      ean: '',
      sifra: '',
      raw: 'HELLO-WORLD',
    })
  })

  it('iz URL vzame šifro, če je v poti', () => {
    const parsed = parseCodeText('https://example.com/item/500-706-20')
    expect(parsed.sifra).toBe('500-706-20')
  })
})

describe('pickPreferredScan', () => {
  it('če sta EAN in QR, je ključ EAN, šifra pa iz QR', () => {
    const picked = pickPreferredScan([
      { text: MITUTOYO_QR, format: 'qr_code' },
      { text: MITUTOYO_EAN, format: 'ean_13' },
    ])
    expect(picked.key).toBe(MITUTOYO_EAN)
    expect(picked.ean).toBe(MITUTOYO_EAN)
    expect(picked.sifra).toBe('500-706-20')
    expect(picked.source).toBe('ean')
  })

  it('če je samo QR, uporabi EAN in šifro iz vsebine', () => {
    const picked = pickPreferredScan([{ text: MITUTOYO_QR, format: 'qr_code' }])
    expect(picked.key).toBe(MITUTOYO_EAN)
    expect(picked.ean).toBe(MITUTOYO_EAN)
    expect(picked.sifra).toBe('500-706-20')
    expect(picked.source).toBe('qr_code')
  })

  it('če QR nima EAN/šifre, shrani surovo vsebino kot kodo', () => {
    const picked = pickPreferredScan([{ text: 'XYZ123', format: 'qr_code' }])
    expect(picked.key).toBe('XYZ123')
    expect(picked.ean).toBe('')
    expect(picked.sifra).toBe('')
    expect(picked.raw).toBe('XYZ123')
  })

  it('Data Matrix z šifro brez EAN uporabi šifro kot ključ', () => {
    const picked = pickPreferredScan([{ text: 'PN:500-706-20', format: 'data_matrix' }])
    expect(picked.key).toBe('500-706-20')
    expect(picked.sifra).toBe('500-706-20')
    expect(picked.source).toBe('data_matrix')
  })
})

describe('extractSifra', () => {
  it('najde vzorec 123-456-78', () => {
    expect(extractSifra('art 123-456-78 x')).toBe('123-456-78')
    expect(extractSifra('brez')).toBe('')
  })
})
