// Dashboard widgets are sized by the grid, not their content, so the legend the config asks for
// may not fit: the extended legend falls back to plain, a side legend to a horizontal edge.

/** Below this the extended (stats table) legend leaves no usable plot area. */
export const EXTENDED_LEGEND_MIN_WIDTH = 280
export const EXTENDED_LEGEND_MIN_HEIGHT = 160

/** A legend column on the side costs width twice: its own, and the plot's. */
export const SIDE_LEGEND_MIN_WIDTH = 320
export const SIDE_EXTENDED_LEGEND_MIN_WIDTH = 520

const POSITIONS = ['top', 'bottom', 'left', 'right']

function horizontalEdge(position) {
  return position === 'top' ? 'top' : 'bottom'
}

/**
 * @param {object} opts
 * @param {number} opts.width - px, 0 while unmeasured
 * @param {number} opts.height - px, 0 while unmeasured
 * @param {boolean} opts.showLegend
 * @param {boolean} opts.extendedLegend
 * @param {number} opts.seriesCount
 * @param {string} [opts.position]
 * @param {boolean} [opts.hideSingleSeriesLegend] - false where a one-series legend was asked
 *   for explicitly ("Always show legend")
 * @returns {{ mode: 'none'|'plain'|'extended', place: 'top'|'bottom'|'left'|'right' }}
 */
export function resolveLegendLayout({
  width,
  height,
  showLegend,
  extendedLegend,
  seriesCount,
  position = 'bottom',
  hideSingleSeriesLegend = true,
}) {
  const wanted = POSITIONS.includes(position) ? position : 'bottom'
  const onSide = wanted === 'left' || wanted === 'right'

  if (!showLegend || seriesCount < 1) return { mode: 'none', place: wanted }

  if (extendedLegend) {
    // Unmeasured counts as "does not fit", so the table never flashes in and out.
    const fits = width >= EXTENDED_LEGEND_MIN_WIDTH && height >= EXTENDED_LEGEND_MIN_HEIGHT
    if (fits) {
      const roomForSide = onSide && width >= SIDE_EXTENDED_LEGEND_MIN_WIDTH
      return { mode: 'extended', place: roomForSide ? wanted : horizontalEdge(wanted) }
    }
  }

  // A one-series plain legend only repeats the widget title.
  if (hideSingleSeriesLegend && seriesCount < 2) return { mode: 'none', place: wanted }

  const roomForSide = onSide && width >= SIDE_LEGEND_MIN_WIDTH
  return { mode: 'plain', place: roomForSide ? wanted : horizontalEdge(wanted) }
}

export function isSidePlacement(place) {
  return place === 'left' || place === 'right'
}
