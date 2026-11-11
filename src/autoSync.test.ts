import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SYNC_URL, SYNC_SETTINGS_KEY, defaultDeviceName, effectivePin, isConfigured } from './sync.ts'
import { autoSyncConfig, ensureSyncConfig, loadSyncConfig } from './syncClient.ts'

describe('brez prijave', () => {
  beforeEach(() => localStorage.clear())

  it('vgrajen ključ velja, ročni PIN ima prednost, izklop ga izklopi', () => {
    expect(effectivePin({ pin: '' }, 'VGRAJEN')).toBe('VGRAJEN')
    expect(effectivePin({ pin: ' 1234 ' }, 'VGRAJEN')).toBe('1234')
    expect(effectivePin({ pin: '', localOnly: true }, 'VGRAJEN')).toBe('')
    expect(isConfigured({ pin: '' }, 'VGRAJEN')).toBe(true)
    expect(isConfigured({ pin: '' }, '')).toBe(false)
    expect(isConfigured(undefined, 'VGRAJEN')).toBe(false)
  })

  it('nov telefon dobi nastavitev brez PIN in privzeto ime', () => {
    const cfg = autoSyncConfig()
    expect(cfg.pin).toBe('')
    expect(cfg.url).toBe(DEFAULT_SYNC_URL)
    expect(cfg.deviceName).toMatch(/^Telefon-[a-z0-9]{4}$/)
    expect(loadSyncConfig()?.deviceId).toBe(cfg.deviceId)
    expect(autoSyncConfig().deviceName).toBe(cfg.deviceName)
  })

  it('obstoječi uporabnik obdrži PIN, ime in čakajoče spremembe', () => {
    localStorage.setItem(
      SYNC_SETTINGS_KEY,
      JSON.stringify({ url: DEFAULT_SYNC_URL, pin: '9999', deviceId: 'dev-1', deviceName: 'Hebo', pending: [{ id: 'a', qtyDelta: 1, updatedAt: 'x', updatedBy: 'Hebo' }] }),
    )
    const cfg = autoSyncConfig()
    expect(cfg.pin).toBe('9999')
    expect(cfg.deviceName).toBe('Hebo')
    expect(cfg.pending).toHaveLength(1)
  })

  it('star zapis brez imena dobi privzeto ime', () => {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify({ pin: '9999', deviceId: 'dev-1', deviceName: '', pending: [] }))
    expect(autoSyncConfig().deviceName).toMatch(/^Telefon-/)
  })

  it('izklop »Samo na tem telefonu« se ohrani', () => {
    autoSyncConfig()
    const off = ensureSyncConfig({ pin: '', localOnly: true })
    expect(off.localOnly).toBe(true)
    expect(loadSyncConfig()?.localOnly).toBe(true)
    expect(ensureSyncConfig({ pin: '' }).localOnly).toBeUndefined()
  })

  it('privzeto ime je kratko in berljivo', () => {
    expect(defaultDeviceName(() => 0)).toBe('Telefon-aaaa')
  })
})
