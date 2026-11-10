/** Normalizacija OCR napisa za ujemanje imen žarnic (NL-T5 13W/840/65). */

function foldOcrConfusions(text: string): string {
  return text
    .replace(/\|/g, '1')
    .replace(/(?<=\d)l(?=\d)/g, '1')
    .replace(/(?<=\d)l(?=(?:W)?\b)/g, '1')
    .replace(/(?<=^|[^A-Za-z0-9])l(?=\d)/g, '1')
    .replace(/(?<=\d)[Ii](?=\d)/g, '1')
    .replace(/(?<=\d)[Ii](?=(?:W)?\b)/gi, '1')
    .replace(/(?<=^|[^A-Za-z0-9])[Ii](?=\d)/g, '1')
    .replace(/(?<=\d)[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[Oo](?=\b)/g, '0')
    .replace(/(?<=^|[^A-Za-z0-9])[Oo](?=\d)/g, '0')
}

export function normalizeLampText(text: string): string {
  const folded = foldOcrConfusions(
    text
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/đ/gi, 'D')
      .replace(/[–—−]/g, '-')
      .replace(/([A-Za-z0-9])=([A-Za-z0-9])/g, '$1-$2'),
  )
  return folded
    .toUpperCase()
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactLampText(text: string): string {
  return normalizeLampText(text).replace(/[^A-Z0-9]/g, '')
}

const DISTINCTIVE = /(?:\d+W|T\d+|E\d{2}|\d{3,4})/g

function pushUnique(out: string[], token: string): void {
  if (token.length < 2) return
  if (!out.includes(token)) out.push(token)
}

/** Žetoni za ujemanje: ločila, meje črka/številka, in tipičen zapis NLT5 → NL + T5. */
export function lampTokens(text: string): string[] {
  const norm = normalizeLampText(text)
  const spaced = norm.replace(/[/-]/g, ' ').replace(/([A-Z]+)(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2')
  const out: string[] = []
  for (const raw of spaced.split(/\s+/)) {
    if (!raw) continue
    pushUnique(out, raw)
    const fam = raw.match(/^([A-Z]{2,3})(T\d+)$/)
    if (fam?.[1] && fam[2]) {
      pushUnique(out, fam[1])
      pushUnique(out, fam[2])
    }
  }
  for (const hit of norm.match(DISTINCTIVE) ?? []) pushUnique(out, hit)
  const compact = compactLampText(text)
  const gluedFam = compact.match(/^([A-Z]{2,3})(T\d+)(.*)$/)
  if (gluedFam?.[1] && gluedFam[2]) {
    pushUnique(out, gluedFam[1])
    pushUnique(out, gluedFam[2])
  }
  return out
}

export function tokenWeight(token: string): number {
  if (/^\d+W$/.test(token) || /^T\d+$/.test(token) || /^\d{3,4}$/.test(token) || /^E\d{2}$/.test(token)) return 2
  return 1
}

/** Berljivejši predlog za obrazec. */
export function formatOcrLabel(text: string): string {
  return normalizeLampText(text)
}
