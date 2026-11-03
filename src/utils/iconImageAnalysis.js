// The server stores no icon draw style, so it is derived from the pixels: a glyph (one ink colour
// on transparency) is drawn as a mask in the built-in icon's colour, a picture in its own colours.

export const ICON_STYLE = Object.freeze({ GLYPH: 'glyph', PICTURE: 'picture' })

/** Long side of the sampling canvas. */
const SAMPLE_SIZE = 48

const TRANSPARENT_ALPHA = 16
const INK_ALPHA = 128

/** RMS distance from the mean ink colour (0..1) up to which an image is "one colour". */
const GLYPH_MAX_SPREAD = 0.12
/** Share of the area that has to be transparent before an image counts as a shape. */
const GLYPH_MIN_TRANSPARENT = 0.1

/** Relative luminance of the surfaces icons sit on (card background, map node fill). */
const BACKGROUND_LUMINANCE = { light: 1, dark: relativeLuminance(0x1e, 0x29, 0x3b) }

/** Below this contrast ratio against the background a picture gets an outline. */
const HALO_CONTRAST = 1.8

function channelToLinear(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of an sRGB colour, 0..1. */
export function relativeLuminance(r, g, b) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

/** WCAG contrast ratio of two relative luminances, 1..21. */
export function contrastRatio(a, b) {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Red, orange or yellow and saturated enough to be confused with a status colour. */
function isStatusLikeHue(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 90 || max === 0 || (max - min) / max < 0.5) return false
  let hue
  if (max === r) hue = (60 * ((g - b) / (max - min)) + 360) % 360
  else if (max === g) hue = 60 * ((b - r) / (max - min)) + 120
  else hue = 60 * ((r - g) / (max - min)) + 240
  return hue <= 62 || hue >= 345
}

/**
 * RGBA buffer in `ImageData.data` layout, not premultiplied.
 *
 * @param {Uint8ClampedArray|number[]} data
 * @param {number} width
 * @param {number} height
 * @returns {{ transparentFraction: number, inkFraction: number, inkLuminance: number,
 *   colorSpread: number, statusHueFraction: number }}
 */
export function measurePixels(data, width, height) {
  const total = width * height
  let transparent = 0
  let ink = 0
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumLum = 0
  let statusLike = 0
  for (let i = 0; i < total * 4; i += 4) {
    const a = data[i + 3]
    if (a < TRANSPARENT_ALPHA) transparent++
    if (a < INK_ALPHA) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    ink++
    sumR += r
    sumG += g
    sumB += b
    sumLum += relativeLuminance(r, g, b)
    if (isStatusLikeHue(r, g, b)) statusLike++
  }
  if (ink === 0) {
    return {
      transparentFraction: total ? transparent / total : 1,
      inkFraction: 0,
      inkLuminance: 0,
      colorSpread: 0,
      statusHueFraction: 0,
    }
  }
  const meanR = sumR / ink
  const meanG = sumG / ink
  const meanB = sumB / ink
  let squared = 0
  for (let i = 0; i < total * 4; i += 4) {
    if (data[i + 3] < INK_ALPHA) continue
    squared += (data[i] - meanR) ** 2 + (data[i + 1] - meanG) ** 2 + (data[i + 2] - meanB) ** 2
  }
  return {
    transparentFraction: transparent / total,
    inkFraction: ink / total,
    inkLuminance: sumLum / ink,
    colorSpread: Math.sqrt(squared / ink) / 255,
    statusHueFraction: statusLike / ink,
  }
}

/**
 * @param {object|null} metrics - from `measurePixels`; null when the image could not be read
 * @returns {string} an ICON_STYLE value. Unreadable images are pictures: drawn as they are.
 */
export function classifyIconStyle(metrics) {
  if (!metrics) return ICON_STYLE.PICTURE
  const isShape = metrics.transparentFraction >= GLYPH_MIN_TRANSPARENT && metrics.inkFraction > 0
  return isShape && metrics.colorSpread <= GLYPH_MAX_SPREAD ? ICON_STYLE.GLYPH : ICON_STYLE.PICTURE
}

/**
 * Glyphs never need an outline: they are drawn in the theme's own icon colours.
 *
 * @param {object|null} analysis
 * @param {boolean} dark
 * @returns {'light'|'dark'|null} colour of the outline
 */
export function iconHalo(analysis, dark) {
  if (!analysis || analysis.style !== ICON_STYLE.PICTURE || !analysis.inkFraction) return null
  const background = dark ? BACKGROUND_LUMINANCE.dark : BACKGROUND_LUMINANCE.light
  if (contrastRatio(analysis.inkLuminance, background) >= HALO_CONTRAST) return null
  return dark ? 'light' : 'dark'
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image failed to load'))
    img.src = url
  })
}

