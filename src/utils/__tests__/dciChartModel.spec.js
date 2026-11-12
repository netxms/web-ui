// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  createChartModel,
  resolveTimeRange,
  buildHistoryParams,
  percentile,
  summarizeSeries,
  serializeToQuery,
  parseFromQuery,
  chartTabLabel,
  getTimePreset,
  MAX_CHART_POINTS,
  DEFAULT_TIME_PRESET,
} from '@/utils/dciChartModel'

const NOW = 1_700_000_000

describe('createChartModel', () => {
  it('defaults to a line chart with no DCIs', () => {
    const model = createChartModel()
    expect(model.mode).toBe('line')
    expect(model.dcis).toEqual([])
    expect(model.time.preset).toBe(DEFAULT_TIME_PRESET)
    expect(model.tier).toBe('auto')
  })

  it('merges a partial render block instead of replacing it', () => {
    const model = createChartModel({ render: { area: true } })
    expect(model.render.area).toBe(true)
    expect(model.render.showGrid).toBe(true)
    expect(model.render.legend).toBe('bottom')
  })

  it('accepts initial DCIs and mode', () => {
    const model = createChartModel({ mode: 'table', dcis: [{ nodeId: 7, dciId: 1441 }] })
    expect(model.mode).toBe('table')
    expect(model.dcis).toHaveLength(1)
  })
})

describe('resolveTimeRange', () => {
  it('resolves a preset to a window ending now', () => {
    const model = createChartModel({ time: { preset: 'last4h' } })
    expect(resolveTimeRange(model, NOW)).toEqual({ timeFrom: NOW - 4 * 3600, timeTo: NOW })
  })

  it('passes a custom range through', () => {
    const model = createChartModel({ time: { preset: 'custom', from: 1000, to: 2000 } })
    expect(resolveTimeRange(model, NOW)).toEqual({ timeFrom: 1000, timeTo: 2000 })
  })

  it('accepts ISO strings and Dates for a custom range', () => {
    const model = createChartModel({
      time: {
        preset: 'custom',
        from: '2023-11-14T00:00:00Z',
        to: new Date('2023-11-15T00:00:00Z'),
      },
    })
    const { timeFrom, timeTo } = resolveTimeRange(model, NOW)
    expect(timeTo - timeFrom).toBe(86400)
  })

  it('treats millisecond values as milliseconds', () => {
    const model = createChartModel({
      time: { preset: 'custom', from: 1_700_000_000_000, to: 1_700_003_600_000 },
    })
    expect(resolveTimeRange(model, NOW)).toEqual({ timeFrom: 1_700_000_000, timeTo: 1_700_003_600 })
  })

  it.each([
    ['an inverted range', { from: 2000, to: 1000 }],
    ['a missing bound', { from: 2000 }],
    ['an unparseable bound', { from: 'not a date', to: 'either' }],
  ])('falls back to the default window for %s', (_label, time) => {
    const model = createChartModel({ time: { preset: 'custom', ...time } })
    const fallback = getTimePreset(DEFAULT_TIME_PRESET).seconds
    expect(resolveTimeRange(model, NOW)).toEqual({ timeFrom: NOW - fallback, timeTo: NOW })
  })

  it('falls back to the default window for an unknown preset', () => {
    const model = createChartModel({ time: { preset: 'last3fortnights' } })
    const fallback = getTimePreset(DEFAULT_TIME_PRESET).seconds
    expect(resolveTimeRange(model, NOW)).toEqual({ timeFrom: NOW - fallback, timeTo: NOW })
  })
})

describe('buildHistoryParams', () => {
  it('buckets server-side and carries the tier', () => {
    const model = createChartModel({ time: { preset: 'last1h' }, tier: 'hourly' })
    expect(buildHistoryParams(model, NOW)).toMatchObject({
      timeFrom: NOW - 3600,
      timeTo: NOW,
      tier: 'hourly',
      maxDataPoints: MAX_CHART_POINTS,
    })
  })

  it('asks for minmax only when a band is wanted', () => {
    expect(buildHistoryParams(createChartModel(), NOW).function).toBeUndefined()
    expect(buildHistoryParams(createChartModel({ band: true }), NOW).function).toBe('minmax')
  })

  it('forces the raw tier and skips bucketing for a raw chart', () => {
    const params = buildHistoryParams(createChartModel({ raw: true, tier: 'daily' }), NOW)
    expect(params.historicalDataType).toBe(1)
    expect(params.tier).toBe('raw')
    expect(params.maxDataPoints).toBeUndefined()
  })

  it('does not request a band on a raw chart, where the server would ignore it', () => {
    const params = buildHistoryParams(createChartModel({ raw: true, band: true }), NOW)
    expect(params.function).toBeUndefined()
  })
})

