import { describe, expect, it } from 'vitest'
import { adjustEntered, applyQuantity, parseCount } from './quantity.ts'

describe('parseCount', () => {
  it('sprejme cela števila', () => {
    expect(parseCount('12')).toBe(12)
    expect(parseCount(' 0 ')).toBe(0)
  })

  it('zavrne neveljavno', () => {
    expect(parseCount('')).toBeNull()
    expect(parseCount('abc')).toBeNull()
  })
})

describe('applyQuantity', () => {
  it('nastavi količino', () => {
    expect(applyQuantity({ current: 5, entered: 12, mode: 'set' })).toBe(12)
  })

  it('prišteje količino', () => {
    expect(applyQuantity({ current: 5, entered: 3, mode: 'add' })).toBe(8)
  })

  it('ne gre pod 0', () => {
    expect(applyQuantity({ current: 2, entered: -5, mode: 'add' })).toBe(0)
  })
})

describe('adjustEntered', () => {
  it('prišteje korake in ostane nad 0', () => {
    expect(adjustEntered('5', 10)).toBe('15')
    expect(adjustEntered('3', -10)).toBe('0')
  })
})
