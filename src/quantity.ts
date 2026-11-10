export type QuantityMode = 'set' | 'add'

export function parseCount(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

export function applyQuantity(input: {
  current: number
  entered: number
  mode: QuantityMode
}): number {
  const next = input.mode === 'set' ? input.entered : input.current + input.entered
  if (!Number.isFinite(next) || next < 0) return 0
  return Math.trunc(next)
}

export function adjustEntered(currentEntered: string, delta: number): string {
  const parsed = parseCount(currentEntered) ?? 0
  return String(Math.max(0, parsed + delta))
}
