// @vitest-environment node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorker, PSM } from 'tesseract.js'
import { TEXT_CROP } from './ocrCrop.ts'

const SRC = '/workspace/popis/test_nalepka.jpg'
const tessLang = path.resolve(import.meta.dirname, '../public/tess')

function prepareCrop(): string {
  const dest = path.join(os.tmpdir(), 'popis-zarnic-nalepka-crop.jpg')
  const py = `
from PIL import Image, ImageOps
im = Image.open(${JSON.stringify(SRC)})
im = ImageOps.exif_transpose(im)
w, h = im.size
x, y, cw, ch = ${TEXT_CROP.x}, ${TEXT_CROP.y}, ${TEXT_CROP.width}, ${TEXT_CROP.height}
box = (int(x * w), int(y * h), int((x + cw) * w), int((y + ch) * h))
im.crop(box).save(${JSON.stringify(dest)}, quality=90)
print(w, h, box)
`
  execFileSync('python3', ['-c', py], { encoding: 'utf8' })
  return dest
}

describe('OCR izrez na pravi nalepki', () => {
  it(
    'prebere model ali šifro z Mitutoyo nalepke po TEXT_CROP (po EXIF obratu)',
    async () => {
      if (!fs.existsSync(SRC) || !fs.existsSync(path.join(tessLang, 'eng.traineddata.gz'))) {
        return
      }
      const crop = prepareCrop()
      const t0 = Date.now()
      const worker = await createWorker('eng', 1, {
        langPath: tessLang,
        gzip: true,
        cachePath: path.join(os.tmpdir(), 'popis-zarnic-tess-cache'),
        logger: () => {
          /* merimo čas, ne log */
        },
      })
      const initMs = Date.now() - t0
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      const recStart = Date.now()
      const { data } = await worker.recognize(crop)
      const recMs = Date.now() - recStart
      await worker.terminate()
      const text = (data.text ?? '').trim()
      fs.writeFileSync(
        path.join(os.tmpdir(), 'popis-zarnic-ocr-timing.json'),
        JSON.stringify({ initMs, recMs, totalMs: Date.now() - t0, text }, null, 2),
      )
      expect(initMs + recMs).toBeGreaterThan(0)
      const folded = text.toUpperCase().replace(/[^A-Z0-9]+/g, '')
      const hit =
        /CD-?P?I?15P/.test(text.toUpperCase()) ||
        folded.includes('CDP15P') ||
        folded.includes('CDPI15P') ||
        folded.includes('50070620') ||
        /706-?20/.test(text)
      expect(hit, `OCR ni ujel modela ali šifre: ${text.slice(0, 180)}`).toBe(true)
    },
    90_000,
  )
})
