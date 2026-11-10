#!/usr/bin/env node
/**
 * End-to-end probe of the Apps Script web app.
 * Reads PIN from PIN_FILE or /workspace/popis/SKUPNA-ZALOGA-PIN.txt.
 * Never prints the PIN or a URL query that contains it.
 */
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const URL =
  process.env.SYNC_URL ||
  'https://script.google.com/macros/s/AKfycbzQGpKejoWzXcE2KDTmjreGaeQ5jH_mQqRGtv1pyjzCbFeyJRGT7cevJBGHj-ZXgy_e/exec'
const PIN_FILE = process.env.PIN_FILE || '/workspace/popis/SKUPNA-ZALOGA-PIN.txt'
const pin = fs.readFileSync(PIN_FILE, 'utf8').trim()
if (!/^\d{4,16}$/.test(pin)) {
  console.error('E2E FAIL: PIN file missing or unexpected shape')
  process.exit(2)
}

const results = []
function log(name, ok, detail) {
  const line = `${ok ? 'OK' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  results.push({ name, ok, detail })
  console.log(line)
}

function looksLikeLogin(text) {
  return /accounts\.google\.com|Sign in - Google|Use your Google Account/i.test(text)
}

function parseBody(text) {
  const trimmed = (text || '').trim()
  if (looksLikeLogin(trimmed)) return { ok: false, error: 'google_login' }
  try {
    return JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'bad_json', preview: trimmed.slice(0, 80) }
  }
}

async function postPlain(payload) {
  const res = await fetch(URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  return { http: res.status, finalUrlKind: res.url.includes('accounts.google.com') ? 'google_login' : res.url.includes('googleusercontent.com') ? 'googleusercontent' : res.url.includes('script.google.com') ? 'script.google.com' : 'other', json: parseBody(text), bytes: text.length }
}

console.log(`E2E target host: script.google.com  path ends with /exec`)

const noPin = await postPlain({ action: 'ping' })
if (noPin.json?.error === 'bad_pin') log('POST ping without PIN', true, `${noPin.finalUrlKind} rejected with bad_pin`)
else if (noPin.json?.error === 'google_login') log('POST ping without PIN', false, `redirected to Google sign-in (${noPin.finalUrlKind}, HTTP ${noPin.http}, ${noPin.bytes} bytes)`)
else log('POST ping without PIN', false, `unexpected: error=${noPin.json?.error || '?'} kind=${noPin.finalUrlKind}`)

const badPin = await postPlain({ action: 'ping', pin: '00000000', device: 'e2e-wrong' })
if (badPin.json?.error === 'bad_pin') log('POST ping wrong PIN', true, 'rejected with bad_pin')
else if (badPin.json?.error === 'google_login') log('POST ping wrong PIN', false, 'redirected to Google sign-in (cannot reach PIN check)')
else log('POST ping wrong PIN', false, `unexpected: error=${badPin.json?.error || '?'}`)

const ping = await postPlain({ action: 'ping', pin, device: 'e2e-box' })
if (ping.json?.ok && ping.json?.pong) log('POST ping with PIN', true, `via ${ping.finalUrlKind}`)
else if (ping.json?.error === 'google_login') log('POST ping with PIN', false, 'redirected to Google sign-in')
else log('POST ping with PIN', false, `error=${ping.json?.error || '?'}`)

const pull = await postPlain({ action: 'pull', pin, device: 'e2e-box' })
const articles = Array.isArray(pull.json?.articles) ? pull.json.articles : []
const total = articles.reduce((s, a) => s + Number(a.kolicina || 0), 0)
if (pull.json?.ok && articles.length === 81 && total === 2643) log('POST pull', true, '81 articles / 2643 pcs')
else if (pull.json?.error === 'google_login') log('POST pull', false, 'redirected to Google sign-in')
else log('POST pull', false, `ok=${!!pull.json?.ok} articles=${articles.length} total=${total}`)

let pushOk = false
if (pull.json?.ok && articles[0]) {
  const id = articles[0].id
  const [a, b] = await Promise.all([
    postPlain({ action: 'push', pin, device: 'e2e-A', ops: [{ id, qtyDelta: 1, updatedAt: new Date().toISOString(), updatedBy: 'e2e-A' }] }),
    postPlain({ action: 'push', pin, device: 'e2e-B', ops: [{ id, qtyDelta: 1, updatedAt: new Date().toISOString(), updatedBy: 'e2e-B' }] }),
  ])
  const after = await postPlain({ action: 'pull', pin, device: 'e2e-box' })
  const arts = Array.isArray(after.json?.articles) ? after.json.articles : []
  const sum = arts.reduce((s, x) => s + Number(x.kolicina || 0), 0)
  if (a.json?.ok && b.json?.ok && sum === 2645) {
    log('concurrent +1 / +1', true, 'sheet total 2645')
    pushOk = true
  } else if (a.json?.error === 'google_login' || b.json?.error === 'google_login') {
    log('concurrent +1 / +1', false, 'redirected to Google sign-in; sheet not changed via API')
  } else {
    log('concurrent +1 / +1', false, `A.ok=${!!a.json?.ok} B.ok=${!!b.json?.ok} total=${sum}`)
  }
  if (pushOk) {
    const revert = await postPlain({
      action: 'push',
      pin,
      device: 'e2e-box',
      ops: [{ id, qtyDelta: -2, updatedAt: new Date().toISOString(), updatedBy: 'e2e-revert' }],
    })
    const done = await postPlain({ action: 'pull', pin, device: 'e2e-box' })
    const back = (done.json?.articles || []).reduce((s, x) => s + Number(x.kolicina || 0), 0)
    if (revert.json?.ok && back === 2643) log('revert -2', true, 'sheet total back at 2643')
    else log('revert -2', false, `ok=${!!revert.json?.ok} total=${back}`)
  }
} else {
  log('concurrent +1 / +1', false, 'skipped (no pull)')
  log('revert -2', false, 'skipped (no push)')
}

// Browser: simple CORS POST from a page on the live app origin, and the live UI itself.
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p))
if (!chrome) {
  log('Chromium CORS POST', false, 'Chrome ni nameščen')
  log('live app settings', false, 'Chrome ni nameščen')
} else {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(20000)
    await page.goto('https://ashblody.github.io/popis-zarnic/', { waitUntil: 'networkidle0' })
    const cors = await page.evaluate(async (url, secret) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ping', pin: secret, device: 'e2e-chrome' }),
        })
        const text = await res.text()
        const login = /accounts\.google\.com|Sign in - Google|Use your Google Account/i.test(text)
        let json = null
        try { json = JSON.parse(text) } catch {}
        return {
          ok: !!(json && json.ok && json.pong),
          error: login ? 'google_login' : (json && json.error) || (json ? '' : 'bad_json'),
          http: res.status,
        }
      } catch (err) {
        return { ok: false, error: 'cors_or_network', message: String(err && err.message ? err.message : err) }
      }
    }, URL, pin)
    if (cors.ok) log('Chromium CORS POST from github.io', true, `HTTP ${cors.http}`)
    else log('Chromium CORS POST from github.io', false, cors.error === 'cors_or_network' ? `fetch failed: ${cors.message}` : cors.error)

    // UI: open settings, confirm default URL is present under Napredno. Do not type the PIN into a screenshot.
    await page.$eval('#btn-sync', (el) => { el.scrollIntoView({ block: 'center' }); el.click() })
    await page.waitForSelector('#sync-pin')
    const ui = await page.evaluate(() => {
      const url = document.querySelector('#sync-url')
      const details = document.querySelector('#sync-advanced')
      return {
        version: document.body.innerText.includes('v1.2.1'),
        pinField: !!document.querySelector('#sync-pin'),
        nameField: !!document.querySelector('#sync-name'),
        advanced: !!(details && details.querySelector('summary')?.textContent?.includes('Napredno')),
        defaultUrl: url instanceof HTMLInputElement ? url.value : '',
      }
    })
    const urlOk = ui.defaultUrl.endsWith('/exec') && ui.defaultUrl.includes('/macros/s/')
    if (ui.pinField && ui.nameField && ui.advanced && urlOk) log('live app settings UI', true, ui.version ? 'v1.2.1, PIN+ime, URL under Napredno' : 'UI ok but live version is not yet 1.2.1')
    else log('live app settings UI', false, `pin=${ui.pinField} name=${ui.nameField} advanced=${ui.advanced} url=${urlOk}`)
  } finally {
    await browser.close()
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`E2E done  ${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
