import { getStatusHexColor, getStatusSoftBgHexColor } from '@/utils/objectUtils'
import { computeNodeVisual, MAP_OBJECT_DISPLAY_MODES } from '@/utils/networkMapNodeVisual'
import { ICON_SURFACE } from '@/utils/objectIcons'

/** Cytoscape ends edges on the border's outer edge. */
export const NODE_BORDER_WIDTH = 2.5

/** Stand-ins wherever a status flag is switched off, and the label plate. */
const NEUTRALS = {
  light: {
    glyph: '#64748b',
    fill: '#f1f5f9',
    border: '#cbd5e1',
    plateFill: '#f8fafc',
    plateStroke: '#cbd5e1',
    text: '#475569',
  },
  dark: {
    glyph: '#94a3b8',
    fill: '#1e293b',
    border: '#475569',
    plateFill: '#1e293b',
    plateStroke: '#475569',
    text: '#cbd5e1',
  },
}

/** @param {boolean} dark */
export function mapNodeNeutrals(dark) {
  return dark ? NEUTRALS.dark : NEUTRALS.light
}

/**
 * @param {{ element: object, displayName: string, status: number, options: object,
 *   measureText: Function, dark: boolean }} input
 * @returns {{ visual: object, statusColor: string, fill: string, stroke: string,
 *   cornerRadius: number, glyphColor: string }}
 */
export function paintMapNode({ element, displayName, status, options, measureText, dark }) {
  const neutrals = mapNodeNeutrals(dark)
  const visual = computeNodeVisual(element, displayName, options, measureText)
  return {
    visual,
    statusColor: getStatusHexColor(status),
    // computeNodeVisual() resolves MF_SHOW_STATUS_BKGND / MF_SHOW_STATUS_FRAME per display mode.
    fill: visual.statusFill ? getStatusSoftBgHexColor(status) : neutrals.fill,
    stroke: visual.statusBorder ? getStatusHexColor(status) : neutrals.border,
    // Cytoscape's automatic round-rectangle radius, so the box matches its hit area.
    cornerRadius: Math.min(visual.width / 4, visual.height / 4, 8),
    glyphColor: visual.glyph?.useStatusColor ? getStatusHexColor(status) : neutrals.glyph,
  }
}

/**
 * The small-label figure shows the category icon, the icon and large-label figures the map image.
 *
 * @param {number} displayMode - a MAP_OBJECT_DISPLAY_MODES value
 * @returns {string} an ICON_SURFACE value
 */
export function mapIconSurface(displayMode) {
  return displayMode === MAP_OBJECT_DISPLAY_MODES.SMALL_LABEL
    ? ICON_SURFACE.SMALL
    : ICON_SURFACE.MAP
}

/**
 * Unique per SVG document.
 *
 * @param {string} prefix - per canvas instance
 * @param {string} guid
 */
export function mapIconMaskId(prefix, guid) {
  return `${prefix}-icon-${guid}`
}
