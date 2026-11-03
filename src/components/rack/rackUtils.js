/** A 19-inch panel over a 1.75-inch U: panel width in row heights. */
export const PANEL_WIDTH_PER_U = 19 / 1.75

/** Mirror `.rack-label-col` and `.rack-divider-col` in RackCanvas; used to pick a fitting zoom. */
export const RACK_LABEL_COL_WIDTH = 36
export const RACK_DIVIDER_WIDTH = 16

/**
 * @param {Array} elements
 * @param {number} slot - 1 = bottom
 * @param {number} heightU
 * @param {string} orientation - 'full' | 'front' | 'back'
 * @param {string|null} excludeId - the element being edited or dragged
 * @returns {string|null} error message, or null if clear
 */
export function checkOverlap(elements, slot, heightU, orientation, excludeId = null) {
  const newBottom = slot
  const newTop = slot + heightU - 1
  for (const el of elements) {
    if (el.id === excludeId) continue
    const elBottom = el.slot
    const elTop = el.slot + el.heightU - 1
    if (newBottom <= elTop && newTop >= elBottom) {
      const sameSide =
        orientation === 'full' || el.orientation === 'full' || orientation === el.orientation
      if (sameSide) {
        return `Overlaps with "${el.label || el.objectName || el.passiveType}" at U${el.slot}`
      }
    }
  }
  return null
}

/**
 * Uniform scale that fits a rack drawing into the available box, clamped to [minScale, 1];
 * below `minScale` the caller falls back to scrolling.
 *
 * @param {{ width: number, height: number }} available - container content box, px
 * @param {{ width: number, height: number }} natural - untransformed drawing size, px
 * @param {number} [minScale]
 * @returns {number} scale factor in [minScale, 1]
 */
export function computeFitScale(available, natural, minScale = 0.25) {
  const aw = Number(available?.width) || 0
  const ah = Number(available?.height) || 0
  const nw = Number(natural?.width) || 0
  const nh = Number(natural?.height) || 0
  // Nothing measured yet
  if (aw <= 0 || ah <= 0 || nw <= 0 || nh <= 0) return 1
  const scale = Math.min(ah / nh, aw / nw)
  return Math.min(1, Math.max(minScale, scale))
}
