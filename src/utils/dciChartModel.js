/**
 * Ad-hoc DCI chart model; round-trips through the route query (same contract as
 * `logQueryModel`). The URL form is kept short for pasting into chat:
 *   ?dci=1441,1442&t=last4h&m=line&o=area,p95&tier=auto
 * A `dci` entry is `dciId` (on the object being viewed) or `nodeId:dciId`.
 */

/** `comparison` covers both bar and pie, which differ only in rendering. */
export const CHART_MODES = ['line', 'table', 'comparison']

/** Legacy client's preset list; `seconds` is the width of the window ending at "now". */
export const CHART_TIME_PRESETS = [
  { id: 'last10m', label: 'Last 10 minutes', seconds: 10 * 60 },
  { id: 'last30m', label: 'Last 30 minutes', seconds: 30 * 60 },
  { id: 'last1h', label: 'Last hour', seconds: 3600 },
  { id: 'last2h', label: 'Last 2 hours', seconds: 2 * 3600 },
  { id: 'last4h', label: 'Last 4 hours', seconds: 4 * 3600 },
  { id: 'last12h', label: 'Last 12 hours', seconds: 12 * 3600 },
  { id: 'last1d', label: 'Last day', seconds: 86400 },
  { id: 'last2d', label: 'Last 2 days', seconds: 2 * 86400 },
  { id: 'last5d', label: 'Last 5 days', seconds: 5 * 86400 },
  { id: 'last1w', label: 'Last week', seconds: 7 * 86400 },
  { id: 'last1mo', label: 'Last month', seconds: 30 * 86400 },
  { id: 'last1y', label: 'Last year', seconds: 365 * 86400 },
  { id: 'custom', label: 'Custom range...' },
]

export const DEFAULT_TIME_PRESET = 'last1h'

export const DATA_TIERS = [
  { id: 'auto', label: 'Automatic' },
  { id: 'raw', label: 'Raw samples' },
  { id: 'hourly', label: 'Hourly averages' },
  { id: 'daily', label: 'Daily averages' },
]

/** `render.legend` carries the position directly, 'none' for hidden (as legacy legendPosition). */
export const LEGEND_PLACEMENTS = [
  { id: 'bottom', label: 'Bottom' },
  { id: 'top', label: 'Top' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]

export const DEFAULT_LEGEND_PLACEMENT = 'bottom'

/** Above this the server buckets (`maxDataPoints`) rather than shipping every sample. */
export const MAX_CHART_POINTS = 1000

/** Hard row cap, well above the point budget so bucketing rather than truncation applies. */
const MAX_ROWS = 10000

/** @param {string} id */
export function getTimePreset(id) {
  return CHART_TIME_PRESETS.find((p) => p.id === id) ?? null
}

/**
 * @param {object} [init]
 * @param {Array<{ nodeId: number, dciId: number, label?: string }>} [init.dcis]
 * @param {'line'|'table'|'comparison'} [init.mode]
 * @param {'bar'|'pie'} [init.comparisonType]
 * @param {boolean} [init.raw] - read raw samples rather than processed values
 */
export function createChartModel(init = {}) {
  return {
    mode: 'line',
    comparisonType: 'bar',
    dcis: [],
    time: { preset: DEFAULT_TIME_PRESET },
    live: false,
    refreshSeconds: 30,
    percentile: null,
    band: false,
    raw: false,
    tier: 'auto',
    markers: [],
    ...init,
    // Merged so a partial `init.render` keeps the other defaults.
    render: {
      area: false,
      stacked: false,
      log: false,
      translucent: false,
      showGrid: true,
      legend: 'bottom',
      extendedLegend: true,
      ...init.render,
    },
    yAxis: { auto: true, min: null, max: null, label: '', ...init.yAxis },
  }
}

/**
 * Unix seconds. `now` is injectable so several series share one instant and stable query keys.
 *
 * @param {object} model
 * @param {number} [now] - Unix seconds
 * @returns {{ timeFrom: number, timeTo: number }}
 */
export function resolveTimeRange(model, now = Math.floor(Date.now() / 1000)) {
  const time = model?.time ?? {}

  if (time.preset === 'custom') {
    const from = toEpochSeconds(time.from)
    const to = toEpochSeconds(time.to)
    // An incomplete or inverted custom range falls back to the default window.
    if (from != null && to != null && to > from) return { timeFrom: from, timeTo: to }
    const fallback = getTimePreset(DEFAULT_TIME_PRESET)
    return { timeFrom: now - fallback.seconds, timeTo: now }
  }

  const preset = getTimePreset(time.preset) ?? getTimePreset(DEFAULT_TIME_PRESET)
  return { timeFrom: now - preset.seconds, timeTo: now }
}

/** Accepts epoch seconds, epoch millis, ISO strings and Dates. */
function toEpochSeconds(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  if (typeof value === 'number') {
    // Anything past ~1973 in seconds is below this; above it, the value is millis.
    return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value)
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

/**
 * @param {object} model
 * @param {number} [now] - shared instant, as for `resolveTimeRange`
 */
export function buildHistoryParams(model, now) {
  const { timeFrom, timeTo } = resolveTimeRange(model, now)
  const params = { timeFrom, timeTo, maxRows: MAX_ROWS, tier: model.tier ?? 'auto' }

  if (model.raw) {
    params.historicalDataType = 1
    params.tier = 'raw'
    return params
  }

  params.maxDataPoints = MAX_CHART_POINTS
  // minmax only means anything on an aggregate tier; the server ignores it on raw reads.
  if (model.band) params.function = 'minmax'

  return params
}

/**
 * Linear-interpolated percentile over an unsorted numeric array; null for an empty input.
 *
 * @param {number[]} values
 * @param {number} p - 0..100
 * @returns {number|null}
 */
export function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]

  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

/** @param {number[]} values - in chronological order; "curr" is the last one */
export function summarizeSeries(values) {
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) {
    return { curr: null, min: null, max: null, avg: null, p95: null }
  }
  return {
    curr: finite[finite.length - 1],
    min: Math.min(...finite),
    max: Math.max(...finite),
    avg: finite.reduce((sum, v) => sum + v, 0) / finite.length,
    p95: percentile(finite, 95),
  }
}

