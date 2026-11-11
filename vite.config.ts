import fs from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * Vgrajen ključ skupne zaloge. Bere se ob gradnji iz POPIS_SYNC_PIN ali iz
 * datoteke izven gita (POPIS_SYNC_PIN_FILE, privzeto /workspace/popis/SKUPNA-ZALOGA-PIN.txt).
 * V repozitoriju ga ni; v javnem bundlu je (doma, nizko tveganje — Hebo se strinja).
 */
function builtinSyncPin(mode: string): string {
  if (mode === 'test') return ''
  const fromEnv = (process.env.POPIS_SYNC_PIN ?? '').trim()
  if (fromEnv) return fromEnv
  const file = process.env.POPIS_SYNC_PIN_FILE || '/workspace/popis/SKUPNA-ZALOGA-PIN.txt'
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => ({
  base: '/popis-zarnic/',
  define: {
    __BUILTIN_SYNC_PIN__: JSON.stringify(builtinSyncPin(mode)),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
}))
