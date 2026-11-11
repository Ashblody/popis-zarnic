import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const outDir = path.join(root, 'smoke-output')
fs.mkdirSync(outDir, { recursive: true })

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function send(res, filePath, status = 200) {
  const ext = path.extname(filePath)
  res.writeHead(status, { 'content-type': mime[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let rel = decodeURIComponent(url.pathname)
  if (rel.startsWith('/popis-zarnic/')) rel = rel.slice('/popis-zarnic'.length)
  if (rel === '/') rel = '/index.html'
  const filePath = path.join(dist, rel)
  if (filePath.startsWith(dist) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    send(res, filePath)
    return
  }
  send(res, path.join(dist, 'index.html'))
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})
const origin = `http://127.0.0.1:${port}/popis-zarnic/`

const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) =>
    fs.existsSync(p),
  )
if (!chrome) {
  server.close()
  throw new Error('Chrome ni nameščen')
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})

const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
page.setDefaultTimeout(15000)

const errors = []
page.on('pageerror', (err) => errors.push(String(err)))

// Smoke nikoli ne piše v pravi skupni list: zahteve na Apps Script prestrežemo.
let syncRequests = 0
await page.setRequestInterception(true)
page.on('request', (req) => {
  if (/script\.google(usercontent)?\.com/.test(req.url())) {
    syncRequests += 1
    void req.abort()
    return
  }
  void req.continue()
})

const client = await page.createCDPSession()
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: outDir,
})

await page.goto(origin, { waitUntil: 'networkidle0' })
const title = await page.title()
if (!title.includes('Popis žarnic')) throw new Error(`Unexpected title: ${title}`)
const homeText = await page.$eval('#app', (el) => el.innerText)
if (!homeText.includes('v1.4.0')) throw new Error(`Manjka različica v1.4.0: ${homeText.slice(0, 200)}`)
if (!(await page.$('#btn-sync'))) throw new Error('Manjka gumb Skupna zaloga')
if (await page.$('#sync-overlay, #sync-pin')) throw new Error('Ob odprtju se ne sme pokazati PIN/prijava')
if (!homeText.includes('artikl') || !homeText.includes('kos')) throw new Error(`Manjka vsota: ${homeText.slice(0, 200)}`)
for (const id of ['#btn-export', '#btn-export-csv', '#btn-history', '#btn-backup', '#btn-restore']) {
  if (!(await page.$(id))) throw new Error(`Manjka gumb ${id}`)
}
if ((await page.$$('[data-filter]')).length !== 3) throw new Error('Manjkajo hitri filtri')

await page.$eval('#btn-sync', (el) => {
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'center' })
    el.click()
  }
})
await page.waitForSelector('#sync-overlay #sync-name', { timeout: 8000 })
const syncTitle = await page.$eval('#sync-overlay h2', (el) => el.textContent || '')
if (!syncTitle.includes('Skupna zaloga')) throw new Error(`Nastavitve skupne zaloge: ${syncTitle}`)
const pinVisible = await page.$eval('#sync-pin', (el) => !!(el.closest('details') && el.closest('details').open))
if (pinVisible) throw new Error('PIN mora biti skrit pod Napredno')
const urlVisible = await page.$eval('#sync-url', (el) => {
  const style = window.getComputedStyle(el)
  const details = el.closest('details')
  return style.display !== 'none' && !!(details && details.open)
})
if (urlVisible) throw new Error('Polje naslova mora biti skrito pod Napredno')
const summary = await page.$eval('#sync-advanced summary', (el) => el.textContent || '')
if (!summary.includes('Napredno')) throw new Error('Manjka Napredno')
await page.$eval('#sync-advanced summary', (el) => { if (el instanceof HTMLElement) el.click() })
const defaultUrl = await page.$eval('#sync-url', (el) => el instanceof HTMLInputElement ? el.value : '')
if (!defaultUrl.includes('/macros/s/') || !defaultUrl.endsWith('/exec')) {
  throw new Error(`Privzeti naslov ni vgrajen: ${defaultUrl}`)
}
await page.$eval('#sync-overlay #btn-sync-close', (el) => {
  if (el instanceof HTMLElement) el.click()
})
await page.waitForFunction(() => !document.querySelector('#sync-overlay'))


await page.click('#btn-new')
await page.waitForSelector('#edit-form')
await page.type('#f-ime', 'Žarnica E27 10W toplo')
await page.type('#f-sifra', 'ZAR-104')
await page.type('#f-ean', '3830001234567')
await page.click('#edit-form button[type="submit"]')

await page.waitForSelector('#btn-save-qty')
// entered starts at 0; press 1 then 2 -> 12, or use +10 +1 +1
await page.click('[data-delta="10"]')
await page.click('[data-delta="1"]')
await page.click('[data-delta="1"]')
await page.click('#btn-save-qty')
await page.waitForFunction(() => document.body.innerText.includes('12 kos') || document.body.innerText.includes('= 12'))

await page.click('#search', { clickCount: 3 })
await page.type('#search', 'zarnica')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 1)

const cardText = await page.$eval('.card', (el) => el.innerText)
if (!cardText.includes('ZAR-104') || !cardText.includes('12')) {
  throw new Error(`Card content unexpected: ${cardText}`)
}

