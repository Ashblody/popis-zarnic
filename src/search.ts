/** Accent-insensitive normalize for Slovenian search (č š ž ć đ …). */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

export function articleMatches(query: string, article: { sifra: string; ime: string; ean: string; skupina?: string }): boolean {
  const q = normalizeSearch(query)
  if (!q) return true
  const hay = normalizeSearch(`${article.sifra} ${article.ime} ${article.ean} ${article.skupina ?? ''}`)
  return hay.includes(q)
}
