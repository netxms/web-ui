// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  ICON_STYLE,
  IMAGE_ROLE,
  classifyIconStyle,
  contrastRatio,
  iconHalo,
  iconQualityHints,
  measurePixels,
  relativeLuminance,
} from '@/utils/iconImageAnalysis'

/** A width x height RGBA buffer, filled by `paint(x, y)` returning [r, g, b, a]. */
function pixels(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(paint(x, y), (y * width + x) * 4)
    }
  }
  return data
}

/** A filled square in the middle of a transparent 10x10 canvas. */
const shape = (color) =>
  pixels(10, 10, (x, y) => (x > 2 && x < 7 && y > 2 && y < 7 ? color : [0, 0, 0, 0]))

describe('measurePixels and classifyIconStyle', () => {
  it('reads a single ink colour on a transparent background as a glyph', () => {
    const metrics = measurePixels(shape([20, 20, 20, 255]), 10, 10)
    expect(metrics.transparentFraction).toBeCloseTo(0.84)
    expect(metrics.colorSpread).toBe(0)
    expect(classifyIconStyle(metrics)).toBe(ICON_STYLE.GLYPH)
  })

  it('reads an opaque image as a picture even when it is one colour', () => {
    const metrics = measurePixels(
      pixels(10, 10, () => [20, 20, 20, 255]),
      10,
      10,
    )
    expect(metrics.transparentFraction).toBe(0)
    expect(classifyIconStyle(metrics)).toBe(ICON_STYLE.PICTURE)
  })

  it('reads several ink colours as a picture', () => {
    const data = pixels(10, 10, (x, y) => {
      if (x < 3 || y < 3) return [0, 0, 0, 0]
      return x < 6 ? [220, 30, 30, 255] : [30, 90, 220, 255]
    })
    expect(classifyIconStyle(measurePixels(data, 10, 10))).toBe(ICON_STYLE.PICTURE)
  })

  it('treats an unreadable image as a picture, drawn as it is', () => {
    expect(classifyIconStyle(null)).toBe(ICON_STYLE.PICTURE)
  })

  it('counts saturated reds, oranges and yellows as status-like', () => {
    expect(measurePixels(shape([230, 120, 10, 255]), 10, 10).statusHueFraction).toBe(1)
    expect(measurePixels(shape([30, 90, 220, 255]), 10, 10).statusHueFraction).toBe(0)
    // Grey has no hue, however warm the sum of its channels.
    expect(measurePixels(shape([128, 128, 128, 255]), 10, 10).statusHueFraction).toBe(0)
  })
})

describe('contrast helpers', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1)
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(contrastRatio(1, 0)).toBeCloseTo(21)
    expect(contrastRatio(0, 1)).toBeCloseTo(21)
  })
})

describe('iconHalo', () => {
  const picture = (inkLuminance) => ({ style: ICON_STYLE.PICTURE, inkFraction: 0.5, inkLuminance })

  it('outlines a dark picture on the dark theme and a light one on the light theme', () => {
    expect(iconHalo(picture(0.01), true)).toBe('light')
    expect(iconHalo(picture(0.01), false)).toBeNull()
    expect(iconHalo(picture(0.95), false)).toBe('dark')
    expect(iconHalo(picture(0.95), true)).toBeNull()
  })

  it('never outlines a glyph: it is drawn in the theme colours', () => {
    expect(
      iconHalo({ style: ICON_STYLE.GLYPH, inkFraction: 0.5, inkLuminance: 0 }, true),
    ).toBeNull()
  })
})

describe('iconQualityHints', () => {
  const base = {
    style: ICON_STYLE.GLYPH,
    width: 64,
    height: 64,
    vector: false,
    transparentFraction: 0.5,
    inkFraction: 0.3,
    inkLuminance: 0.1,
    statusHueFraction: 0,
  }
  const ids = (analysis, options) => iconQualityHints(analysis, options).map((h) => h.id)

  it('has nothing to say about a good icon', () => {
    expect(ids(base)).toEqual([])
  })

  it('flags a small raster image, by role, but never an SVG', () => {
    expect(ids({ ...base, width: 24, height: 24 })).toEqual(['too-small'])
    expect(ids({ ...base, width: 40, height: 40 })).toEqual([])
    expect(ids({ ...base, width: 40, height: 40 }, { role: IMAGE_ROLE.MAP })).toEqual(['too-small'])
    expect(ids({ ...base, width: 16, height: 16, vector: true })).toEqual([])
  })

  it('flags a non-square image', () => {
    expect(ids({ ...base, width: 128, height: 64 })).toEqual(['not-square'])
  })

  it('flags an image without a transparent background', () => {
    expect(
      ids({ ...base, style: ICON_STYLE.PICTURE, transparentFraction: 0, inkLuminance: 0.4 }),
    ).toEqual(['opaque'])
  })

  it('flags a picture that disappears on one theme', () => {
    expect(ids({ ...base, style: ICON_STYLE.PICTURE, inkLuminance: 0.01 })).toEqual([
      'low-contrast-dark',
    ])
  })

  it('flags status-like colours and heavy files', () => {
    expect(ids({ ...base, statusHueFraction: 0.8 })).toEqual(['status-colors'])
    expect(ids(base, { byteSize: 80 * 1024 })).toEqual(['heavy'])
    expect(ids(base, { role: IMAGE_ROLE.MAP, byteSize: 80 * 1024 })).toEqual([])
  })

  it('reports an image the browser could not decode', () => {
    expect(ids({ failed: true })).toEqual(['unreadable'])
  })
})