describe('percentile', () => {
  it('interpolates between samples', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
  })

  it('returns the bounds at 0 and 100', () => {
    expect(percentile([5, 1, 9], 0)).toBe(1)
    expect(percentile([5, 1, 9], 100)).toBe(9)
  })

  it('handles a single sample and an empty series', () => {
    expect(percentile([42], 95)).toBe(42)
    expect(percentile([], 95)).toBeNull()
  })

  it('ignores non-finite values', () => {
    expect(percentile([1, NaN, 3, Infinity], 50)).toBe(2)
  })

  it('does not depend on input order', () => {
    expect(percentile([4, 1, 3, 2], 75)).toBe(percentile([1, 2, 3, 4], 75))
  })
})

describe('summarizeSeries', () => {
  it('reports curr, min, max, avg and p95', () => {
    const summary = summarizeSeries([10, 20, 30, 40])
    expect(summary).toMatchObject({ curr: 40, min: 10, max: 40, avg: 25 })
    expect(summary.p95).toBeCloseTo(38.5)
  })

  it('takes curr from the last point, not the largest', () => {
    expect(summarizeSeries([100, 5]).curr).toBe(5)
  })

  it('returns nulls for an empty series', () => {
    expect(summarizeSeries([])).toEqual({ curr: null, min: null, max: null, avg: null, p95: null })
  })
})

