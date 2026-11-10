// @vitest-environment node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickPreferredScan } from './scanParse.ts'

const SRC = '/workspace/popis/test_mitutoyo_2.jpg'
const CHROME = '/usr/bin/google-chrome-stable'
const QR = '00|500-706-20|3G|4946368693927||01|01'
const EAN = '4946368693927'

const tmpDir = path.join(os.tmpdir(), 'popis-zarnic-scan-mitutoyo')
const upright = path.join(tmpDir, 'upright.jpg')
const bundle = path.join(tmpDir, 'scan-probe.js')

function prepare(): void {
  fs.mkdirSync(tmpDir, { recursive: true })
  const py = `
from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open(${JSON.stringify(SRC)}))
im.save(${JSON.stringify(upright)}, quality=95)
print(im.size)
`
  execFileSync('python3', ['-c', py], { encoding: 'utf8' })
  const entry = path.join(tmpDir, 'entry.mjs')
  fs.writeFileSync(
    entry,
    "import { decodeAllFromCanvas, decodeBarcodesFromCanvas } from '/workspace/popis-zarnic/src/scan.ts'\n" +
      'window.decodeAllFromCanvas = decodeAllFromCanvas\n' +
      'window.decodeBarcodesFromCanvas = decodeBarcodesFromCanvas\n',
  )
  execFileSync(
    'npx',
    ['esbuild', entry, '--bundle', '--format=iife', `--outfile=${bundle}`, '--platform=browser'],
    { cwd: '/workspace/popis-zarnic', encoding: 'utf8' },
  )
}

describe('ZXing na fotografiji Mitutoyo (30 cm, po EXIF obratu)', () => {
  it(
    'izrez/pomanjšanje najde QR in EAN; razčlenjevalnik vzame šifro iz QR in EAN kot ključ',
    async () => {
      if (!fs.existsSync(SRC) || !fs.existsSync(CHROME)) return
      prepare()
      const html = '<!doctype html><meta charset="utf-8"><script src="/scan-probe.js"></script>'
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (url.pathname === '/') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(html)
          return
        }
        const file = url.pathname === '/upright.jpg' ? upright : url.pathname === '/scan-probe.js' ? bundle : ''
        if (!file) {
          res.writeHead(404)
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'image/jpeg' })
        fs.createReadStream(file).pipe(res)
      })
      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          resolve(typeof addr === 'object' && addr ? addr.port : 0)
        })
      })
      const puppeteer = await import('puppeteer-core')
      const browser = await puppeteer.default.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })
      try {
        const page = await browser.newPage()
        page.setDefaultTimeout(120_000)
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' })
        const result = await page.evaluate(async (origin: string) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('slike ni bilo mogoče naložiti'))
            img.src = `${origin}/upright.jpg`
          })
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d')!.drawImage(img, 0, 0)
          const full = await (window as unknown as { decodeAllFromCanvas: (c: HTMLCanvasElement) => Promise<Array<{ text?: string; format?: string }>> }).decodeAllFromCanvas(canvas)
          const merged = await (window as unknown as { decodeBarcodesFromCanvas: (c: HTMLCanvasElement) => Promise<Array<{ text?: string; format?: string }>> }).decodeBarcodesFromCanvas(canvas)
          const native = typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function' ? 'present' : 'unavailable'
          return { w: canvas.width, h: canvas.height, native, full, merged }
        }, `http://127.0.0.1:${port}`)
        const mergedHits = (result.merged as Array<{ text?: string; format?: string }>)
          .filter((h) => h.text)
          .map((h) => ({ text: h.text!, format: (h.format ?? 'unknown') as 'ean_13' | 'qr_code' | 'unknown' }))
        const picked = pickPreferredScan(mergedHits)
        expect(result.native, 'BarcodeDetector v tem Chromium ni na voljo (pričakovano)').toBe('unavailable')
        expect(mergedHits.some((h) => h.format === 'ean_13' && h.text === EAN)).toBe(true)
        expect(mergedHits.some((h) => h.format === 'qr_code' && h.text === QR)).toBe(true)
        expect(picked.ean).toBe(EAN)
        expect(picked.sifra).toBe('500-706-20')
        expect(picked.key).toBe(EAN)
        fs.writeFileSync(path.join(tmpDir, 'result.json'), JSON.stringify({ result, picked }, null, 2))
      } finally {
        await browser.close()
        server.close()
      }
    },
    120_000,
  )
})
