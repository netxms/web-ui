// ECharts cannot read CSS custom properties, hence concrete hex values per theme. The palettes
// are CVD-validated in slot order: assign by index, never re-sort. Aqua comes before blue to
// match the legacy palette (green, then blue).
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

const CHART_PALETTE_LIGHT = [
  '#1baf7a', // aqua
  '#2a78d6', // blue
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
]

/** The same hues stepped for dark surfaces. */
const CHART_PALETTE_DARK = [
  '#199e70',
  '#3987e5',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
]

const INK_LIGHT = {
  text: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e1e0d9',
  tooltipText: '#0b0b0b',
  // Chart markers: outside the palette so an annotation is never mistaken for a series.
  marker: '#334155',
  markerText: '#ffffff',
}

const INK_DARK = {
  text: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  tooltipBg: '#27272a',
  tooltipBorder: '#3f3f46',
  tooltipText: '#f4f4f5',
  marker: '#e2e8f0',
  markerText: '#18181b',
}

/**
 * Reactive chart theme fragments, merged into widget chart options.
 * @returns {{ isDark, palette, ink, seriesColor, axisStyle, legendStyle, tooltipStyle }}
 */
export function useChartTheme() {
  const { isDark } = useTheme()

  const palette = computed(() => (isDark.value ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT))
  const ink = computed(() => (isDark.value ? INK_DARK : INK_LIGHT))

  function seriesColor(i) {
    return palette.value[i % palette.value.length]
  }

  const axisStyle = computed(() => ({
    axisLabel: { color: ink.value.muted, fontSize: 10, hideOverlap: true },
    axisLine: { lineStyle: { color: ink.value.axis } },
    axisTick: { lineStyle: { color: ink.value.axis } },
    splitLine: { lineStyle: { color: ink.value.grid } },
  }))

  // Icon pinned: ECharts picks one per series type, so line and bar widgets disagreed.
  const legendStyle = computed(() => ({
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 14,
    textStyle: { fontSize: 11, color: ink.value.text },
    inactiveColor: ink.value.muted,
  }))

  const tooltipStyle = computed(() => ({
    backgroundColor: ink.value.tooltipBg,
    borderColor: ink.value.tooltipBorder,
    textStyle: { color: ink.value.tooltipText, fontSize: 12 },
  }))

  return { isDark, palette, ink, seriesColor, axisStyle, legendStyle, tooltipStyle }
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatWithMultiplier(value) {
  const abs = Math.abs(value)
  if (abs >= 1e12) return trim(value / 1e12) + ' T'
  if (abs >= 1e9) return trim(value / 1e9) + ' G'
  if (abs >= 1e6) return trim(value / 1e6) + ' M'
  if (abs >= 1e3) return trim(value / 1e3) + ' K'
  return trim(value)
}

function trim(n) {
  return String(Math.round(n * 100) / 100)
}

/**
 * ECharts' default splitNumber of 6 crowds a narrow widget; ~110px fits one "16:05" label.
 *
 * @param {number} width - plot width, px (0 when unmeasured)
 * @returns {number|undefined} undefined leaves the ECharts default
 */
export function timeAxisSplitNumber(width) {
  const w = Number(width) || 0
  if (w <= 0) return undefined
  return Math.min(8, Math.max(2, Math.round(w / 110)))
}
