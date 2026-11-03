import { describe, it, expect } from 'vitest'
import { computed } from 'vue'
import { buildLineChartOption, buildSeriesPoints } from '@/utils/dciChartOptions'
import { createChartModel } from '@/utils/dciChartModel'

/** Minimal stand-in for useChartTheme()'s snapshot. */
const theme = {
  ink: computed(() => ({ muted: '#888888', marker: '#334155', markerText: '#ffffff' })),
  seriesColor: (i) => ['#111111', '#222222', '#333333'][i % 3],
  axisStyle: computed(() => ({
    axisLabel: { color: '#666666', fontSize: 10 },
    axisLine: { lineStyle: { color: '#cccccc' } },
    axisTick: { lineStyle: { color: '#cccccc' } },
    splitLine: { lineStyle: { color: '#eeeeee' } },
  })),
  legendStyle: computed(() => ({ textStyle: { fontSize: 11 } })),
  tooltipStyle: computed(() => ({ backgroundColor: '#ffffff' })),
}

function makeSeries(overrides = {}) {
  return {
    name: 'Inbound traffic',
    unitName: 'b/s',
    values: [
      { timestamp: '2026-08-31T12:00:00Z', value: 10 },
      { timestamp: '2026-08-31T12:01:00Z', value: 20 },
      { timestamp: '2026-08-31T12:02:00Z', value: 30 },
    ],
    ...overrides,
  }
}

/** ECharts series that represent an actual DCI, excluding band helpers. */
function realSeries(option) {
  return option.series.filter((s) => !s.silent)
}

