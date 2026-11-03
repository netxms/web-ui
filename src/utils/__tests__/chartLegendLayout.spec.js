import { describe, it, expect } from 'vitest'
import {
  resolveLegendLayout,
  isSidePlacement,
  EXTENDED_LEGEND_MIN_WIDTH,
  EXTENDED_LEGEND_MIN_HEIGHT,
  SIDE_LEGEND_MIN_WIDTH,
  SIDE_EXTENDED_LEGEND_MIN_WIDTH,
} from '../chartLegendLayout'

const big = { width: 600, height: 400 }

function layout(overrides = {}) {
  return resolveLegendLayout({
    ...big,
    showLegend: true,
    extendedLegend: false,
    seriesCount: 2,
    ...overrides,
  })
}

describe('resolveLegendLayout', () => {
  it('hides the legend when the config flag is off', () => {
    expect(layout({ showLegend: false }).mode).toBe('none')
    expect(layout({ showLegend: false, extendedLegend: true }).mode).toBe('none')
  })

  it('hides the plain legend for a single series but keeps the stats table', () => {
    expect(layout({ seriesCount: 1 }).mode).toBe('none')
    expect(layout({ seriesCount: 1, extendedLegend: true }).mode).toBe('extended')
  })

  it('hides everything with no series at all', () => {
    expect(layout({ seriesCount: 0, extendedLegend: true }).mode).toBe('none')
  })

  it('uses the plain legend when the widget is too small for the table', () => {
    expect(layout({ extendedLegend: true, width: EXTENDED_LEGEND_MIN_WIDTH - 1 }).mode).toBe(
      'plain',
    )
    expect(layout({ extendedLegend: true, height: EXTENDED_LEGEND_MIN_HEIGHT - 1 }).mode).toBe(
      'plain',
    )
    expect(layout({ extendedLegend: true, width: 0, height: 0 }).mode).toBe('plain')
  })

  it('uses the table once the widget is big enough', () => {
    expect(
      layout({
        extendedLegend: true,
        width: EXTENDED_LEGEND_MIN_WIDTH,
        height: EXTENDED_LEGEND_MIN_HEIGHT,
      }).mode,
    ).toBe('extended')
  })

  it('keeps every configured position on a chart with room for it', () => {
    expect(layout({ position: 'top' }).place).toBe('top')
    expect(layout({ position: 'bottom' }).place).toBe('bottom')
    expect(layout({ position: 'left' }).place).toBe('left')
    expect(layout({ position: 'right' }).place).toBe('right')
    expect(layout({}).place).toBe('bottom')
  })

  it('falls back to bottom for an unknown position', () => {
    expect(layout({ position: 'middle' }).place).toBe('bottom')
  })

  it('drops a side legend onto the bottom edge when the chart is too narrow', () => {
    expect(layout({ position: 'left', width: SIDE_LEGEND_MIN_WIDTH - 1 }).place).toBe('bottom')
    expect(layout({ position: 'right', width: SIDE_LEGEND_MIN_WIDTH - 1 }).place).toBe('bottom')
    expect(layout({ position: 'left', width: SIDE_LEGEND_MIN_WIDTH }).place).toBe('left')
  })

  it('asks for more width before putting the stats table on the side', () => {
    const extended = { extendedLegend: true, position: 'right', height: 400 }

    // Wide enough for a plain side legend, not for a five-column table beside a plot.
    expect(
      resolveLegendLayout({
        ...extended,
        showLegend: true,
        seriesCount: 2,
        width: SIDE_LEGEND_MIN_WIDTH,
      }),
    ).toEqual({
      mode: 'extended',
      place: 'bottom',
    })
    expect(
      resolveLegendLayout({
        ...extended,
        showLegend: true,
        seriesCount: 2,
        width: SIDE_EXTENDED_LEGEND_MIN_WIDTH,
      }),
    ).toEqual({ mode: 'extended', place: 'right' })
  })

  it('keeps a top position when a side one degrades but a top one need not', () => {
    expect(layout({ position: 'top', width: 100 }).place).toBe('top')
  })
})

describe('isSidePlacement', () => {
  it('is true only for the two vertical edges', () => {
    expect(isSidePlacement('left')).toBe(true)
    expect(isSidePlacement('right')).toBe(true)
    expect(isSidePlacement('top')).toBe(false)
    expect(isSidePlacement('bottom')).toBe(false)
    expect(isSidePlacement(null)).toBe(false)
  })
})
