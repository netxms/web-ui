/**
 * Per-node geometry for the network map canvas, one shape per MapObjectDisplayMode (legacy
 * ObjectFigure* classes).
 *
 * Cytoscape holds an invisible box (hit area, link attachment) and the SVG overlay paints the
 * box and its contents together, so overlapping nodes occlude each other whole.
 * `glyph`/`textLines`/`plate` are in graph units relative to the node centre. `glyph.size` is
 * the box of a built-in icon or single-colour image, `glyph.pictureSize` that of a full-colour
 * image (see `MapNodeFigure.vue`).
 */

// MapObjectDisplayMode — index-aligned with MAP_OBJECT_DISPLAY_MODE_LABELS.
export const MAP_OBJECT_DISPLAY_MODES = {
  ICON: 0,
  SMALL_LABEL: 1,
  LARGE_LABEL: 2,
  STATUS: 3,
  FLOOR_PLAN: 4,
}

export const NODE_RADIUS = 26
// 36 is the largest square inside the circle, so an opaque picture is never clipped.
const ICON_PICTURE_SIZE = 36
export const LABEL_PAD_H = 5
export const LABEL_PAD_V = 2
export const LABEL_FONT_SIZE = 11
const LABEL_MARGIN = 4
const LABEL_HEIGHT = LABEL_FONT_SIZE + LABEL_PAD_V * 2

// Legacy ObjectFigureSmallLabel.
const SMALL_PAD_H = 7
const SMALL_HEIGHT = 22
const SMALL_ICON_SIZE = 13
const SMALL_ICON_GAP = 5
const SMALL_FONT_SIZE = 11
const SMALL_PICTURE_SIZE = 15

// Legacy ObjectFigureLargeLabel.
const LARGE_PAD_H = 9
const LARGE_ICON_COLUMN = 32
const LARGE_ICON_SIZE = 21
const LARGE_NAME_FONT_SIZE = 12.5
const LARGE_INFO_FONT_SIZE = 10.5
const LARGE_HEIGHT_SINGLE = 34
const LARGE_HEIGHT_DOUBLE = 46
const LARGE_PICTURE_SIZE = 26

// Legacy ObjectStatusIcon.
const STATUS_DIAMETER = 18

// Legacy ObjectFloorPlan minimums are 40x20.
const FLOOR_PLAN_DEFAULT_SIZE = 100
const FLOOR_PLAN_MIN_WIDTH = 40
const FLOOR_PLAN_MIN_HEIGHT = 20
const FLOOR_PLAN_FONT_SIZE = 12

/**
 * @param {object} element - internal object element (from adaptApiNetworkMap)
 * @param {string} displayName - already truncated
 * @param {object} options - from resolveMapRenderOptions()
 * @param {(text: string, fontSize: number) => number} measureText
 * @returns {object}
 */
export function computeNodeVisual(element, displayName, options, measureText) {
  switch (options.displayMode) {
    case MAP_OBJECT_DISPLAY_MODES.SMALL_LABEL:
      return smallLabelVisual(displayName, options, measureText)
    case MAP_OBJECT_DISPLAY_MODES.LARGE_LABEL:
      return largeLabelVisual(element, displayName, options, measureText)
    case MAP_OBJECT_DISPLAY_MODES.STATUS:
      return statusVisual()
    case MAP_OBJECT_DISPLAY_MODES.FLOOR_PLAN:
      return floorPlanVisual(element, displayName)
    default:
      return iconVisual(displayName, options, measureText)
  }
}

/** The only mode where the status flags apply; the legacy client greys them out for the rest. */
function iconVisual(displayName, options, measureText) {
  const labelWidth = measureText(displayName, LABEL_FONT_SIZE) + LABEL_PAD_H * 2
  return {
    shape: 'ellipse',
    width: NODE_RADIUS * 2,
    height: NODE_RADIUS * 2,
    halfExtent: NODE_RADIUS,
    statusFill: options.showStatusBackground,
    statusBorder: options.showStatusFrame,
    glyph: {
      x: 0,
      y: 0,
      size: NODE_RADIUS * 0.8,
      pictureSize: ICON_PICTURE_SIZE,
      useStatusColor: options.showStatusIcon,
    },
    plate: {
      x: -labelWidth / 2,
      y: NODE_RADIUS + LABEL_MARGIN,
      width: labelWidth,
      height: LABEL_HEIGHT,
      rx: 4,
    },
    textLines: [
      {
        text: displayName,
        x: 0,
        y: NODE_RADIUS + LABEL_MARGIN + LABEL_PAD_V,
        size: LABEL_FONT_SIZE,
        anchor: 'middle',
        baseline: 'hanging',
        onPlate: true,
      },
    ],
  }
}

