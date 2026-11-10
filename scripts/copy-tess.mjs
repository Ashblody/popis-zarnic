import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'public', 'tess')
fs.mkdirSync(dest, { recursive: true })

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
]

for (const [from, name] of copies) {
  const src = path.join(root, from)
  if (!fs.existsSync(src)) {
    throw new Error(`Manjka ${from} — najprej zaženi npm install.`)
  }
  fs.copyFileSync(src, path.join(dest, name))
}

const langUrl =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
const langDest = path.join(dest, 'eng.traineddata.gz')

if (!fs.existsSync(langDest) || fs.statSync(langDest).size < 1000) {
  await new Promise((resolve, reject) => {
    const write = (url, redirects = 0) => {
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirects > 5) {
              reject(new Error('Preveč preusmeritev pri prenosu eng.traineddata.gz'))
              return
            }
            write(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Prenos jezikovnih podatkov ni uspel: ${res.statusCode}`))
            res.resume()
            return
          }
          const out = fs.createWriteStream(langDest)
          res.pipe(out)
          out.on('finish', () => out.close(resolve))
          out.on('error', reject)
        })
        .on('error', reject)
    }
    write(langUrl)
  })
}

console.log('copy-tess OK', fs.readdirSync(dest).join(', '))
