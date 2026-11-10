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

const client = await page.createCDPSession()
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: outDir,
})

await page.goto(origin, { waitUntil: 'networkidle0' })
const title = await page.title()
if (!title.includes('Popis žarnic')) throw new Error(`Unexpected title: ${title}`)
const homeText = await page.$eval('#app', (el) => el.innerText)
if (!homeText.includes('v1.2.0')) throw new Error(`Manjka različica v1.2.0: ${homeText.slice(0, 200)}`)
if (!(await page.$('#btn-sync'))) throw new Error('Manjka gumb Skupna zaloga')

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

await page.click('#btn-export')
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

await page.$eval('#btn-sync', (el) => {
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'center' })
    el.click()
  }
})
await page.waitForSelector('#sync-overlay #btn-sync-close')
const syncTitle = await page.$eval('#sync-overlay h2', (el) => el.textContent || '')
if (!syncTitle.includes('Skupna zaloga')) throw new Error(`Nastavitve skupne zaloge: ${syncTitle}`)
await page.$eval('#sync-overlay #btn-sync-close', (el) => {
  if (el instanceof HTMLElement) el.click()
})
await page.waitForFunction(() => !document.querySelector('#sync-overlay'))

await page.$eval('#btn-scan', (el) => {
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'center' })
    el.click()
  }
})
await page.waitForFunction(
  () =>
    document.querySelector('#scan-overlay') ||
    document.querySelector('#edit-form') ||
    document.querySelector('#btn-save-qty'),
  { timeout: 8000 },
)
if (errors.length) throw new Error(`Skeniranje je podrlo stran: ${errors.join('; ')}`)
if (await page.$('#btn-cancel-scan')) {
  await page.$eval('#btn-cancel-scan', (el) => {
    if (el instanceof HTMLElement) el.click()
  })
  await page.waitForFunction(() => !document.querySelector('#scan-overlay'))
} else if (await page.$('#btn-cancel-edit')) {
  await page.$eval('#btn-cancel-edit', (el) => {
    if (el instanceof HTMLElement) el.click()
  })
} else if (await page.$('#btn-cancel-qty')) {
  await page.$eval('#btn-cancel-qty', (el) => {
    if (el instanceof HTMLElement) el.click()
  })
}
await page.waitForFunction(() => !document.querySelector('#scan-overlay'))

await page.screenshot({ path: path.join(outDir, 'home-390.png'), fullPage: true })

await browser.close()
server.close()

if (errors.length) {
  throw new Error(`Napake v strani: ${errors.join('; ')}`)
}

console.log(`SMOKE OK  title=${title}  xlsx=${downloaded}  url=${origin}`)
