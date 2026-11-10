export type ScanHandle = {
  stop: () => Promise<void>
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
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

async function startNativeScan(video: HTMLVideoElement, onCode: (text: string) => void): Promise<ScanHandle> {
  const Ctor = getBarcodeDetector()
  if (!Ctor) throw new Error('BarcodeDetector ni na voljo')
  const detector = new Ctor({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
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
        const value = codes[0]?.rawValue?.trim()
        if (value) {
          await stop()
          onCode(value)
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

async function startZxingScan(video: HTMLVideoElement, onCode: (text: string) => void): Promise<ScanHandle> {
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
  ])
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
      ctrl.stop()
      onCode(text)
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

export async function startScan(video: HTMLVideoElement, onCode: (text: string) => void): Promise<ScanHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Ta brskalnik nima dostopa do kamere.')
  }
  if (canUseNativeDetector()) {
    try {
      return await startNativeScan(video, onCode)
    } catch (err) {
      if (isPermissionError(err)) throw err
      /* Native detector may exist but fail; fall through to ZXing. */
    }
  }
  return startZxingScan(video, onCode)
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
