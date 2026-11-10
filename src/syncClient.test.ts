import { describe, expect, it } from 'vitest'
import { parseSyncResponseText } from './syncClient.ts'

describe('parseSyncResponseText', () => {
  it('prebere JSON in JSONP', () => {
    expect(parseSyncResponseText('{"ok":true,"pong":true}')).toEqual({ ok: true, pong: true })
    expect(parseSyncResponseText('pz_cb({"ok":false,"error":"bad_pin"})')).toEqual({ ok: false, error: 'bad_pin' })
  })

  it('prepozna Google prijavo namesto JSON', () => {
    const html = '<!doctype html><html><body>Sign in - Google Accounts Use your Google Account</body></html>'
    expect(parseSyncResponseText(html).error).toBe('google_login')
  })
})
