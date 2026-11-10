/** Razčleni vsebino skenirane kode (EAN, QR, Data Matrix). */

export const NATIVE_BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
  'data_matrix',
] as const

export type ScanFormat = (typeof NATIVE_BARCODE_FORMATS)[number] | 'unknown'

export type ScanHit = {
  text: string
  format: ScanFormat
}

export type ParsedScan = {
  /** Ključ za iskanje artikla: raje EAN, sicer šifra, sicer surovo besedilo. */
  key: string
  ean: string
  sifra: string
  raw: string
  source: 'ean' | 'qr_code' | 'data_matrix' | 'other'
  hits: ScanHit[]
}

const LINEAR = new Set<ScanFormat>(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'])

export function normalizeCode(text: string): string {
  return text.replace(/\s+/g, '').trim()
}

/** Kontrolna vsota EAN-8 / UPC-A (12) / EAN-13, uteži z desne. */
export function eanChecksumOk(digits: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(digits)) return false
  const nums = [...digits].map(Number)
  const check = nums.pop()
  if (check === undefined) return false
  let sum = 0
  for (let i = 0; i < nums.length; i += 1) {
    const fromRight = nums.length - 1 - i
    const weight = fromRight % 2 === 0 ? 3 : 1
    sum += nums[i]! * weight
  }
  return (sum + check) % 10 === 0
}

export function extractEan(text: string): string {
  const compact = normalizeCode(text).replace(/[^\d|]/g, (ch) => (ch === '|' ? '|' : ''))
  const candidates = compact.match(/\d{8,13}/g) ?? []
  for (const m of candidates) {
    if (eanChecksumOk(m)) return m
  }
  // also search original (digits only runs)
  const runs = text.replace(/\s+/g, '').match(/\d{8,13}/g) ?? []
  for (const m of runs) {
    if (eanChecksumOk(m)) return m
  }
  return ''
}

export function extractSifra(text: string): string {
  const norm = text.replace(/[–—]/g, '-')
  const match = norm.match(/\d{2,4}-\d{2,4}-\d{2,4}/)
  return match ? match[0] : ''
}

/** Razčleni QR/DataMatrix (npr. Mitutoyo `00|500-706-20|3G|4946368693927||01|01`). */
export function parseCodeText(text: string): { ean: string; sifra: string; raw: string } {
  const raw = text.trim()
  let decoded = raw
  try {
    if (/^https?:\/\//i.test(raw)) decoded = decodeURIComponent(raw)
  } catch {
    /* pusti raw */
  }
  return {
    ean: extractEan(decoded),
    sifra: extractSifra(decoded),
    raw,
  }
}

export function pickPreferredScan(hits: ScanHit[]): ParsedScan {
  const cleaned = hits
    .map((h) => ({ text: h.text.trim(), format: h.format }))
    .filter((h) => h.text)
  const parsedHits = cleaned.map((h) => ({ ...h, parsed: parseCodeText(h.text) }))

  const linear = parsedHits.find((h) => {
    if (!LINEAR.has(h.format)) return false
    return Boolean(h.parsed.ean) || /^\d{8,14}$/.test(normalizeCode(h.text))
  })
  const qrish = parsedHits.find((h) => h.format === 'qr_code' || h.format === 'data_matrix')
  const withEan = parsedHits.find((h) => h.parsed.ean)

  const ean =
    (linear?.parsed.ean ||
      withEan?.parsed.ean ||
      (linear && /^\d{8,14}$/.test(normalizeCode(linear.text)) ? normalizeCode(linear.text) : '')) ??
    ''
  const sifra = parsedHits.map((h) => h.parsed.sifra).find(Boolean) ?? ''
  const fallback = linear ?? withEan ?? qrish ?? parsedHits[0]
  const raw = fallback?.text ?? ''
  const key = ean || sifra || raw
  let source: ParsedScan['source'] = 'other'
  if (linear) source = 'ean'
  else if (qrish) source = qrish.format === 'data_matrix' ? 'data_matrix' : 'qr_code'

  return { key, ean, sifra, raw, source, hits: cleaned }
}

export function mapNativeFormat(format: string): ScanFormat {
  const f = format.toLowerCase().replace(/-/g, '_')
  return (NATIVE_BARCODE_FORMATS as readonly string[]).includes(f) ? (f as ScanFormat) : 'unknown'
}
