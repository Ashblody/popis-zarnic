/** Lenilo naloži Tesseract.js; worker in jezik se po prvi uporabi shranita za brez povezave. */

import { PSM, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | undefined

function tessBase(): string {
  return `${import.meta.env.BASE_URL}tess/`
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const base = tessBase()
      const worker = await createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        cacheMethod: 'indexeddb',
        gzip: true,
        logger: () => {
          /* tiho — vmesnik ima svoje sporočilo */
        },
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      return worker
    })().catch((err: unknown) => {
      workerPromise = undefined
      throw err
    })
  }
  return workerPromise
}

export async function recognizeLabel(image: string): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  return (data.text ?? '').trim()
}
