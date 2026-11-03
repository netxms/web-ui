import { describe, it, expect } from 'vitest'
import {
  parseConfigColor,
  toApiColor,
  bgrIntToHex,
  safeBgrIntToHex,
  hexToBgrInt,
} from '@/utils/colorUtils'

describe('parseConfigColor', () => {
  it('reads config colors as BGR ints (red in the low byte)', () => {
    // ColorConverter.rgbFromInt in the legacy client: RGB(v & 0xFF, v >> 8, v >> 16).
    expect(parseConfigColor('0xFF8800')).toBe('#0088ff')
    expect(parseConfigColor('0xFF0000')).toBe('#0000ff')
    expect(parseConfigColor('ff8800')).toBe('#0088ff')
    expect(parseConfigColor(0x112233)).toBe('#332211')
  })

  it('leaves a CSS value alone - those come from our own pickers', () => {
    expect(parseConfigColor('#FF8800')).toBe('#ff8800')
  })

  it('pads legacy colors written without leading zeroes', () => {
    // The legacy writer is '0x' + Integer.toHexString(int), so 0x008000 is stored as '0x8000'.
    expect(parseConfigColor('0x8000')).toBe('#008000')
    expect(parseConfigColor('0x0')).toBe('#000000')
    expect(parseConfigColor('0xFF')).toBe('#ff0000')
    expect(parseConfigColor('c000')).toBe('#00c000')
  })

  it('parses decimal integer strings', () => {
    // 16748574 == 0xFF901E == RGB(0x1E, 0x90, 0xFF) - dodgerblue.
    expect(parseConfigColor('16748574')).toBe('#1e90ff')
  })

  it('discards the alpha/high byte', () => {
    expect(parseConfigColor('0xFF00C000')).toBe('#00c000')
    expect(parseConfigColor(-1)).toBe('#ffffff')
  })

  it('returns null for auto/empty/unrecognized', () => {
    expect(parseConfigColor('auto')).toBeNull()
    expect(parseConfigColor('')).toBeNull()
    expect(parseConfigColor(null)).toBeNull()
    expect(parseConfigColor('not a color')).toBeNull()
  })
})

describe('toApiColor', () => {
  it('serializes back to the 0xBBGGRR form', () => {
    expect(toApiColor('#ff8800')).toBe('0x0088FF')
    expect(toApiColor(null)).toBeNull()
  })

  it('round-trips a color stored without leading zeroes, padded', () => {
    expect(toApiColor(parseConfigColor('0x8000'))).toBe('0x008000')
    expect(toApiColor(parseConfigColor('0xFF0000'))).toBe('0xFF0000')
  })

  it('expands the #rgb shorthand', () => {
    expect(toApiColor('#f80')).toBe('0x0088FF')
  })

  it('returns null for a value that is not a hex color', () => {
    expect(toApiColor('red')).toBeNull()
  })
})

describe('BGR int helpers', () => {
  it('converts both ways', () => {
    expect(bgrIntToHex(0x8000)).toBe('#008000')
    expect(hexToBgrInt('#ff0000')).toBe(255) // pure red -> low byte
    expect(hexToBgrInt('#40699c')).toBe(10250560) // group-box default RGB(64,105,156)
  })

  it('treats the all-ones sentinel as "use default"', () => {
    expect(safeBgrIntToHex(4294967295)).toBeNull()
    expect(safeBgrIntToHex(null)).toBeNull()
    expect(safeBgrIntToHex(0)).toBe('#000000')
  })
})
