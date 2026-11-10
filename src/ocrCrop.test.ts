import { describe, expect, it } from 'vitest'
import { sourceRectForCoverCrop, TEXT_CROP, clampCrop } from './ocrCrop.ts'

describe('OCR izrez', () => {
  it('ohranja izrez znotraj slike pri prikazu 1:1', () => {
    const r = sourceRectForCoverCrop(4000, 3000, 4000, 3000, TEXT_CROP)
    expect(r.sx).toBeGreaterThanOrEqual(0)
    expect(r.sy).toBeGreaterThanOrEqual(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(4000)
    expect(r.sy + r.sh).toBeLessThanOrEqual(3000)
    expect(r.sw).toBeGreaterThan(1000)
    expect(r.sh).toBeGreaterThan(500)
  })

  it('pri object-fit: cover mape v izvorne piksle', () => {
    // slika 4000x3000 v oknu 3:4 (npr. 300x400) — obreže širino
    const r = sourceRectForCoverCrop(4000, 3000, 300, 400, { x: 0.1, y: 0.25, width: 0.8, height: 0.4 })
    expect(r.sx).toBeGreaterThanOrEqual(0)
    expect(r.sy).toBeGreaterThanOrEqual(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(4000)
    expect(r.sy + r.sh).toBeLessThanOrEqual(3000)
    expect(r.sw).toBeGreaterThan(0)
    expect(r.sh).toBeGreaterThan(0)
  })

  it('clamp prepreči izrez čez rob', () => {
    const c = clampCrop({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 })
    expect(c.x + c.width).toBeLessThanOrEqual(1)
    expect(c.y + c.height).toBeLessThanOrEqual(1)
  })
})
