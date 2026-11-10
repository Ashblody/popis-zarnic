import { compactLampText, lampTokens, tokenWeight } from './ocrNormalize.ts'
import { normalizeSearch } from './search.ts'

export type RankedArticle<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }> = {
  article: T
  score: number
}

function haystack(article: { ime: string; sifra?: string; skupina?: string }): string {
  return [article.ime, article.sifra ?? '', article.skupina ?? ''].join(' ')
}

/** Grobo ujemanje OCR/QR besedila z artiklom (višja številka = boljše). */
export function matchScore(query: string, article: { ime: string; sifra?: string; skupina?: string }): number {
  const q = query.trim()
  if (!q) return 0
  const ime = article.ime
  const hay = haystack(article)
  if (!hay.trim()) return 0
  if (normalizeSearch(ime) === normalizeSearch(q) || compactLampText(ime) === compactLampText(q)) return 100
  const cq = compactLampText(q)
  const ci = compactLampText(ime)
  const ch = compactLampText(hay)
  if (cq && ci && cq === ci) return 100
  if (cq.length >= 6 && (ci.includes(cq) || ch.includes(cq))) return 94
  if (cq.length >= 6 && ci && (cq.includes(ci) || cq.includes(ch))) return 90

  const qt = lampTokens(q)
  const ht = lampTokens(hay)
  if (!qt.length) return 0
  let hitWeight = 0
  let totalWeight = 0
  for (const token of qt) {
    const w = tokenWeight(token)
    totalWeight += w
    if (ht.some((h) => h === token || h.includes(token) || token.includes(h))) hitWeight += w
  }
  if (!totalWeight) return 0
  return Math.round((hitWeight / totalWeight) * 80)
}

export function rankArticles<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }>(
  articles: T[],
  query: string,
): RankedArticle<T>[] {
  const ranked = articles.map((article) => ({ article, score: matchScore(query, article) }))
  ranked.sort((a, b) => b.score - a.score || a.article.ime.localeCompare(b.article.ime, 'sl', { sensitivity: 'base' }))
  return ranked
}

export function rankArticlesWithoutEan<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }>(
  articles: T[],
  query: string,
): RankedArticle<T>[] {
  return rankArticles(
    articles.filter((a) => !String(a.ean ?? '').trim()),
    query,
  )
}

export function topMatches<T extends { ime: string; sifra?: string; skupina?: string; ean?: string }>(
  articles: T[],
  query: string,
  limit = 5,
): RankedArticle<T>[] {
  return rankArticles(articles, query).filter((row) => row.score > 0).slice(0, limit)
}
