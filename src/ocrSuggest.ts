import { extractSifra } from './scanParse.ts'

export type OcrSuggestion = {
  sifra: string
  ime: string
}

/** Znane znamke na nalepkah orodja / žarnic (velike črke). */
export const KNOWN_BRANDS = [
  'MITUTOYO',
  'PHILIPS',
  'OSRAM',
  'SYLVANIA',
  'LEDVANCE',
  'NARVA',
  'BOSCH',
  'MAKITA',
  'STARRETT',
  'TOSHIBA',
  'PANASONIC',
  'SIEMENS',
  'SCHNEIDER',
  'STANLEY',
] as const

const IGNORE = new Set([
  'MADE',
  'IN',
  'JAPAN',
  'CHINA',
  'GERMANY',
  'TAIWAN',
  'KOREA',
  'USA',
  'THE',
  'EAN',
  'QTY',
  'PCS',
  'KOS',
  'MODEL',
  'TYPE',
  'CODE',
  'WWW',
  'HTTP',
  'HTTPS',
  'COM',
  'ORG',
])

/** Model kot CD-P15P, AB-12, XYZ-12A. */
const MODEL_RE = /\b[A-Z]{1,4}-[A-Z]{0,2}\d{1,4}[A-Z]{0,2}\b/g

export function normalizeOcrText(text: string): string {
  return text
    .replace(/[–—]/g, '-')
    .replace(/([A-Z0-9])=([A-Z0-9])/gi, '$1-$2')
}

export function extractModels(text: string): string[] {
  const up = normalizeOcrText(text).toUpperCase()
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of up.matchAll(MODEL_RE)) {
    const token = match[0]
    if (IGNORE.has(token) || seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

export function extractBrand(text: string): string {
  const up = ` ${normalizeOcrText(text).toUpperCase()} `
  for (const brand of KNOWN_BRANDS) {
    if (up.includes(` ${brand} `) || up.includes(`\n${brand} `) || up.includes(` ${brand}\n`)) {
      return brand[0] + brand.slice(1).toLowerCase()
    }
  }
  return ''
}

/**
 * Iz OCR besedila predlagaj šifro in ime.
 * Nikoli ne shranjuje — samo predlog za potrditev.
 */
export function suggestFromOcr(text: string): OcrSuggestion {
  const normalized = normalizeOcrText(text)
  const sifra = extractSifra(normalized)
  const models = extractModels(normalized).filter((m) => m !== sifra)
  const brand = extractBrand(normalized)
  const model = models[0] ?? ''
  const ime = [brand, model].filter(Boolean).join(' ')
  return { sifra, ime }
}
