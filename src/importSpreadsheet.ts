import * as XLSX from 'xlsx'
import { inferGroupFromName } from './group.ts'

export type ImportedItem = {
  ime: string
  kolicina: number
  skupina: string
  sifra: string
  ean: string
  opomba: string
}

export type ImportResult = {
  items: ImportedItem[]
  total: number
  duplicates: string[]
  fileName: string
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number' && Number.isFinite(value)) return true
  if (typeof value === 'string' && /^-?\d+([.,]\d+)?$/.test(value.trim())) return true
  return false
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  return Number(String(value).trim().replace(',', '.'))
}

function isName(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && !isNumeric(value)
}

function cellText(value: unknown): string {
  return String(value ?? '').trim()
}

function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][]
}

function headerIndex(header: string[], pattern: RegExp): number {
  return header.findIndex((h) => pattern.test(h))
}

function parseFlatRows(rows: unknown[][]): ImportedItem[] | undefined {
  if (rows.length < 2) return undefined
  const header = (rows[0] ?? []).map((h) => cellText(h).toLowerCase())
  const nameIdx = headerIndex(header, /^(ime|artikel|naziv|name)$/)
  const qtyIdx = headerIndex(header, /koli[cč]ina|kolicina|^qty$|^kos$/)
  if (nameIdx < 0 || qtyIdx < 0) return undefined
  const sifraIdx = headerIndex(header, /^šifra$|^sifra$|^sku$/)
  const eanIdx = headerIndex(header, /^ean$|^kod[ae]?$/)
  const opombaIdx = headerIndex(header, /^opomba$|^note$/)
  const skupinaIdx = headerIndex(header, /^skupina$|^group$/)
  const items: ImportedItem[] = []
  for (const row of rows.slice(1)) {
    const ime = cellText(row[nameIdx])
    const qtyRaw = row[qtyIdx]
    if (!ime || !isNumeric(qtyRaw)) continue
    const skupina =
      (skupinaIdx >= 0 ? cellText(row[skupinaIdx]) : '') || inferGroupFromName(ime)
    items.push({
      ime,
      kolicina: Math.max(0, asNumber(qtyRaw)),
      skupina,
      sifra: sifraIdx >= 0 ? cellText(row[sifraIdx]) : '',
      ean: eanIdx >= 0 ? cellText(row[eanIdx]).replace(/\s+/g, '') : '',
      opomba: opombaIdx >= 0 ? cellText(row[opombaIdx]) : '',
    })
  }
  return items.length ? items : undefined
}

function detectNameQtyPairs(rows: unknown[][]): number[] {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const height = rows.length
  const scores: { col: number; ok: number; conflict: number }[] = []
  for (let col = 0; col < width - 1; col += 1) {
    let ok = 0
    let conflict = 0
    for (let row = 0; row < height; row += 1) {
      const name = rows[row]?.[col]
      const qty = rows[row]?.[col + 1]
      if (isName(name) && isNumeric(qty)) ok += 1
      else if (isName(name) && isName(qty)) conflict += 1
    }
    scores.push({ col, ok, conflict })
  }
  const used = new Set<number>()
  const pairs: number[] = []
  for (const score of scores) {
    if (score.ok >= 1 && score.conflict === 0 && !used.has(score.col) && !used.has(score.col + 1)) {
      pairs.push(score.col)
      used.add(score.col)
      used.add(score.col + 1)
    }
  }
  return pairs
}

function parseGridRows(rows: unknown[][]): ImportedItem[] {
  const pairs = detectNameQtyPairs(rows)
  const items: ImportedItem[] = []
  for (const col of pairs) {
    for (let row = 0; row < rows.length; row += 1) {
      const name = rows[row]?.[col]
      const qty = rows[row]?.[col + 1]
      if (isName(name) && isNumeric(qty)) {
        const ime = cellText(name)
        items.push({
          ime,
          kolicina: Math.max(0, asNumber(qty)),
          skupina: inferGroupFromName(ime),
          sifra: '',
          ean: '',
          opomba: '',
        })
      }
    }
  }
  return items
}

function findDuplicates(items: ImportedItem[]): string[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.ime, (counts.get(item.ime) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name)
}

/** Dopolni postavke iz mreže s šifro/EAN iz ploščatega lista (isti vrstni red pri podvojenih imenih). */
export function enrichWithFlat(grid: ImportedItem[], flat: ImportedItem[]): ImportedItem[] {
  const pool = flat.map((item) => ({ ...item, used: false }))
  return grid.map((item) => {
    const match = pool.find(
      (c) =>
        !c.used &&
        c.ime === item.ime &&
        (c.kolicina === item.kolicina || c.ean || c.sifra),
    )
    if (!match) return item
    match.used = true
    return {
      ...item,
      sifra: match.sifra || item.sifra,
      ean: match.ean || item.ean,
      opomba: match.opomba || item.opomba,
      skupina: item.skupina || match.skupina,
    }
  })
}

export function parseWorkbook(workbook: XLSX.WorkBook, fileName = ''): ImportResult {
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: sheetToRows(workbook.Sheets[name]!),
  }))
  const flatSheets = sheets
    .map((s) => parseFlatRows(s.rows))
    .filter((items): items is ImportedItem[] => Boolean(items))
  const gridSheets = sheets
    .filter((s) => !parseFlatRows(s.rows))
    .map((s) => parseGridRows(s.rows))
    .filter((items) => items.length > 0)

  // Če je "Popis" mreža in "Seznam" ploščat, združi. Sicer vzemi najbogatejši list.
  const preferredGrid =
    gridSheets.sort((a, b) => b.length - a.length)[0] ??
    (flatSheets.length && !gridSheets.length ? undefined : gridSheets[0])
  const preferredFlat = flatSheets.sort((a, b) => b.length - a.length)[0]

  let items: ImportedItem[] = []
  if (preferredGrid && preferredFlat) {
    items = enrichWithFlat(preferredGrid, preferredFlat)
  } else if (preferredGrid) {
    items = preferredGrid
  } else if (preferredFlat) {
    items = preferredFlat
  }

  return {
    items,
    total: items.reduce((sum, item) => sum + item.kolicina, 0),
    duplicates: findDuplicates(items),
    fileName,
  }
}

export function parseSpreadsheetBuffer(data: ArrayBuffer | Uint8Array, fileName = ''): ImportResult {
  const workbook = XLSX.read(data, { type: 'array' })
  return parseWorkbook(workbook, fileName)
}
