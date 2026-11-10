/** Družina iz imena artikla: 'NL-T5 13W/840/65' → 'NL-T5'. */
export function inferGroupFromName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const space = trimmed.search(/\s/)
  return (space === -1 ? trimmed : trimmed.slice(0, space)).replace(/[.,;:]+$/, '')
}

/** Stolpec v njihovem 4-stolpčnem popisu: NL | RX | RL/PAR | ostalo. */
export function columnForGroup(skupina: string, ime = ''): 0 | 1 | 2 | 3 {
  const key = `${skupina} ${ime}`.trim()
  if (/^NL\b/i.test(key)) return 0
  if (/^RX\b/i.test(key)) return 1
  if (/^(RL|PAR)\b/i.test(key)) return 2
  return 3
}
