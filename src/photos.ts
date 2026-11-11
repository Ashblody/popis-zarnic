/** Fotografije artiklov: samo na tem telefonu (IndexedDB), pomanjšane na ~800 px JPEG. */
import { fitWithin } from './features.ts'

const DB_NAME = 'popis-zarnic-photos'
const STORE = 'photos'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb'))
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const req = run(t.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexeddb'))
    })
  } finally {
    db.close()
  }
}

export async function getPhoto(id: string): Promise<string | undefined> {
  try {
    const v = await tx<unknown>('readonly', (s) => s.get(id))
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
  }
}

export async function putPhoto(id: string, dataUrl: string): Promise<void> {
  await tx('readwrite', (s) => s.put(dataUrl, id))
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* ni fotografije */
  }
}

export async function allPhotos(): Promise<Record<string, string>> {
  try {
    const db = await openDb()
    try {
      return await new Promise((resolve, reject) => {
        const out: Record<string, string> = {}
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const cur = req.result
          if (!cur) {
            resolve(out)
            return
          }
          if (typeof cur.value === 'string') out[String(cur.key)] = cur.value
          cur.continue()
        }
        req.onerror = () => reject(req.error ?? new Error('indexeddb'))
      })
    } finally {
      db.close()
    }
  } catch {
    return {}
  }
}

/** Iz datoteke s kamere/galerije naredi JPEG z daljšo stranico do 800 px. */
export async function compressPhoto(file: Blob, max = 800, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('slika'))
      el.src = url
    })
    const size = fitWithin(img.naturalWidth, img.naturalHeight, max)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, size.width, size.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
