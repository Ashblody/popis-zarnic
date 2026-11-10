import { describe, expect, it } from 'vitest'
import type { Article, ArticleId } from './types.ts'
import {
  applyPull,
  buildSetupLink,
  compactOps,
  enqueueOp,
  matchLocalToRemote,
  opFromUpsert,
  opsAfterRemap,
  DEFAULT_SYNC_URL,
  effectiveSyncUrl,
  isConfigured,
  parseSetupLink,
  seedPendingFromLocal,
  syncStatusText,
  type RemoteArticle,
  type SyncOp,
} from './sync.ts'

function art(partial: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sifra: '',
    ime: 'A',
    ean: '',
    kolicina: 0,
    opomba: '',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...partial,
  }
}

function rem(partial: Partial<RemoteArticle> & Pick<RemoteArticle, 'id'>): RemoteArticle {
  return {
    skupina: '',
    sifra: '',
    ime: 'A',
    ean: '',
    kolicina: 10,
    opomba: '',
    updatedAt: '2026-11-10T10:00:00.000Z',
    updatedBy: 'seed',
    deleted: false,
    ...partial,
  }
}

describe('količina kot delta', () => {
  it('dva telefona prištejeta, ne prepišeta zaloge', () => {
    const remote = [rem({ id: 'art-1', kolicina: 10 })]
    const opA: SyncOp = { id: 'art-1', qtyDelta: 2, updatedAt: '2026-11-10T10:01:00.000Z', updatedBy: 'phone-a' }
    const opB: SyncOp = { id: 'art-1', qtyDelta: 3, updatedAt: '2026-11-10T10:02:00.000Z', updatedBy: 'phone-b' }
    const mergedA = applyPull([art({ id: 'art-1' as ArticleId, kolicina: 12 })], remote, [opA])
    expect(mergedA[0]?.kolicina).toBe(12)
    // Server already applied A (+2 → 12). Phone B still has pending +3 against stale 10? After A pushed, remote is 12.
    const afterA = [rem({ id: 'art-1', kolicina: 12, updatedAt: '2026-11-10T10:01:00.000Z' })]
    const mergedB = applyPull([art({ id: 'art-1' as ArticleId, kolicina: 13 })], afterA, [opB])
    expect(mergedB[0]?.kolicina).toBe(15)
  })

  it('združi več operacij istega artikla', () => {
    const compacted = compactOps([
      { id: 'x', qtyDelta: 1, updatedAt: '2026-11-10T10:01:00.000Z', updatedBy: 'a' },
      { id: 'x', qtyDelta: 4, fields: { ime: 'Nova' }, updatedAt: '2026-11-10T10:02:00.000Z', updatedBy: 'a' },
    ])
    expect(compacted).toHaveLength(1)
    expect(compacted[0]?.qtyDelta).toBe(5)
    expect(compacted[0]?.fields?.ime).toBe('Nova')
  })
})

describe('zadnji zapis zmaga pri poljih', () => {
  it('ohrani novejše lokalno ime, vzame oddaljeno če je novejše', () => {
    const remote = [rem({ id: 'art-1', ime: 'Oddaljeno', updatedAt: '2026-11-10T11:00:00.000Z', kolicina: 5 })]
    const stale: SyncOp = {
      id: 'art-1',
      qtyDelta: 0,
      fields: { ime: 'Staro' },
      updatedAt: '2026-11-10T10:00:00.000Z',
      updatedBy: 'a',
    }
    const staleMerge = applyPull([art({ id: 'art-1' as ArticleId, ime: 'Staro', kolicina: 5 })], remote, [stale])
    expect(staleMerge[0]?.ime).toBe('Oddaljeno')

    const fresh: SyncOp = { ...stale, fields: { ime: 'Lokalno' }, updatedAt: '2026-11-10T12:00:00.000Z' }
    const freshMerge = applyPull([art({ id: 'art-1' as ArticleId, ime: 'Lokalno', kolicina: 5 })], remote, [fresh])
    expect(freshMerge[0]?.ime).toBe('Lokalno')
  })
})

describe('opFromUpsert', () => {
  it('za nov artikel pošlje začetno količino kot delto', () => {
    const created = art({ id: 'n' as ArticleId, ime: 'Nova', kolicina: 7, updatedAt: '2026-11-10T10:05:00.000Z' })
    const op = opFromUpsert(undefined, created, 'phone-a')
    expect(op.qtyDelta).toBe(7)
    expect(op.fields?.ime).toBe('Nova')
  })

  it('pri spremembi zaloge pošlje samo razliko', () => {
    const prev = art({ id: 'n' as ArticleId, kolicina: 10, ime: 'X' })
    const next = art({ id: 'n' as ArticleId, kolicina: 7, ime: 'X', updatedAt: '2026-11-10T10:06:00.000Z' })
    expect(opFromUpsert(prev, next, 'phone-a').qtyDelta).toBe(-3)
  })
})