describe('URL codec', () => {
  it('emits only the DCI list for a default model', () => {
    const model = createChartModel({ dcis: [{ nodeId: 7, dciId: 1441 }] })
    expect(serializeToQuery(model, 7)).toEqual({ dci: '1441' })
  })

  it('qualifies DCIs that are not on the current object', () => {
    const model = createChartModel({
      dcis: [
        { nodeId: 7, dciId: 1441 },
        { nodeId: 9, dciId: 1442 },
      ],
    })
    expect(serializeToQuery(model, 7).dci).toBe('1441,9:1442')
  })

  it('round trips a fully configured model', () => {
    const model = createChartModel({
      mode: 'line',
      dcis: [
        { nodeId: 7, dciId: 1441 },
        { nodeId: 9, dciId: 1442 },
      ],
      time: { preset: 'last12h' },
      tier: 'hourly',
      band: true,
      percentile: 95,
      live: true,
      refreshSeconds: 60,
      render: { area: true, stacked: true, log: true, legend: 'right', extendedLegend: false },
      yAxis: { auto: false, min: 0, max: 100, label: 'bps' },
      markers: [1700000000000, 1700003600000],
    })

    const parsed = parseFromQuery(serializeToQuery(model, 7), 7)

    expect(parsed.dcis).toEqual(model.dcis)
    expect(parsed.time.preset).toBe('last12h')
    expect(parsed.tier).toBe('hourly')
    expect(parsed.band).toBe(true)
    expect(parsed.percentile).toBe(95)
    expect(parsed.live).toBe(true)
    expect(parsed.refreshSeconds).toBe(60)
    expect(parsed.render).toMatchObject({
      area: true,
      stacked: true,
      log: true,
      legend: 'right',
      extendedLegend: false,
    })
    expect(parsed.yAxis).toMatchObject({ auto: false, min: 0, max: 100, label: 'bps' })
    expect(parsed.markers).toEqual(model.markers)
  })

  it('round trips a custom time range as absolute bounds', () => {
    const model = createChartModel({
      dcis: [{ nodeId: 7, dciId: 1 }],
      time: { preset: 'custom', from: 1000, to: 2000 },
    })
    const query = serializeToQuery(model, 7)
    expect(query).toMatchObject({ t: 'custom', from: '1000', to: '2000' })

    const parsed = parseFromQuery(query, 7)
    expect(resolveTimeRange(parsed, NOW)).toEqual({ timeFrom: 1000, timeTo: 2000 })
  })

  it('round trips the table and comparison modes', () => {
    const table = createChartModel({ mode: 'table', dcis: [{ nodeId: 7, dciId: 1 }] })
    expect(parseFromQuery(serializeToQuery(table, 7), 7).mode).toBe('table')

    const pie = createChartModel({
      mode: 'comparison',
      comparisonType: 'pie',
      dcis: [{ nodeId: 7, dciId: 1 }],
    })
    const parsed = parseFromQuery(serializeToQuery(pie, 7), 7)
    expect(parsed.mode).toBe('comparison')
    expect(parsed.comparisonType).toBe('pie')
  })

  it('parses a bare DCI list against the current object', () => {
    const model = parseFromQuery({ dci: '1441,1442' }, 7)
    expect(model.dcis).toEqual([
      { nodeId: 7, dciId: 1441 },
      { nodeId: 7, dciId: 1442 },
    ])
  })

  it('drops malformed DCI entries rather than throwing', () => {
    const model = parseFromQuery({ dci: '1441,,abc,0,-3,9:1442' }, 7)
    expect(model.dcis).toEqual([
      { nodeId: 7, dciId: 1441 },
      { nodeId: 9, dciId: 1442 },
    ])
  })

  it('round-trips every legend placement through the URL', () => {
    for (const legend of ['bottom', 'top', 'left', 'right', 'none']) {
      const model = createChartModel({ dcis: [{ nodeId: 7, dciId: 1 }], render: { legend } })
      expect(parseFromQuery(serializeToQuery(model, 7), 7).render.legend).toBe(legend)
    }
  })

  it('ignores unknown modes, tiers, presets and flags', () => {
    const model = parseFromQuery(
      { dci: '1', m: 'hologram', tier: 'weekly', t: 'last3fortnights', o: 'area,sparkles' },
      7,
    )
    expect(model.mode).toBe('line')
    expect(model.tier).toBe('auto')
    expect(model.time.preset).toBe(DEFAULT_TIME_PRESET)
    expect(model.render.area).toBe(true)
  })

  it('returns an empty model for an empty query', () => {
    const model = parseFromQuery({}, 7)
    expect(model.dcis).toEqual([])
    expect(model.mode).toBe('line')
  })

  it('tolerates a repeated query param arriving as an array', () => {
    expect(parseFromQuery({ dci: ['1441', '1442'] }, 7).dcis).toHaveLength(2)
  })

  it('accepts a y-axis bound on its own', () => {
    const model = parseFromQuery({ dci: '1', ymax: '100' }, 7)
    expect(model.yAxis.auto).toBe(false)
    expect(model.yAxis.max).toBe(100)
    expect(model.yAxis.min).toBeNull()
  })

  it('omits y-axis bounds while the axis is automatic', () => {
    const model = createChartModel({
      dcis: [{ nodeId: 7, dciId: 1 }],
      yAxis: { auto: true, min: 0, max: 100 },
    })
    const query = serializeToQuery(model, 7)
    expect(query.ymin).toBeUndefined()
    expect(query.ymax).toBeUndefined()
  })
})

describe('chartTabLabel', () => {
  it.each([
    [{ mode: 'line' }, 'Line Chart'],
    [{ mode: 'line', raw: true }, 'Raw Chart'],
    [{ mode: 'table' }, 'Data'],
    [{ mode: 'comparison' }, 'Comparison'],
  ])('names a single-DCI %o chart', (init, expected) => {
    expect(chartTabLabel(createChartModel({ ...init, dcis: [{ nodeId: 7, dciId: 1 }] }))).toBe(
      expected,
    )
  })

  it('counts the DCIs once there is more than one', () => {
    const model = createChartModel({
      dcis: [
        { nodeId: 7, dciId: 1 },
        { nodeId: 7, dciId: 2 },
        { nodeId: 7, dciId: 3 },
      ],
    })
    expect(chartTabLabel(model)).toBe('Line Chart (3)')
  })
})

describe('serializeToQuery with no DCIs', () => {
  it('omits the dci param entirely rather than emitting an empty one', () => {
    expect(serializeToQuery(createChartModel(), 7).dci).toBeUndefined()
  })

  it('still round trips to an empty model', () => {
    const parsed = parseFromQuery(serializeToQuery(createChartModel(), 7), 7)
    expect(parsed.dcis).toEqual([])
  })
})
