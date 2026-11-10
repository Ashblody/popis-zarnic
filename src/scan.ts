import {
  NATIVE_BARCODE_FORMATS,
  mapNativeFormat,
  type ScanFormat,
  type ScanHit,
} from './scanParse.ts'
import {
  CODE_CROP,
  TEXT_CROP,
  cropCanvasByRect,
  scaleCanvasToMaxEdge,
} from './ocrCrop.ts'

export type { ScanFormat, ScanHit }

export type ScanResult = {
  hits: ScanHit[]
  frame?: string
}

export type ScanHandle = {
  stop: () => Promise<void>
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string; format?: string }>>
}

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function getBarcodeDetector(): BarcodeDetectorCtor | undefined {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor
}

export function canUseNativeDetector(): boolean {
  return typeof getBarcodeDetector() === 'function'
}

export function captureFrame(video: HTMLVideoElement): string | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(video, 0, 0)
  try {
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return undefined
  }
}

function uniqueHits(hits: ScanHit[]): ScanHit[] {
  const seen = new Set<string>()
  const out: ScanHit[] = []
  for (const hit of hits) {
    const text = hit.text.trim()
    if (!text) continue
    const key = `${hit.format}:${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ text, format: hit.format })
  }
  return out
}

function mapZxingFormat(format: { toString: () => string } | number | string): ScanFormat {
  const raw = String(format)
  const name = raw
  const table: Record<string, ScanFormat> = {
    '8': 'ean_8',
    '7': 'ean_13',
    '11': 'qr_code',
    '6': 'data_matrix',
    '1': 'code_128',
    '2': 'code_39',
    '12': 'upc_a',
    '13': 'upc_e',
    EAN_8: 'ean_8',
    EAN_13: 'ean_13',
    QR_CODE: 'qr_code',
    DATA_MATRIX: 'data_matrix',
    CODE_128: 'code_128',
    CODE_39: 'code_39',
    UPC_A: 'upc_a',
    UPC_E: 'upc_e',
  }
  return table[name] ?? table[name.toUpperCase()] ?? mapNativeFormat(name)
}

export async function decodeAllFromCanvas(canvas: HTMLCanvasElement): Promise<ScanHit[]> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const groups = [
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39],
    [BarcodeFormat.QR_CODE],
    [BarcodeFormat.DATA_MATRIX],
  ]
  const hits: ScanHit[] = []
  for (const formats of groups) {
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats)
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints)
    try {
      const result = await reader.decodeFromCanvas(canvas)
      const text = result.getText().trim()
      if (text) hits.push({ text, format: mapZxingFormat(result.getBarcodeFormat()) })
    } catch {
      /* ta skupina na sliki ni bila */
    }
  }
  return uniqueHits(hits)
}

function hasLinearHit(hits: ScanHit[]): boolean {
  return hits.some((h) => h.format === 'ean_13' || h.format === 'ean_8' || h.format === 'upc_a' || h.format === 'upc_e' || h.format === 'code_128' || h.format === 'code_39')
}

function hasMatrixHit(hits: ScanHit[]): boolean {
  return hits.some((h) => h.format === 'qr_code' || h.format === 'data_matrix')
}

function decodeCandidatesFrom(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = []
  const seen = new Set<string>()
  const add = (c: HTMLCanvasElement | undefined) => {
    if (!c) return
    const key = `${c.width}x${c.height}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(c)
  }
  const tight = cropCanvasByRect(canvas, CODE_CROP)
  const band = cropCanvasByRect(canvas, TEXT_CROP)
  add(tight)
  if (tight) add(scaleCanvasToMaxEdge(tight, 2000))
  if (band) {
    add(scaleCanvasToMaxEdge(band, 2000))
    add(scaleCanvasToMaxEdge(band, 1600))
    add(scaleCanvasToMaxEdge(band, 1300))
  }
  return out
}

/**
 * ZXing na celi sliki, nato na ožjem pasu in pomanjšanih izrezih.
 * Na velikih (12 Mpx) slikah z roko v kadru polni kader pogosto vidi samo EAN, QR pa izrez.
 */
export async function decodeBarcodesFromCanvas(canvas: HTMLCanvasElement): Promise<ScanHit[]> {
  let hits = await decodeAllFromCanvas(canvas)
  if (hasLinearHit(hits) && hasMatrixHit(hits)) return hits
  for (const candidate of decodeCandidatesFrom(canvas)) {
    try {
      hits = uniqueHits([...hits, ...(await decodeAllFromCanvas(candidate))])
    } catch {
      /* ta izrez ni dal kode */
    }
    if (hasLinearHit(hits) && hasMatrixHit(hits)) return hits
  }
  return hits
}

