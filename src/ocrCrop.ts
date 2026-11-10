/** Izrez za OCR: sredina slike ali merjeni pravokotnik nad predogledom (object-fit: cover). */

export type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Relativni izrez v predogledu (sredinski pas nalepke). */
export const TEXT_CROP: CropRect = { x: 0.08, y: 0.26, width: 0.84, height: 0.4 }

export function clampCrop(crop: CropRect): CropRect {
  const x = Math.min(1, Math.max(0, crop.x))
  const y = Math.min(1, Math.max(0, crop.y))
  const width = Math.min(1 - x, Math.max(0.05, crop.width))
  const height = Math.min(1 - y, Math.max(0.05, crop.height))
  return { x, y, width, height }
}

/**
 * Pretvori izrez v koordinatah prikaza (object-fit: cover) v izvorne piksle slike/videa.
 */
export function sourceRectForCoverCrop(
  sourceW: number,
  sourceH: number,
  viewW: number,
  viewH: number,
  crop: CropRect,
): { sx: number; sy: number; sw: number; sh: number } {
  const c = clampCrop(crop)
  if (sourceW <= 0 || sourceH <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 }
  const vw = viewW > 0 ? viewW : sourceW
  const vh = viewH > 0 ? viewH : sourceH
  const scale = Math.max(vw / sourceW, vh / sourceH)
  const offsetX = (sourceW * scale - vw) / 2
  const offsetY = (sourceH * scale - vh) / 2
  const sx = Math.max(0, Math.round((c.x * vw + offsetX) / scale))
  const sy = Math.max(0, Math.round((c.y * vh + offsetY) / scale))
  const sw = Math.max(1, Math.min(sourceW - sx, Math.round((c.width * vw) / scale)))
  const sh = Math.max(1, Math.min(sourceH - sy, Math.round((c.height * vh) / scale)))
  return { sx, sy, sw, sh }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): string | undefined {
  try {
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return undefined
  }
}

export function cropCanvas(
  source: CanvasImageSource,
  _sourceW: number,
  _sourceH: number,
  rect: { sx: number; sy: number; sw: number; sh: number },
): HTMLCanvasElement | undefined {
  if (rect.sw < 2 || rect.sh < 2) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = rect.sw
  canvas.height = rect.sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh)
  return canvas
}

export function captureViewCrop(
  video: HTMLVideoElement,
  crop: CropRect = TEXT_CROP,
): string | undefined {
  const sourceW = video.videoWidth
  const sourceH = video.videoHeight
  if (!sourceW || !sourceH) return undefined
  const viewW = video.clientWidth || sourceW
  const viewH = video.clientHeight || sourceH
  const rect = sourceRectForCoverCrop(sourceW, sourceH, viewW, viewH, crop)
  const canvas = cropCanvas(video, sourceW, sourceH, rect)
  return canvas ? canvasToJpeg(canvas) : undefined
}

/** Sredinski izrez že zajete slike (data URL), kot da je prikaz 1:1. */
export async function cropDataUrl(dataUrl: string, crop: CropRect = TEXT_CROP): Promise<string | undefined> {
  const img = await loadImage(dataUrl)
  const rect = sourceRectForCoverCrop(img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight, crop)
  const canvas = cropCanvas(img, img.naturalWidth, img.naturalHeight, rect)
  return canvas ? canvasToJpeg(canvas) : undefined
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('slike ni bilo mogoče naložiti'))
    img.src = src
  })
}