// Uredi: tap na kartico odpre urejanje s količino, lokacijo, sliko in Izbriši
await page.click('.card .card-main h2')
await page.waitForSelector('#edit-form #f-lokacija')
for (const id of ['#f-kolicina', '[data-edit-delta="1"]', '#btn-photo-camera', '#btn-photo-gallery', '#btn-delete']) {
  if (!(await page.$(id))) throw new Error(`Urejanje: manjka ${id}`)
}
await page.click('[data-edit-delta="1"]')
await page.type('#f-lokacija', 'klet')
await page.click('#edit-form button[type="submit"]')
await page.waitForFunction(() => document.querySelector('.card')?.innerText.includes('13'))
const undoText = await page.$eval('.undo-bar', (el) => el.innerText)
if (!undoText.includes('12 → 13')) throw new Error(`Razveljavi: ${undoText}`)
await page.click('#btn-undo')
await page.waitForFunction(() => document.querySelector('.card')?.innerText.includes('12') && !document.querySelector('.undo-bar'))
const locText = await page.$eval('.card', (el) => el.innerText)
if (!locText.includes('klet')) throw new Error(`Lokacija ni prikazana: ${locText}`)

await page.click('#search', { clickCount: 3 })
await page.keyboard.press('Backspace')
await page.click('[data-filter="recent"]')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 1)
await page.click('[data-filter="zero"]')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 0 && !!document.querySelector('.empty'))
await page.click('[data-filter="all"]')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 1)

await page.click('#btn-history')
await page.waitForSelector('#history-overlay')
const histText = await page.$eval('#history-overlay', (el) => el.innerText)
if (!histText.includes('+1') || !histText.includes('razveljavi')) throw new Error(`Zgodovina: ${histText.slice(0, 300)}`)
await page.click('#btn-finish-popis')
await page.waitForFunction(() => document.querySelector('#history-overlay')?.innerText.includes('Popis shranjen'))
if (!(await page.$('[data-popis-csv]'))) throw new Error('Manjka izvoz preteklega popisa')
await page.click('[data-popis-csv]')
await page.click('#btn-history-close')
await page.waitForFunction(() => !document.querySelector('#history-overlay'))

const tap = async (sel) => {
  await page.$eval(sel, (el) => {
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center' })
      el.click()
    }
  })
}
await tap('#btn-export-csv')
await page.waitForFunction(() => document.querySelector('.flash.ok')?.textContent?.includes('.csv'))
await tap('#btn-backup')
await page.waitForFunction(() => document.querySelector('.flash.ok')?.textContent?.includes('Kopija'))

await tap('#btn-export')
const deadline = Date.now() + 8000
let downloaded = ''
while (Date.now() < deadline) {
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.xlsx') && !f.endsWith('.crdownload'))
  if (files.length) {
    downloaded = files[0]
    break
  }
  await new Promise((r) => setTimeout(r, 150))
}
if (!downloaded) throw new Error('xlsx se ni prenesel')
const waitFile = async (re) => {
  const end = Date.now() + 8000
  while (Date.now() < end) {
    const f = fs.readdirSync(outDir).find((n) => re.test(n) && !n.endsWith('.crdownload'))
    if (f) return f
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`Ni prenosa ${re}`)
}
const csvFile = await waitFile(/^popis-zarnic-\d{4}-\d{2}-\d{2}\.csv$/)
const csvText = fs.readFileSync(path.join(outDir, csvFile), 'utf8')
if (!csvText.includes('ZAR-104') || !csvText.includes('klet')) throw new Error(`CSV: ${csvText.slice(0, 200)}`)
await waitFile(/zakljucen\.csv$/)
const backupFile = await waitFile(/^popis-zarnic-kopija-.*\.json$/)
const backup = JSON.parse(fs.readFileSync(path.join(outDir, backupFile), 'utf8'))
if (backup.app !== 'popis-zarnic' || backup.data.articles.length !== 1) throw new Error('Kopija ni pravilna')


await page.$eval('#btn-scan', (el) => {
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'center' })
    el.click()
  }
})
const scanState = await page.waitForFunction(
  () => {
    if (document.querySelector('#btn-scan-text')) return 'text'
    if (document.querySelector('#edit-form')) return 'edit'
    if (document.querySelector('#btn-save-qty')) return 'qty'
    return false
  },
  { timeout: 8000 },
)
if ((await scanState.jsonValue()) === 'text') {
  const label = await page.$eval('#btn-scan-text', (el) => el.textContent || '')
  if (!label.includes('Samo tekst')) throw new Error(`Gumb Samo tekst: ${label}`)
}
if (errors.length) throw new Error(`Skeniranje je podrlo stran: ${errors.join('; ')}`)
await page.evaluate(() => {
  const btn = document.querySelector('#btn-cancel-scan, #btn-cancel-edit, #btn-cancel-qty')
  if (btn instanceof HTMLElement) btn.click()
})
await page.waitForFunction(() => !document.querySelector('#scan-overlay'))

await page.screenshot({ path: path.join(outDir, 'home-390.png'), fullPage: true })

await page.click('.card .card-main h2')
await page.waitForSelector('#btn-delete')
await page.click('#btn-delete')
await page.waitForSelector('#btn-confirm-delete')
await page.click('#btn-cancel-delete')
await page.waitForSelector('#edit-form')
await page.click('#btn-delete')
await page.waitForSelector('#btn-confirm-delete')
await page.click('#btn-confirm-delete')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 0)
const afterDelete = await page.$eval('#totals', (el) => el.textContent || '')
if (!afterDelete.includes('0 artiklov') || !afterDelete.includes('0 kos')) throw new Error(`Po izbrisu: ${afterDelete}`)

await browser.close()
server.close()

if (errors.length) {
  throw new Error(`Napake v strani: ${errors.join('; ')}`)
}

console.log(`SMOKE OK  title=${title}  xlsx=${downloaded}  csv=${csvFile}  backup=${backupFile}  syncRequestsBlocked=${syncRequests}  url=${origin}`)