describe('ujemanje ob prvem sinhroniziranju', () => {
  it('podvojeno ime poveže enega za enim po količini, ne združi', () => {
    const local = [
      art({ id: 'loc-1' as ArticleId, ime: 'NL-T5 13W/840/65', kolicina: 23 }),
      art({ id: 'loc-2' as ArticleId, ime: 'NL-T5 13W/840/65', kolicina: 23 }),
    ]
    const remote = [
      rem({ id: 'art-aaa', ime: 'NL-T5 13W/840/65', kolicina: 23 }),
      rem({ id: 'art-bbb', ime: 'NL-T5 13W/840/65', kolicina: 23 }),
    ]
    const { local: mapped, remaps } = matchLocalToRemote(local, remote)
    expect(new Set(mapped.map((a) => a.id)).size).toBe(2)
    expect(remaps).toHaveLength(2)
    expect(mapped.map((a) => a.id).sort()).toEqual(['art-aaa', 'art-bbb'].sort())
  })

  it('prepiše id v čakajočih operacijah', () => {
    const pending: SyncOp[] = [{ id: 'loc-1', qtyDelta: 1, updatedAt: 't', updatedBy: 'a' }]
    expect(opsAfterRemap(pending, [{ from: 'loc-1', to: 'art-aaa' }])[0]?.id).toBe('art-aaa')
  })
})

describe('povezava za nastavitev', () => {
  it('sestavi in razčleni setup povezavo z URL in PIN', () => {
    const link = buildSetupLink('https://ashblody.github.io/popis-zarnic/', 'https://script.google.com/macros/s/ABC/exec', '12345678')
    expect(link).toContain('#setup?')
    expect(parseSetupLink(link)).toEqual({
      url: 'https://script.google.com/macros/s/ABC/exec',
      pin: '12345678',
    })
  })
})

describe('status', () => {
  it('lokalni način je prazen, sicer slovenski napisi', () => {
    expect(syncStatusText({ configured: false, online: true })).toBe('')
    expect(syncStatusText({ configured: true, online: false })).toBe('Brez povezave')
    expect(syncStatusText({ configured: true, online: true, syncing: true })).toBe('Sinhronizacija…')
    expect(syncStatusText({ configured: true, online: true, lastSyncAt: '2026-11-10T10:22:00.000Z' })).toMatch(
      /^Sinhronizirano /,
    )
  })
})

describe('enqueueOp', () => {
  it('doda in stisne čakalno vrsto', () => {
    const q = enqueueOp([], { id: 'a', qtyDelta: 1, updatedAt: 't1', updatedBy: 'x' })
    const q2 = enqueueOp(q, { id: 'a', qtyDelta: 2, updatedAt: 't2', updatedBy: 'x' })
    expect(q2).toHaveLength(1)
    expect(q2[0]?.qtyDelta).toBe(3)
  })
})

describe('seedPendingFromLocal', () => {
  it('doda delto samo če je lokalna količina drugačna in ni že v vrsti', () => {
    const local = [art({ id: 'art-1' as ArticleId, kolicina: 12, ime: 'A' })]
    const remote = [rem({ id: 'art-1', kolicina: 10, ime: 'A' })]
    const seeded = seedPendingFromLocal(local, remote, [], 'phone-a')
    expect(seeded).toHaveLength(1)
    expect(seeded[0]?.qtyDelta).toBe(2)
    const again = seedPendingFromLocal(local, remote, seeded, 'phone-a')
    expect(again[0]?.qtyDelta).toBe(2)
  })
})

describe('privzeti naslov in PIN', () => {
  it('ima vgrajen javni /exec naslov', () => {
    expect(DEFAULT_SYNC_URL).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/)
    expect(effectiveSyncUrl(undefined)).toBe(DEFAULT_SYNC_URL)
    expect(effectiveSyncUrl({ url: '  ', pin: 'x', deviceId: '', deviceName: '', pending: [] })).toBe(DEFAULT_SYNC_URL)
  })

  it('nastavitev zahteva samo PIN, ne naslova', () => {
    expect(isConfigured({ pin: '1234' })).toBe(true)
    expect(isConfigured({ url: DEFAULT_SYNC_URL })).toBe(false)
    expect(isConfigured({ pin: '  ' })).toBe(false)
  })
})