/**
 * Never rejects: an unreadable image comes back as a picture with null metrics.
 *
 * @param {string} url - blob URL
 * @param {{ type?: string }} [info]
 * @returns {Promise<object>} `{ width, height, vector, style, ...metrics }`
 */
export async function analyzeIconImage(url, info = {}) {
  const vector = info.type === 'image/svg+xml'
  let img
  try {
    img = await loadImage(url)
  } catch {
    return { width: 0, height: 0, vector, style: ICON_STYLE.PICTURE, failed: true }
  }
  // An SVG without width/height has no intrinsic size.
  const width = img.naturalWidth || 0
  const height = img.naturalHeight || 0
  const ratio = width && height ? width / height : 1
  // Letterboxing onto a square canvas would add transparent bands and make a photo a shape.
  const sampleWidth = Math.max(1, Math.round(ratio >= 1 ? SAMPLE_SIZE : SAMPLE_SIZE * ratio))
  const sampleHeight = Math.max(1, Math.round(ratio >= 1 ? SAMPLE_SIZE / ratio : SAMPLE_SIZE))
  let metrics
  try {
    const canvas = document.createElement('canvas')
    canvas.width = sampleWidth
    canvas.height = sampleHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(img, 0, 0, sampleWidth, sampleHeight)
    metrics = measurePixels(
      context.getImageData(0, 0, sampleWidth, sampleHeight).data,
      sampleWidth,
      sampleHeight,
    )
  } catch {
    metrics = null
  }
  return { width, height, vector, ...metrics, style: classifyIconStyle(metrics) }
}

export const IMAGE_ROLE = Object.freeze({ ICON: 'icon', MAP: 'map' })

const MIN_SHARP_SIZE = { icon: 32, map: 48 }
const HEAVY_BYTES = { icon: 50 * 1024, map: 200 * 1024 }

/**
 * @param {object|null} analysis - from `analyzeIconImage`
 * @param {{ role?: string, byteSize?: number|null }} [options]
 * @returns {{ id: string, text: string }[]}
 */
export function iconQualityHints(analysis, { role = IMAGE_ROLE.ICON, byteSize = null } = {}) {
  if (!analysis) return []
  if (analysis.failed) {
    return [{ id: 'unreadable', text: 'The browser could not decode this image.' }]
  }
  const hints = []
  const { width, height } = analysis
  const longSide = Math.max(width, height)
  if (!analysis.vector && longSide > 0 && longSide < MIN_SHARP_SIZE[role]) {
    hints.push({
      id: 'too-small',
      text:
        role === IMAGE_ROLE.MAP
          ? `Only ${width}×${height} px. Maps draw it at up to 36 px and can zoom in further, so it will look blurry. Use 64 px or more, or an SVG.`
          : `Only ${width}×${height} px. On high-resolution screens it will look soft. Use 32 px or more, or an SVG.`,
    })
  }
  if (width && height && Math.max(width / height, height / width) > 1.25) {
    hints.push({
      id: 'not-square',
      text: `Not square (${width}×${height}). It is shrunk to fit a square, so it draws smaller than other icons.`,
    })
  }
  if (analysis.transparentFraction != null && analysis.transparentFraction < 0.02) {
    hints.push({
      id: 'opaque',
      text: 'No transparent background, so it shows as a filled box rather than a shape.',
    })
  }
  if (analysis.style === ICON_STYLE.PICTURE && analysis.inkFraction) {
    for (const [theme, dark] of [
      ['light', false],
      ['dark', true],
    ]) {
      if (iconHalo(analysis, dark)) {
        hints.push({
          id: `low-contrast-${theme}`,
          text: `Low contrast on the ${theme} theme. The console outlines it there, but it will still look faint.`,
        })
      }
    }
  }
  if ((analysis.statusHueFraction ?? 0) > 0.4) {
    hints.push({
      id: 'status-colors',
      text: 'Mostly red, orange or yellow. Next to the status colours it can be mistaken for an alarm.',
    })
  }
  if (byteSize != null && byteSize > HEAVY_BYTES[role]) {
    hints.push({
      id: 'heavy',
      text: `${Math.round(byteSize / 1024)} KB. Every session downloads it again (the server does not let browsers cache images), so keep icons small.`,
    })
  }
  return hints
}