/**
 * Comma-separated `o` param. Each entry is `[name, path, value]`: a flag is emitted when the
 * model field at `path` holds `value`, which always differs from the default.
 */
const FLAGS = [
  ['area', 'render.area', true],
  ['stacked', 'render.stacked', true],
  ['log', 'render.log', true],
  ['translucent', 'render.translucent', true],
  ['nogrid', 'render.showGrid', false],
  ['nolegend', 'render.legend', 'none'],
  ['legendright', 'render.legend', 'right'],
  ['legendleft', 'render.legend', 'left'],
  ['legendtop', 'render.legend', 'top'],
  ['brief', 'render.extendedLegend', false],
  ['p95', 'percentile', 95],
  ['band', 'band', true],
  ['raw', 'raw', true],
  ['live', 'live', true],
].map(([name, path, value]) => {
  const keys = path.split('.')
  const field = keys.pop()
  const owner = (m) => keys.reduce((o, k) => o[k], m)
  return [name, (m) => owner(m)[field] === value, (m) => (owner(m)[field] = value)]
})

/**
 * Only non-default values are emitted.
 *
 * @param {object} model
 * @param {number} [defaultNodeId] - omitted from `dci` entries on this node
 */
export function serializeToQuery(model, defaultNodeId) {
  const query = {}

  if (model.dcis.length) {
    query.dci = model.dcis
      .map((d) =>
        d.nodeId != null && d.nodeId !== defaultNodeId ? `${d.nodeId}:${d.dciId}` : d.dciId,
      )
      .join(',')
  }

  if (model.mode !== 'line') query.m = model.mode
  if (model.mode === 'comparison' && model.comparisonType !== 'bar') query.c = model.comparisonType

  if (model.time.preset === 'custom') {
    query.t = 'custom'
    const { timeFrom, timeTo } = resolveTimeRange(model)
    query.from = String(timeFrom)
    query.to = String(timeTo)
  } else if (model.time.preset !== DEFAULT_TIME_PRESET) {
    query.t = model.time.preset
  }

  if (model.tier && model.tier !== 'auto') query.tier = model.tier
  if (model.live && model.refreshSeconds !== 30) query.r = String(model.refreshSeconds)

  const flags = FLAGS.filter(([, isSet]) => isSet(model)).map(([name]) => name)
  if (flags.length) query.o = flags.join(',')

  if (!model.yAxis.auto) {
    if (model.yAxis.min != null) query.ymin = String(model.yAxis.min)
    if (model.yAxis.max != null) query.ymax = String(model.yAxis.max)
  }
  if (model.yAxis.label) query.ylabel = model.yAxis.label

  if (model.markers.length) query.mk = model.markers.join(',')

  return query
}

/**
 * Unknown or malformed values fall back to defaults: the query is user-editable.
 *
 * @param {object} query - `route.query`
 * @param {number} [defaultNodeId] - node for bare `dciId` entries
 */
export function parseFromQuery(query = {}, defaultNodeId) {
  const model = createChartModel()

  model.dcis = parseList(query.dci)
    .map((entry) => {
      const [a, b] = entry.split(':')
      const nodeId = b == null ? defaultNodeId : Number(a)
      const dciId = Number(b == null ? a : b)
      return Number.isFinite(dciId) && dciId > 0 && nodeId != null ? { nodeId, dciId } : null
    })
    .filter(Boolean)

  if (CHART_MODES.includes(query.m)) model.mode = query.m
  if (query.c === 'pie' || query.c === 'bar') model.comparisonType = query.c

  if (query.t === 'custom') {
    model.time = { preset: 'custom', from: Number(query.from), to: Number(query.to) }
  } else if (getTimePreset(query.t)) {
    model.time = { preset: query.t }
  }

  if (DATA_TIERS.some((t) => t.id === query.tier)) model.tier = query.tier

  const flags = new Set(parseList(query.o))
  for (const [name, , apply] of FLAGS) {
    if (flags.has(name)) apply(model)
  }

  const refresh = Number(query.r)
  if (Number.isFinite(refresh) && refresh > 0) model.refreshSeconds = refresh

  const ymin = Number(query.ymin)
  const ymax = Number(query.ymax)
  if (Number.isFinite(ymin) || Number.isFinite(ymax)) {
    model.yAxis.auto = false
    if (Number.isFinite(ymin)) model.yAxis.min = ymin
    if (Number.isFinite(ymax)) model.yAxis.max = ymax
  }
  if (typeof query.ylabel === 'string') model.yAxis.label = query.ylabel

  model.markers = parseList(query.mk)
    .map(Number)
    .filter((n) => Number.isFinite(n))

  return model
}

/** Tolerates arrays (a repeated query param) and empty values. */
function parseList(value) {
  if (value == null) return []
  const raw = Array.isArray(value) ? value.join(',') : String(value)
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function chartTabLabel(model) {
  const base =
    model.mode === 'table'
      ? 'Data'
      : model.mode === 'comparison'
        ? 'Comparison'
        : model.raw
          ? 'Raw Chart'
          : 'Line Chart'
  return model.dcis.length > 1 ? `${base} (${model.dcis.length})` : base
}