describe('buildLineChartOption', () => {
  it('emits one series per DCI with normalised points', () => {
    const option = buildLineChartOption(
      createChartModel(),
      [makeSeries(), makeSeries({ name: 'Outbound' })],
      theme,
    )

    expect(realSeries(option)).toHaveLength(2)
    expect(realSeries(option)[0].data).toEqual([
      [Date.parse('2026-08-31T12:00:00Z'), 10],
      [Date.parse('2026-08-31T12:01:00Z'), 20],
      [Date.parse('2026-08-31T12:02:00Z'), 30],
    ])
  })

  it('reads the aggregate average when the server bucketed the data', () => {
    const series = makeSeries({
      values: [{ timestamp: '2026-08-31T12:00:00Z', avg: 15, min: 5, max: 25 }],
    })
    const option = buildLineChartOption(createChartModel(), [series], theme)

    expect(realSeries(option)[0].data[0][1]).toBe(15)
  })

  it('assigns theme colours by DCI index', () => {
    const option = buildLineChartOption(
      createChartModel(),
      [makeSeries(), makeSeries({ name: 'B' })],
      theme,
    )

    expect(realSeries(option)[0].color).toBe('#111111')
    expect(realSeries(option)[1].color).toBe('#222222')
  })

  it('prefers an explicit series colour over the theme slot', () => {
    const option = buildLineChartOption(
      createChartModel(),
      [makeSeries({ color: '#ff0000' })],
      theme,
    )
    expect(realSeries(option)[0].color).toBe('#ff0000')
  })

  it('names the y axis from the unit when no label is set', () => {
    const option = buildLineChartOption(createChartModel(), [makeSeries()], theme)
    expect(option.yAxis.name).toBe('b/s')
  })

  it('prefers an explicit y axis label over the unit', () => {
    const model = createChartModel({ yAxis: { label: 'Throughput' } })
    expect(buildLineChartOption(model, [makeSeries()], theme).yAxis.name).toBe('Throughput')
  })

  describe('render options', () => {
    it('uses a linear axis by default and a log axis when asked', () => {
      expect(buildLineChartOption(createChartModel(), [makeSeries()], theme).yAxis.type).toBe(
        'value',
      )
      const log = createChartModel({ render: { log: true } })
      expect(buildLineChartOption(log, [makeSeries()], theme).yAxis.type).toBe('log')
    })

    it('adds an area fill only when area or stacked is on', () => {
      expect(
        realSeries(buildLineChartOption(createChartModel(), [makeSeries()], theme))[0].areaStyle,
      ).toBeUndefined()

      const area = createChartModel({ render: { area: true } })
      expect(
        realSeries(buildLineChartOption(area, [makeSeries()], theme))[0].areaStyle,
      ).toBeDefined()

      const stacked = createChartModel({ render: { stacked: true } })
      const s = realSeries(buildLineChartOption(stacked, [makeSeries()], theme))[0]
      expect(s.areaStyle).toBeDefined()
      expect(s.stack).toBe('total')
    })

    it('lowers the fill opacity when translucent', () => {
      const solid = createChartModel({ render: { area: true } })
      const sheer = createChartModel({ render: { area: true, translucent: true } })

      const solidOpacity = realSeries(buildLineChartOption(solid, [makeSeries()], theme))[0]
        .areaStyle.opacity
      const sheerOpacity = realSeries(buildLineChartOption(sheer, [makeSeries()], theme))[0]
        .areaStyle.opacity

      expect(sheerOpacity).toBeLessThan(solidOpacity)
    })

    it('honours manual y bounds only when the axis is not automatic', () => {
      const auto = createChartModel({ yAxis: { auto: true, min: 0, max: 100 } })
      expect(buildLineChartOption(auto, [makeSeries()], theme).yAxis.min).toBeUndefined()

      const manual = createChartModel({ yAxis: { auto: false, min: 0, max: 100 } })
      const axis = buildLineChartOption(manual, [makeSeries()], theme).yAxis
      expect(axis.min).toBe(0)
      expect(axis.max).toBe(100)
    })

    it('hides the grid when showGrid is off', () => {
      const model = createChartModel({ render: { showGrid: false } })
      expect(buildLineChartOption(model, [makeSeries()], theme).yAxis.splitLine).toEqual({
        show: false,
      })
    })

    it('uses the native legend only for the brief form', () => {
      const extended = createChartModel({ render: { extendedLegend: true } })
      expect(buildLineChartOption(extended, [makeSeries()], theme).legend.show).toBe(false)

      const brief = createChartModel({ render: { extendedLegend: false } })
      expect(buildLineChartOption(brief, [makeSeries()], theme).legend.show).not.toBe(false)

      const none = createChartModel({ render: { legend: 'none', extendedLegend: false } })
      expect(buildLineChartOption(none, [makeSeries()], theme).legend.show).toBe(false)
    })

    it('puts the native legend on the edge render.legend names', () => {
      const at = (legend) =>
        buildLineChartOption(
          createChartModel({ render: { legend, extendedLegend: false } }),
          [makeSeries()],
          theme,
        )

      expect(at('top').legend).toMatchObject({ orient: 'horizontal', top: 0 })
      expect(at('bottom').legend).toMatchObject({ orient: 'horizontal' })
      expect(at('bottom').legend.bottom).toBeGreaterThan(0)
      expect(at('left').legend).toMatchObject({ orient: 'vertical', left: 4 })
      expect(at('right').legend).toMatchObject({ orient: 'vertical', right: 4 })
    })

    it('reserves grid space on whichever edge the legend took', () => {
      const grid = (legend) =>
        buildLineChartOption(
          createChartModel({ render: { legend, extendedLegend: false } }),
          [makeSeries()],
          theme,
        ).grid

      expect(grid('left').left).toBeGreaterThan(grid('right').left)
      expect(grid('right').right).toBeGreaterThan(grid('left').right)
      expect(grid('top').top).toBeGreaterThan(grid('bottom').top)
      expect(grid('bottom').bottom).toBeGreaterThan(grid('top').bottom)
    })

    it('lists only real series in the native legend, never band helpers', () => {
      const model = createChartModel({ render: { extendedLegend: false }, band: true })
      const series = makeSeries({
        aggregated: true,
        values: [{ timestamp: '2026-08-31T12:00:00Z', avg: 15, min: 5, max: 25 }],
      })

      expect(buildLineChartOption(model, [series], theme).legend.data).toEqual(['Inbound traffic'])
    })
  })

  describe('min/max band', () => {
    const banded = makeSeries({
      aggregated: true,
      values: [
        { timestamp: '2026-08-31T12:00:00Z', avg: 15, min: 5, max: 25 },
        { timestamp: '2026-08-31T12:01:00Z', avg: 20, min: 10, max: 40 },
      ],
    })

    it('adds a stacked lower-bound and delta pair under the line', () => {
      const model = createChartModel({ band: true })
      const option = buildLineChartOption(model, [banded], theme)

      expect(option.series).toHaveLength(3)
      const [lower, delta, line] = option.series
      expect(lower.stack).toBe('band-0')
      expect(delta.stack).toBe('band-0')
      expect(line.stack).toBeUndefined()

      // The delta carries max - min, so lower + delta lands on max.
      expect(lower.data.map((p) => p[1])).toEqual([5, 10])
      expect(delta.data.map((p) => p[1])).toEqual([20, 30])
      expect(delta.areaStyle).toBeDefined()
    })

    it('gives each series its own stack so bands never add together', () => {
      const model = createChartModel({ band: true })
      const option = buildLineChartOption(model, [banded, { ...banded, name: 'B' }], theme)

      const stacks = option.series.filter((s) => s.silent).map((s) => s.stack)
      expect(new Set(stacks)).toEqual(new Set(['band-0', 'band-1']))
    })

    it('is skipped when the series is not aggregated', () => {
      const model = createChartModel({ band: true })
      expect(buildLineChartOption(model, [makeSeries()], theme).series).toHaveLength(1)
    })

    it('is skipped when aggregate rows carry no bounds', () => {
      const model = createChartModel({ band: true })
      const noBounds = makeSeries({
        aggregated: true,
        values: [{ timestamp: '2026-08-31T12:00:00Z', avg: 15 }],
      })
      expect(buildLineChartOption(model, [noBounds], theme).series).toHaveLength(1)
    })

    it('is not drawn unless the band option is on', () => {
      expect(buildLineChartOption(createChartModel(), [banded], theme).series).toHaveLength(1)
    })
  })

  // ECharts merges each new option into the previous one, so marker chrome must always be present
  // and empty rather than absent, or removed markers stay on screen.
  describe('clearing marker chrome', () => {
    it('emits empty marker collections rather than omitting them', () => {
      const series = realSeries(buildLineChartOption(createChartModel(), [makeSeries()], theme))[0]

      expect(series.markLine).toBeDefined()
      expect(series.markLine.data).toEqual([])
      expect(series.markArea).toBeDefined()
      expect(series.markArea.data).toEqual([])
    })

    it('empties both collections when the last marker is removed', () => {
      const withMarkers = createChartModel({ markers: [0, 60_000] })
      const drawn = realSeries(buildLineChartOption(withMarkers, [makeSeries()], theme))[0]
      expect(drawn.markLine.data.length).toBeGreaterThan(0)
      expect(drawn.markArea.data.length).toBeGreaterThan(0)

      const cleared = realSeries(
        buildLineChartOption({ ...withMarkers, markers: [] }, [makeSeries()], theme),
      )[0]
      expect(cleared.markLine.data).toEqual([])
      expect(cleared.markArea.data).toEqual([])
    })

    it('keeps the percentile line after markers are cleared', () => {
      const model = createChartModel({ percentile: 95, markers: [] })
      const series = realSeries(buildLineChartOption(model, [makeSeries()], theme))[0]

      expect(series.markLine.data).toHaveLength(1)
      expect(series.markLine.data[0].yAxis).toBeDefined()
      expect(series.markArea.data).toEqual([])
    })

    it('gives every series its own empty markArea, not just the first', () => {
      const option = buildLineChartOption(
        createChartModel({ markers: [0, 60_000] }),
        [makeSeries(), makeSeries({ name: 'B' })],
        theme,
      )
      const [first, second] = realSeries(option)

      expect(first.markArea.data.length).toBeGreaterThan(0)
      expect(second.markArea.data).toEqual([])
    })
  })

  describe('percentile', () => {
    it('adds no percentile line by default', () => {
      const option = buildLineChartOption(createChartModel(), [makeSeries()], theme)
      expect(realSeries(option)[0].markLine.data).toEqual([])
    })

    it('adds a horizontal line at the 95th percentile of the series', () => {
      const model = createChartModel({ percentile: 95 })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      const line = realSeries(option)[0].markLine
      expect(line.data).toHaveLength(1)
      expect(line.data[0].yAxis).toBeCloseTo(29)
    })

    it('computes the percentile per series, not across all of them', () => {
      const model = createChartModel({ percentile: 95 })
      const other = makeSeries({
        name: 'B',
        values: [
          { timestamp: '2026-08-31T12:00:00Z', value: 100 },
          { timestamp: '2026-08-31T12:01:00Z', value: 200 },
        ],
      })
      const option = buildLineChartOption(model, [makeSeries(), other], theme)

      const [a, b] = realSeries(option)
      expect(a.markLine.data[0].yAxis).not.toBe(b.markLine.data[0].yAxis)
    })

    it('is skipped for an empty series', () => {
      const model = createChartModel({ percentile: 95 })
      const empty = makeSeries({ values: [] })
      expect(realSeries(buildLineChartOption(model, [empty], theme))[0].markLine.data).toEqual([])
    })
  })

  describe('markers', () => {
    it('adds a vertical line per marker', () => {
      const model = createChartModel({ markers: [1000, 2000] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      expect(realSeries(option)[0].markLine.data.map((d) => d.xAxis)).toEqual([1000, 2000])
    })

    it('sorts markers, so a marker dragged past another still pairs correctly', () => {
      const model = createChartModel({ markers: [3000, 1000, 2000] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      expect(realSeries(option)[0].markLine.data.map((d) => d.xAxis)).toEqual([1000, 2000, 3000])
    })

    it('labels each marker with its own timestamp', () => {
      const model = createChartModel({ markers: [Date.parse('2026-08-31T12:41:17Z')] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      const label = realSeries(option)[0].markLine.data[0].label
      expect(label.show).toBe(true)
      expect(label.formatter).toBeTruthy()
      expect(label.position).toBe('end')
    })

    it('adds a delta-t band between each adjacent pair', () => {
      const model = createChartModel({ markers: [0, 60_000, 180_000] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      const areas = realSeries(option)[0].markArea.data
      expect(areas).toHaveLength(2)
      expect(areas[0][0].xAxis).toBe(0)
      expect(areas[0][1].xAxis).toBe(60_000)
      // 1 minute between the first pair, 2 between the second.
      expect(areas[0][0].label.formatter).toContain('1m')
      expect(areas[1][0].label.formatter).toContain('2m')
    })

    it('adds the value delta between the nearest samples for a single series', () => {
      const t0 = Date.parse('2026-08-31T12:00:00Z')
      // Second marker falls closer to the 12:02 sample than to 12:01.
      const model = createChartModel({ markers: [t0, t0 + 110_000] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      expect(realSeries(option)[0].markArea.data[0][0].label.formatter).toBe('Δt 1m  Δ 20 b/s')
    })

    it('shows a negative value delta when the series falls', () => {
      const t0 = Date.parse('2026-08-31T12:00:00Z')
      const model = createChartModel({ markers: [t0 + 120_000, t0 + 240_000] })
      const falling = makeSeries({
        values: [
          { timestamp: '2026-08-31T12:02:00Z', value: 3000 },
          { timestamp: '2026-08-31T12:04:00Z', value: 1500 },
        ],
      })
      const label = realSeries(buildLineChartOption(model, [falling], theme))[0].markArea.data[0][0]
        .label

      expect(label.formatter).toContain('Δ -1.5 K b/s')
    })

    it('omits the value delta when more than one series is drawn', () => {
      const model = createChartModel({ markers: [0, 60_000] })
      const option = buildLineChartOption(
        model,
        [makeSeries(), makeSeries({ name: 'Outbound traffic' })],
        theme,
      )

      const formatter = realSeries(option)[0].markArea.data[0][0].label.formatter
      expect(formatter).toMatch(/^Δt /)
      expect(formatter).not.toContain('Δ ')
    })

    it('draws no delta band for a single marker', () => {
      const model = createChartModel({ markers: [1000] })
      expect(
        realSeries(buildLineChartOption(model, [makeSeries()], theme))[0].markArea.data,
      ).toEqual([])
    })

    it('washes the delta bands faintly rather than filling them', () => {
      const model = createChartModel({ markers: [0, 60_000] })
      const area = realSeries(buildLineChartOption(model, [makeSeries()], theme))[0].markArea

      expect(area.itemStyle.color).toBe('#334155')
      expect(area.itemStyle.opacity).toBeLessThan(0.1)
    })

    it('draws markers in the annotation colour, never a series or grid colour', () => {
      const model = createChartModel({ markers: [1000] })
      const item = realSeries(buildLineChartOption(model, [makeSeries()], theme))[0].markLine
        .data[0]

      expect(item.lineStyle.color).toBe('#334155')
      expect(item.lineStyle.color).not.toBe('#888888')
      expect(item.lineStyle.color).not.toBe(theme.seriesColor(0))
    })

    it('gives marker labels a filled chip so they survive a dense plot', () => {
      const model = createChartModel({ markers: [1000, 2000] })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      const label = option.series[0].markLine.data[0].label
      expect(label.backgroundColor).toBe('#334155')
      expect(label.color).toBe('#ffffff')
      expect(label.borderRadius).toBeGreaterThan(0)

      // The delta readout is the same chip, so the pair reads as one feature.
      const deltaLabel = option.series[0].markArea.data[0][0].label
      expect(deltaLabel.backgroundColor).toBe('#334155')
      expect(deltaLabel.color).toBe('#ffffff')
    })

    it('keeps the percentile line when markers are also present', () => {
      const model = createChartModel({ markers: [1000], percentile: 95 })
      const option = buildLineChartOption(model, [makeSeries()], theme)

      const data = realSeries(option)[0].markLine.data
      expect(data).toHaveLength(2)
      expect(data.some((d) => d.xAxis === 1000)).toBe(true)
      expect(data.some((d) => d.yAxis != null)).toBe(true)
    })

    it('gives the percentile label a filled chip in its series colour', () => {
      const model = createChartModel({ percentile: 95 })
      const label = realSeries(buildLineChartOption(model, [makeSeries()], theme))[0].markLine
        .data[0].label

      expect(label.backgroundColor).toBe('#111111')
      expect(label.color).toBe('#ffffff')
      expect(label.borderRadius).toBeGreaterThan(0)
    })

    it('alternates percentile labels across the plot so series do not collide', () => {
      const model = createChartModel({ percentile: 95 })
      const option = buildLineChartOption(
        model,
        [makeSeries(), makeSeries({ name: 'B' }), makeSeries({ name: 'C' })],
        theme,
      )
      const labels = realSeries(option).map((s) => s.markLine.data[0].label)

      expect(labels[0].position).toBe('insideEndTop')
      expect(labels[1].position).toBe('insideStartTop')
      // Third shares a side with the first, so it steps away instead.
      expect(labels[2].position).toBe('insideEndTop')
      expect(labels[2].distance).toBeGreaterThan(labels[0].distance)
    })

    it('styles markers and the percentile line independently on the shared markLine', () => {
      const model = createChartModel({ markers: [1000], percentile: 95 })
      const data = realSeries(buildLineChartOption(model, [makeSeries()], theme))[0].markLine.data

      const marker = data.find((d) => d.xAxis != null)
      const pct = data.find((d) => d.yAxis != null)
      expect(marker.lineStyle.color).not.toBe(pct.lineStyle.color)
      expect(pct.label.formatter).toBe('95%')
    })

    it('attaches markers to a real series, never to a band helper', () => {
      const model = createChartModel({ band: true, markers: [1000] })
      const banded = makeSeries({
        aggregated: true,
        values: [{ timestamp: '2026-08-31T12:00:00Z', avg: 15, min: 5, max: 25 }],
      })
      const option = buildLineChartOption(model, [banded], theme)

      expect(option.series.filter((s) => s.silent).every((s) => !s.markLine)).toBe(true)
      expect(realSeries(option)[0].markLine.data.map((d) => d.xAxis)).toEqual([1000])
    })
  })

  describe('drag interaction support', () => {
    it('leaves plain drag free for markers rather than panning the chart', () => {
      const inside = buildLineChartOption(createChartModel(), [makeSeries()], theme).dataZoom.find(
        (z) => z.type === 'inside',
      )
      expect(inside.moveOnMouseMove).toBe(false)
      expect(inside.zoomOnMouseWheel).toBe(true)
    })
  })

  describe('tooltip', () => {
    const format = (model, params) =>
      buildLineChartOption(model, [makeSeries()], theme).tooltip.formatter(params)

    it('lists each series with its unit', () => {
      const html = format(createChartModel(), [
        { seriesName: 'Inbound traffic', marker: '<i></i>', value: [0, 20] },
      ])
      expect(html).toContain('Inbound traffic')
      expect(html).toContain('b/s')
    })

    it('omits band helper rows', () => {
      const html = format(createChartModel({ band: true }), [
        { seriesName: 'Inbound traffic', marker: '<i></i>', value: [0, 20] },
        { seriesName: 'Inbound traffic (min)', marker: '<i></i>', value: [0, 5] },
        { seriesName: 'Inbound traffic (band)', marker: '<i></i>', value: [0, 20] },
      ])
      expect(html).not.toContain('(min)')
      expect(html).not.toContain('(band)')
    })

    it('escapes series names, which come from server data', () => {
      const html = format(createChartModel(), [
        { seriesName: '<img src=x onerror=alert(1)>', marker: '<i></i>', value: [0, 1] },
      ])
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img')
    })

    it('returns nothing when every row was filtered out', () => {
      expect(format(createChartModel(), [])).toBe('')
    })
  })

  it('always offers zoom', () => {
    const option = buildLineChartOption(createChartModel(), [makeSeries()], theme)
    expect(option.dataZoom.some((z) => z.type === 'inside')).toBe(true)
    expect(option.dataZoom.some((z) => z.type === 'slider')).toBe(true)
  })

  it('handles an empty DCI list', () => {
    const option = buildLineChartOption(createChartModel(), [], theme)
    expect(option.series).toEqual([])
  })
})

describe('buildSeriesPoints', () => {
  it('normalises each series for the legend and the data table', () => {
    const rows = buildSeriesPoints([makeSeries()], theme)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Inbound traffic', color: '#111111', unit: 'b/s' })
    expect(rows[0].points).toHaveLength(3)
  })

  it('reads aggregate averages as the point value', () => {
    const series = makeSeries({ values: [{ timestamp: '2026-08-31T12:00:00Z', avg: 42 }] })
    expect(buildSeriesPoints([series], theme)[0].points[0][1]).toBe(42)
  })

  it('handles a series with no values', () => {
    expect(buildSeriesPoints([makeSeries({ values: [] })], theme)[0].points).toEqual([])
  })
})

// The server returns history newest-first; builders keep the order they are given, so callers
// sort first.
describe('point ordering contract', () => {
  const descending = {
    name: 'Processed requests',
    unitName: '',
    values: [
      { timestamp: '2026-08-31T12:02:00Z', value: 30 },
      { timestamp: '2026-08-31T12:01:00Z', value: 20 },
      { timestamp: '2026-08-31T12:00:00Z', value: 10 },
    ],
  }

  it('preserves input order rather than silently sorting', () => {
    const points = buildSeriesPoints([descending], theme)[0].points
    expect(points.map((p) => p[1])).toEqual([30, 20, 10])
  })

  it('reads the newest value last once the caller has sorted', () => {
    const ascending = { ...descending, values: [...descending.values].reverse() }
    const points = buildSeriesPoints([ascending], theme)[0].points
    expect(points.at(-1)[1]).toBe(30)
  })
})

describe('zoom slider layout', () => {
  it('leaves the grid enough room below for the slider, so axis labels clear it', () => {
    const option = buildLineChartOption(createChartModel(), [makeSeries()], theme)
    const slider = option.dataZoom.find((z) => z.type === 'slider')

    expect(option.grid.bottom).toBeGreaterThan(slider.height + slider.bottom)
  })
})
