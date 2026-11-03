/**
 * @param {Array} elements
 * @param {number} x - horizontal units
 * @param {number} y - vertical units
 * @param {number} width - horizontal units
 * @param {number} height - vertical units
 * @param {string} orientation - 'full' | 'front' | 'back'
 * @param {string|null} excludeId - the element being edited
 * @returns {string|null} error message, or null if clear
 */
export function checkChassisOverlap(elements, x, y, width, height, orientation, excludeId = null) {
  for (const el of elements) {
    if (el.id === excludeId) continue
    const sameSide =
      orientation === 'full' || el.orientation === 'full' || orientation === el.orientation
    if (!sameSide) continue
    const noOverlap =
      x + width <= el.x || el.x + el.width <= x || y + height <= el.y || el.y + el.height <= y
    if (!noOverlap) {
      return `Overlaps with "${el.label || el.objectName || '?'}" at (${el.x}, ${el.y})`
    }
  }
  return null
}