function canvasFromVideo(video: HTMLVideoElement): HTMLCanvasElement | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(video, 0, 0)
  return canvas
}

async function startNativeScan(video: HTMLVideoElement, onResult: (result: ScanResult) => void): Promise<ScanHandle> {
  const Ctor = getBarcodeDetector()
  if (!Ctor) throw new Error('BarcodeDetector ni na voljo')
  const detector = new Ctor({
    formats: [...NATIVE_BARCODE_FORMATS],
  })
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  })
  video.srcObject = stream
  await video.play()

  let stopped = false
  let raf = 0
  const tick = async () => {
    if (stopped) return
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video)
        let hits = uniqueHits(
          codes.map((c) => ({
            text: (c.rawValue ?? '').trim(),
            format: mapNativeFormat(c.format ?? ''),
          })),
        )
        if (hits.length) {
          const canvas = canvasFromVideo(video)
          const frame = canvas
            ? (() => {
                try {
                  return canvas.toDataURL('image/jpeg', 0.85)
                } catch {
                  return undefined
                }
              })()
            : captureFrame(video)
          if (canvas && !(hasLinearHit(hits) && hasMatrixHit(hits))) {
            try {
              hits = uniqueHits([...hits, ...(await decodeBarcodesFromCanvas(canvas))])
            } catch {
              /* ostane to, kar je zaznal BarcodeDetector */
            }
          }
          await stop()
          onResult({ hits, frame })
          return
        }
      }
    } catch {
      /* frame without a barcode, or detect() not ready yet */
    }
    raf = requestAnimationFrame(() => {
      void tick()
    })
  }
  raf = requestAnimationFrame(() => {
    void tick()
  })

  const stop = async () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }

  return { stop }
}

async function startZxingScan(video: HTMLVideoElement, onResult: (result: ScanResult) => void): Promise<ScanHandle> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new BrowserMultiFormatReader(hints)
  let settled = false
  const controls = await reader.decodeFromConstraints(
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    video,
    (result, _error, ctrl) => {
      if (settled || !result) return
      const text = result.getText().trim()
      if (!text) return
      settled = true
      const first: ScanHit = { text, format: mapZxingFormat(result.getBarcodeFormat()) }
      const canvas = canvasFromVideo(video)
      const frame = canvas
        ? (() => {
            try {
              return canvas.toDataURL('image/jpeg', 0.85)
            } catch {
              return undefined
            }
          })()
        : captureFrame(video)
      const finish = (hits: ScanHit[]) => {
        ctrl.stop()
        onResult({ hits: uniqueHits(hits), frame })
      }
      if (canvas) {
        void decodeBarcodesFromCanvas(canvas)
          .then((extra) => finish([first, ...extra]))
          .catch(() => finish([first]))
      } else {
        finish([first])
      }
    },
  )

  return {
    stop: async () => {
      settled = true
      controls.stop()
      const stream = video.srcObject
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      video.srcObject = null
    },
  }
}


export async function startCameraPreview(video: HTMLVideoElement): Promise<ScanHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Ta brskalnik nima dostopa do kamere.')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  })
  video.srcObject = stream
  await video.play()
  let stopped = false
  return {
    stop: async () => {
      if (stopped) return
      stopped = true
      stream.getTracks().forEach((track) => track.stop())
      video.srcObject = null
    },
  }
}

export async function startScan(video: HTMLVideoElement, onResult: (result: ScanResult) => void): Promise<ScanHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Ta brskalnik nima dostopa do kamere.')
  }
  if (canUseNativeDetector()) {
    try {
      return await startNativeScan(video, onResult)
    } catch (err) {
      if (isPermissionError(err)) throw err
      /* Native detector may exist but fail; fall through to ZXing. */
    }
  }
  return startZxingScan(video, onResult)
}

export function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String(err.name) : ''
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
}

export function scanErrorMessage(err: unknown): string {
  if (isPermissionError(err)) {
    return 'Dostop do kamere je zavrnjen. V nastavitvah brskalnika dovoli kamero ali vpiši artikel ročno.'
  }
  if (err && typeof err === 'object' && 'name' in err && String(err.name) === 'NotFoundError') {
    return 'Kamere nisem našel. Preveri, ali telefon ima kamero, ali vpiši artikel ročno.'
  }
  const msg = err instanceof Error ? err.message : ''
  if (msg) return msg
  return 'Kamere trenutno ni mogoče odpreti. Poskusi znova ali vpiši artikel ročno.'
}
