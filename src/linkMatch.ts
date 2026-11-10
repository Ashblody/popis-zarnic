import { normalizeSearch } from './search.ts'

export type RankedArticle<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }> = {
  article: T
  score: number
}

function tokens(value: string): string[] {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 2)
}

/** Grobo ujemanje OCR/QR besedila z artiklom brez EAN (višja številka = boljše). */
export function matchScore(query: string, article: { ime: string; sifra?: string; skupina?: string }): number {
  const q = normalizeSearch(query)
  if (!q) return 0
  const ime = normalizeSearch(article.ime)
  const hay = normalizeSearch([article.ime, article.sifra ?? '', article.skupina ?? ''].join(' '))
  if (!hay) return 0
  if (ime === q || hay === q) return 100
  if (ime.includes(q) || q.includes(ime) || hay.includes(q) || q.includes(hay)) return 90
  const qt = tokens(query)
  const ht = tokens(hay)
  if (!qt.length) return 0
  let hits = 0
  for (const token of qt) {
    if (ht.some((h) => h === token || h.includes(token) || token.includes(h))) hits += 1
  }
  return Math.round((hits / qt.length) * 80)
}

export function rankArticlesWithoutEan<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }>(
  articles: T[],
  query: string,
): RankedArticle<T>[] {
  const candidates = articles.filter((a) => !String(a.ean ?? '').trim())
  const ranked = candidates.map((article) => ({ article, score: matchScore(query, article) }))
  ranked.sort((a, b) => b.score - a.score || a.article.ime.localeCompare(b.article.ime, 'sl', { sensitivity: 'base' }))
  return ranked
}