function smallLabelVisual(displayName, options, measureText) {
  const textWidth = measureText(displayName, SMALL_FONT_SIZE)
  const width = SMALL_PAD_H * 2 + SMALL_ICON_SIZE + SMALL_ICON_GAP + textWidth
  const left = -width / 2
  return {
    shape: 'round-rectangle',
    width,
    height: SMALL_HEIGHT,
    halfExtent: Math.max(width, SMALL_HEIGHT) / 2,
    statusFill: true,
    statusBorder: true,
    glyph: {
      x: left + SMALL_PAD_H + SMALL_ICON_SIZE / 2,
      y: 0,
      size: SMALL_ICON_SIZE,
      pictureSize: SMALL_PICTURE_SIZE,
      useStatusColor: false,
    },
    plate: null,
    textLines: [
      {
        text: displayName,
        x: left + SMALL_PAD_H + SMALL_ICON_SIZE + SMALL_ICON_GAP,
        y: 0,
        size: SMALL_FONT_SIZE,
        anchor: 'start',
        baseline: 'central',
      },
    ],
  }
}

// The legacy figure adds a DCI last-values block; the WebAPI has no "show in object overview"
// DCI filter yet, so it is omitted.
function largeLabelVisual(element, displayName, options, measureText) {
  const info = formatAddressLine(element)
  const nameWidth = measureText(displayName, LARGE_NAME_FONT_SIZE)
  const infoWidth = info ? measureText(info, LARGE_INFO_FONT_SIZE) : 0
  const width = LARGE_PAD_H * 2 + LARGE_ICON_COLUMN + Math.max(nameWidth, infoWidth)
  const height = info ? LARGE_HEIGHT_DOUBLE : LARGE_HEIGHT_SINGLE
  const left = -width / 2
  const textX = left + LARGE_PAD_H + LARGE_ICON_COLUMN
  const textLines = [
    {
      text: displayName,
      x: textX,
      y: info ? -7 : 0,
      size: LARGE_NAME_FONT_SIZE,
      weight: 600,
      anchor: 'start',
      baseline: 'central',
    },
  ]
  if (info) {
    textLines.push({
      text: info,
      x: textX,
      y: 9,
      size: LARGE_INFO_FONT_SIZE,
      anchor: 'start',
      baseline: 'central',
      muted: true,
    })
  }
  return {
    shape: 'round-rectangle',
    width,
    height,
    halfExtent: Math.max(width, height) / 2,
    statusFill: true,
    statusBorder: true,
    glyph: {
      x: left + LARGE_PAD_H + LARGE_ICON_COLUMN / 2,
      y: 0,
      size: LARGE_ICON_SIZE,
      pictureSize: LARGE_PICTURE_SIZE,
      useStatusColor: false,
    },
    plate: null,
    textLines,
  }
}

/** "10.0.0.1 (00:11:22:33:44:55)", either half optional. */
function formatAddressLine(element) {
  const ip = element?.objectIpAddress
  const mac = element?.objectMacAddress
  if (ip && mac) return `${ip} (${mac})`
  return ip || mac || ''
}

function statusVisual() {
  return {
    shape: 'ellipse',
    width: STATUS_DIAMETER,
    height: STATUS_DIAMETER,
    halfExtent: STATUS_DIAMETER / 2,
    statusFill: true,
    statusBorder: true,
    glyph: null,
    plate: null,
    textLines: [],
    displayModeIgnoresStatusFlags: true,
  }
}

function floorPlanVisual(element, displayName) {
  const width = Math.max(element?.width ?? FLOOR_PLAN_DEFAULT_SIZE, FLOOR_PLAN_MIN_WIDTH)
  const height = Math.max(element?.height ?? FLOOR_PLAN_DEFAULT_SIZE, FLOOR_PLAN_MIN_HEIGHT)
  return {
    shape: 'round-rectangle',
    width,
    height,
    halfExtent: Math.max(width, height) / 2,
    statusFill: true,
    statusBorder: true,
    glyph: null,
    plate: null,
    resizable: true,
    textLines: [
      {
        text: displayName,
        x: 0,
        y: 0,
        size: FLOOR_PLAN_FONT_SIZE,
        anchor: 'middle',
        baseline: 'central',
      },
    ],
  }
}
