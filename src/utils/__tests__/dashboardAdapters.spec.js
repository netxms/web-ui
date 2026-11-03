import { describe, it, expect } from 'vitest'
import {
  adaptApiDashboard,
  serializeDashboard,
  updateWidgetConfig,
  createWidget,
} from '@/utils/dashboardAdapters'
import { ELEMENT_TYPES, ELEMENT_TYPE_BY_KEY } from '@/utils/dashboardElements'

function makeObj(overrides = {}) {
  return {
    id: 1,
    name: 'Test Dashboard',
    numColumns: 4,
    elements: [],
    ...overrides,
  }
}

describe('adaptApiDashboard', () => {
  it('returns correct id, name, cols, rowHeight', () => {
    const result = adaptApiDashboard(makeObj({ id: 42, name: 'My Board', numColumns: 3 }))
    expect(result.id).toBe(42)
    expect(result.name).toBe('My Board')
    expect(result.cols).toBe(3)
    expect(result.rowHeight).toBe(80)
  })

  it('defaults to 4 columns when numColumns is absent', () => {
    const result = adaptApiDashboard({ id: 1, name: 'x', elements: [] })
    expect(result.cols).toBe(4)
  })

  it('maps element type 0 → label and reads title as text', () => {
    const obj = makeObj({
      elements: [{ type: 0, layout: {}, data: { title: 'Hello' } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('label')
    expect(w.apiType).toBe(0)
    expect(w.config.text).toBe('Hello')
  })

  it('maps element type 11 → alarm-viewer and decodes filter bitmasks', () => {
    const obj = makeObj({
      elements: [{ type: 11, layout: {}, data: { title: 'A', severityFilter: 16 } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('alarm-viewer')
    expect(w.config.severities).toEqual([4])
    expect(w.config.alarmStates).toBeNull()
  })

  it('maps unknown element type → unknown, keeping the raw data', () => {
    const obj = makeObj({
      elements: [{ type: 999, layout: {}, data: { mystery: true } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('unknown')
    expect(w.apiType).toBe(999)
    expect(w.raw.data).toEqual({ mystery: true })
  })

  it('keeps untouched data and layout JSON on each widget', () => {
    const data = { title: 'T', futureField: { nested: [1, 2] } }
    const layout = { horizontalSpan: 2, verticalSpan: 1, narrowScreenOrder: 3 }
    const obj = makeObj({ elements: [{ type: 14, data, layout }] })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.raw.data).toEqual(data)
    expect(w.raw.layout).toEqual(layout)
  })

  it('normalizes legacy string booleans', () => {
    const obj = makeObj({
      elements: [{ type: 1, layout: {}, data: { stacked: 'true', showLegend: 'false' } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.config.stacked).toBe(true)
    expect(w.config.showLegend).toBe(false)
  })

  it('parses JSON string data/layout fields', () => {
    const obj = makeObj({
      elements: [
        { type: 0, layout: '{"horizontalSpan":3,"verticalSpan":2}', data: '{"title":"Parsed"}' },
      ],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.w).toBe(3)
    expect(w.h).toBe(2)
    expect(w.config.text).toBe('Parsed')
  })

  it('flows elements left-to-right and wraps rows (legacy layout)', () => {
    const obj = makeObj({
      numColumns: 4,
      elements: [
        { type: 0, layout: { horizontalSpan: 2, verticalSpan: 1 }, data: {} },
        { type: 0, layout: { horizontalSpan: 2, verticalSpan: 1 }, data: {} },
        { type: 0, layout: { horizontalSpan: 2, verticalSpan: 1 }, data: {} },
      ],
    })
    const [a, b, c] = adaptApiDashboard(obj).widgets
    expect(a).toMatchObject({ x: 0, y: 0, w: 2 })
    expect(b).toMatchObject({ x: 2, y: 0, w: 2 })
    expect(c).toMatchObject({ x: 0, y: 1, w: 2 })
  })

  it('prefers explicit gridX/gridY when every element has them', () => {
    const obj = makeObj({
      numColumns: 12,
      elements: [
        { type: 0, layout: { horizontalSpan: 4, verticalSpan: 1, gridX: 8, gridY: 5 }, data: {} },
        { type: 0, layout: { horizontalSpan: 4, verticalSpan: 1, gridX: 0, gridY: 2 }, data: {} },
      ],
    })
    const [a, b] = adaptApiDashboard(obj).widgets
    expect(a).toMatchObject({ x: 8, y: 5 })
    expect(b).toMatchObject({ x: 0, y: 2 })
  })

  it('falls back to flow layout when only some elements have gridX/gridY', () => {
    const obj = makeObj({
      numColumns: 4,
      elements: [
        { type: 0, layout: { horizontalSpan: 2, gridX: 2, gridY: 2 }, data: {} },
        { type: 0, layout: { horizontalSpan: 2 }, data: {} },
      ],
    })
    const [a] = adaptApiDashboard(obj).widgets
    expect(a).toMatchObject({ x: 0, y: 0 })
  })

  it('clamps widget width to numColumns', () => {
    const obj = makeObj({
      numColumns: 2,
      elements: [{ type: 0, layout: { horizontalSpan: 10 }, data: {} }],
    })
    expect(adaptApiDashboard(obj).widgets[0].w).toBe(2)
  })

  it('attaches dashboardId/elementIndex to scripted chart configs', () => {
    const obj = makeObj({
      id: 77,
      elements: [
        { type: 0, layout: {}, data: {} },
        { type: 30, layout: {}, data: { script: 'x' } },
      ],
    })
    const [, scripted] = adaptApiDashboard(obj).widgets
    expect(scripted.config.dashboardId).toBe(77)
    expect(scripted.config.elementIndex).toBe(1)
  })

  it('maps element type 33 -> scripted-gauge with gauge fields and execution context', () => {
    const obj = makeObj({
      id: 78,
      elements: [
        { type: 0, layout: {}, data: {} },
        { type: 33, layout: {}, data: '{"script":"return 5","objectId":0,"gaugeType":1}' },
      ],
    })
    const [, w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('scripted-gauge')
    expect(w.config.gaugeType).toBe(1)
    expect(w.config.script).toBe('return 5')
    expect(w.config.objectId).toBe(0)
    expect(w.config.dashboardId).toBe(78)
    expect(w.config.elementIndex).toBe(1)
  })

  it('maps element type 34 -> ai-observation-monitor with legacy defaults', () => {
    const obj = makeObj({ elements: [{ type: 34, layout: {}, data: '{}' }] })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('ai-observation-monitor')
    expect(w.config).toMatchObject({
      newOnly: true,
      maxRecords: 50,
      refreshInterval: 60,
      objectId: 0,
      instanceId: 0,
    })
  })

  it('reads a DCI gauge (13) exactly as before the shared gauge fragment', () => {
    const obj = makeObj({
      elements: [
        {
          type: 13,
          layout: {},
          data: { dciList: [], gaugeType: '2', maxValue: '250', rightRedZone: 200 },
        },
      ],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('gauge-chart')
    expect(w.config).toMatchObject({
      gaugeType: 2,
      minValue: 0,
      maxValue: 250,
      leftYellowZone: 0,
      leftRedZone: 0,
      rightYellowZone: 70,
      rightRedZone: 200,
      refreshRate: 30,
      dciList: [],
    })
  })

  it('attaches dashboardId to embedded-dashboard configs (for the cycle guard)', () => {
    const obj = makeObj({
      id: 703,
      elements: [{ type: 7, layout: {}, data: { dashboardObjects: [700] } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('embedded-dashboard')
    expect(w.config.dashboardId).toBe(703)
    expect(w.config.dashboardObjects).toEqual([700])
  })

  it('maps element type 29 → port-view reading the legacy "rootObjectId" field', () => {
    const obj = makeObj({
      elements: [{ type: 29, layout: {}, data: { rootObjectId: 502, objectName: 'web-01' } }],
    })
    const [w] = adaptApiDashboard(obj).widgets
    expect(w.type).toBe('port-view')
    expect(w.config.objectId).toBe(502)
    expect(w.config.objectName).toBe('web-01')
  })
})

describe('serializeDashboard', () => {
  it('orders elements by (y, x) and writes spans + grid positions', () => {
    const dashboard = {
      id: 1,
      cols: 12,
      widgets: [
        {
          id: 'b',
          type: 'label',
          apiType: 0,
          x: 4,
          y: 2,
          w: 4,
          h: 1,
          config: {},
          raw: { data: {}, layout: {} },
        },
        {
          id: 'a',
          type: 'label',
          apiType: 0,
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          config: {},
          raw: { data: {}, layout: {} },
        },
      ],
    }
    const result = serializeDashboard(dashboard)
    expect(result.numColumns).toBe(12)
    expect(result.elements.map((e) => e.guid)).toEqual(['a', 'b'])
    expect(result.elements[0].layout).toMatchObject({
      horizontalSpan: 2,
      verticalSpan: 2,
      gridX: 0,
      gridY: 0,
    })
  })

  it('preserves unknown data and layout fields through config edits', () => {
    const obj = makeObj({
      elements: [
        {
          guid: 'g1',
          type: 14,
          data: { title: 'Old', url: 'https://a.example', futureField: 42 },
          layout: { horizontalSpan: 2, verticalSpan: 1, heightHint: 120 },
        },
      ],
    })
    const dashboard = adaptApiDashboard(obj)
    const edited = updateWidgetConfig(dashboard.widgets[0], {
      config: { ...dashboard.widgets[0].config, url: 'https://b.example' },
    })
    const result = serializeDashboard({ ...dashboard, widgets: [edited] })
    expect(result.elements[0].data.url).toBe('https://b.example')
    expect(result.elements[0].data.futureField).toBe(42)
    expect(result.elements[0].layout.heightHint).toBe(120)
  })

  it('keeps template DCI entries of a chart, including an empty template name', () => {
    const concrete = { nodeId: 7, dciId: 70, name: 'CPU', dciName: 'System.CPU.Usage' }
    const template = {
      nodeId: 4294967295,
      dciId: 0,
      name: '',
      dciName: '',
      dciDescription: 'Inbound traffic on (.*)',
      dciTag: '',
      regexMatch: true,
      multiMatch: true,
    }
    const obj = makeObj({
      elements: [
        {
          guid: 'lc',
          type: 1,
          data: { dciList: [concrete, template] },
          layout: { horizontalSpan: 2, verticalSpan: 1 },
        },
      ],
    })
    const adapted = adaptApiDashboard(obj)
    expect(adapted.widgets[0].config.dciList[1].name).toBe('')

    const [, written] = serializeDashboard(adapted).elements[0].data.dciList
    expect(written).toMatchObject(template)
  })

  it('reads and writes the table cell of a chart entry', () => {
    const cell = { nodeId: 7, dciId: 71, type: 2, column: 'FREE', instance: 'C:' }
    const obj = makeObj({
      elements: [
        {
          guid: 'bc',
          type: 2,
          data: { dciList: [cell, { nodeId: 7, dciId: 70 }] },
          layout: { horizontalSpan: 1, verticalSpan: 1 },
        },
      ],
    })
    const adapted = adaptApiDashboard(obj)
    const [table, plain] = adapted.widgets[0].config.dciList
    expect(table).toMatchObject({ type: 2, column: 'FREE', instance: 'C:' })
    expect(plain).toMatchObject({ type: 1, column: '', instance: '' })

    // A new DCI picked in the editor drops the cell, rather than keeping it from the original.
    adapted.widgets[0].config.dciList[0] = {
      ...table,
      dciId: 72,
      type: 1,
      column: '',
      instance: '',
    }
    const [written] = serializeDashboard(adapted).elements[0].data.dciList
    expect(written).toMatchObject({ dciId: 72, type: 1, column: '', instance: '' })
  })

  it('keeps a scripted gauge element type and its unmodeled GaugeConfig fields', () => {
    const obj = makeObj({
      elements: [
        {
          guid: 'sg',
          type: 33,
          data: { script: 'return 1', gaugeType: 0, vertical: true, fontName: 'Arial' },
          layout: { horizontalSpan: 1, verticalSpan: 1 },
        },
      ],
    })
    const [el] = serializeDashboard(adaptApiDashboard(obj)).elements
    expect(el.type).toBe(33)
    expect(el.data.vertical).toBe(true)
    expect(el.data.fontName).toBe('Arial')
    expect(el.data.script).toBe('return 1')
  })

  it('round-trips: serialize(adapt(x)) is stable under a second pass', () => {
    const obj = makeObj({
      id: 9,
      numColumns: 12,
      elements: [
        {
          guid: 'w1',
          type: 11,
          data: { title: 'Alarms', objectId: 0, severityFilter: 31, stateFilter: 15 },
          layout: { horizontalSpan: 7, verticalSpan: 4, gridX: 0, gridY: 1 },
        },
        {
          guid: 'w2',
          type: 0,
          data: { title: 'Header', align: 'center' },
          layout: { horizontalSpan: 12, verticalSpan: 1, gridX: 0, gridY: 0 },
        },
      ],
    })
    const first = serializeDashboard(adaptApiDashboard(obj))
    const second = serializeDashboard(adaptApiDashboard({ ...first, name: 'x' }))
    expect(second.elements).toEqual(first.elements)
    expect(second.numColumns).toBe(first.numColumns)
  })

  it('round-trips port-view config back to the legacy "rootObjectId" field', () => {
    const obj = makeObj({
      elements: [{ guid: 'pv1', type: 29, data: { rootObjectId: 502 }, layout: {} }],
    })
    const dashboard = adaptApiDashboard(obj)
    const result = serializeDashboard(dashboard)
    expect(result.elements[0].data.rootObjectId).toBe(502)
  })

  it('round-trips object-query columns (properties[])', () => {
    const obj = makeObj({
      elements: [
        {
          guid: 'oq1',
          type: 28,
          data: {
            query: 'type == NODE',
            rootObjectId: 0,
            properties: [{ name: 'cpu', displayName: 'CPU %', type: 0 }],
          },
          layout: {},
        },
      ],
    })
    const dashboard = adaptApiDashboard(obj)
    expect(dashboard.widgets[0].config.properties).toEqual([{ name: 'cpu', displayName: 'CPU %' }])
    const result = serializeDashboard(dashboard)
    expect(result.elements[0].data.properties).toEqual([
      { name: 'cpu', displayName: 'CPU %', type: 0 },
    ])
  })

  it('leaves unknown-type element data byte-identical', () => {
    const data = { anything: { deep: true }, list: [1, 2, 3] }
    const obj = makeObj({ elements: [{ guid: 'u1', type: 999, data, layout: {} }] })
    const dashboard = adaptApiDashboard(obj)
    const result = serializeDashboard(dashboard)
    expect(result.elements[0].data).toEqual(data)
    expect(result.elements[0].type).toBe(999)
  })
})

describe('updateWidgetConfig', () => {
  const widget = {
    id: 'w',
    type: 'web-page',
    apiType: 14,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    config: { title: 'T', url: 'https://a.example' },
    raw: { data: { title: 'T', url: 'https://a.example', extra: 1 }, layout: { gridX: 0 } },
  }

  it('applies config and keeps raw.data in sync', () => {
    const next = updateWidgetConfig(widget, { config: { ...widget.config, title: 'New' } })
    expect(next.config.title).toBe('New')
    expect(next.raw.data.title).toBe('New')
    expect(next.raw.data.extra).toBe(1)
  })

  it('merges layout patches into raw.layout', () => {
    const next = updateWidgetConfig(widget, { config: widget.config, layout: { heightHint: 99 } })
    expect(next.raw.layout).toMatchObject({ gridX: 0, heightHint: 99 })
  })

  it('replaces data wholesale and re-derives config from rawData', () => {
    const next = updateWidgetConfig(widget, {
      rawData: { title: 'Raw', url: 'https://c.example', brandNew: true },
    })
    expect(next.config.url).toBe('https://c.example')
    expect(next.raw.data.brandNew).toBe(true)
  })

  it('keeps scripted-chart execution context through edits', () => {
    const scripted = {
      ...widget,
      type: 'scripted-bar-chart',
      apiType: 30,
      config: { script: 'x', objectId: 0, dashboardId: 700, elementIndex: 4 },
      raw: { data: { script: 'x' }, layout: {} },
    }
    const next = updateWidgetConfig(scripted, { rawData: { script: 'y' } })
    expect(next.config.dashboardId).toBe(700)
    expect(next.config.elementIndex).toBe(4)
  })
})

describe('createWidget', () => {
  it('creates a widget with registry default size and apiType', () => {
    const w = createWidget('line-chart')
    const def = ELEMENT_TYPE_BY_KEY['line-chart']
    expect(w.type).toBe('line-chart')
    expect(w.apiType).toBe(def.apiType)
    expect(w.w).toBe(def.defaultSize.w)
    expect(w.h).toBe(def.defaultSize.h)
  })

  it('uses provided y position and x=0', () => {
    const w = createWidget('label', 5)
    expect(w.y).toBe(5)
    expect(w.x).toBe(0)
  })

  it('copies defaultData (not a reference)', () => {
    const w1 = createWidget('line-chart')
    const w2 = createWidget('line-chart')
    w1.raw.data.dciList.push({ nodeId: 1 })
    expect(w2.raw.data.dciList).toHaveLength(0)
  })

  it('generates a unique id on each call', () => {
    const ids = new Set(Array.from({ length: 10 }, () => createWidget('label').id))
    expect(ids.size).toBe(10)
  })

  it('throws for unknown widget type', () => {
    expect(() => createWidget('nonexistent')).toThrow()
  })

  it('works for every registered type key', () => {
    for (const key of Object.keys(ELEMENT_TYPE_BY_KEY)) {
      expect(() => createWidget(key)).not.toThrow()
    }
  })
})

describe('chart legend configuration', () => {
  // ChartConfiguration.java: POSITION_LEFT 1, RIGHT 2, TOP 4, BOTTOM 8.
  const POSITION_INTS = { left: 1, right: 2, top: 4, bottom: 8 }

  // Every element type whose legacy config extends AbstractChartConfig.
  const CHART_KEYS = [
    'line-chart',
    'bar-chart',
    'pie-chart',
    'tube-chart',
    'scripted-bar-chart',
    'scripted-pie-chart',
  ]

  it.each(CHART_KEYS)('reads the legend position of a %s', (key) => {
    const def = ELEMENT_TYPE_BY_KEY[key]

    for (const [name, int] of Object.entries(POSITION_INTS)) {
      expect(def.fromApi({ legendPosition: int }).legendPosition).toBe(name)
    }
    // Absent, or an int no position maps to, reads as the legacy default.
    expect(def.fromApi({}).legendPosition).toBe('bottom')
    expect(def.fromApi({ legendPosition: 99 }).legendPosition).toBe('bottom')
  })

  it.each(CHART_KEYS)('writes the legend triple of a %s back as the legacy ints', (key) => {
    const def = ELEMENT_TYPE_BY_KEY[key]
    const config = { ...def.fromApi({}), legendPosition: 'right', extendedLegend: true }

    expect(def.toApi(config, {})).toMatchObject({
      legendPosition: 2,
      extendedLegend: true,
      showLegend: true,
    })
  })

  // BarChartConfig.java and ScriptedBarChartConfig.java default showPercentInLegend to true;
  // the pie configs do not declare it.
  it.each(['bar-chart', 'tube-chart', 'scripted-bar-chart'])(
    'defaults showPercentInLegend on for a %s',
    (key) => {
      const def = ELEMENT_TYPE_BY_KEY[key]

      expect(def.fromApi({}).showPercentInLegend).toBe(true)
      expect(def.fromApi({ showPercentInLegend: 'false' }).showPercentInLegend).toBe(false)
      expect(def.toApi(def.fromApi({ showPercentInLegend: false }), {})).toMatchObject({
        showPercentInLegend: false,
      })
    },
  )
})

describe('status map elements', () => {
  // Legacy StatusMapConfig.java has no layout field: showRadial draws the radial map and wins,
  // otherwise groupObjects picks grouped over flat (StatusMapElement.java).
  const def = ELEMENT_TYPE_BY_KEY['status-map']

  it.each([
    [{}, 'flat'],
    [{ groupObjects: true }, 'grouped'],
    [{ groupObjects: 'true' }, 'grouped'],
    [{ showRadial: true, groupObjects: true }, 'sunburst'],
  ])('reads the layout of a legacy-authored map from its flags: %j', (data, displayMode) => {
    expect(def.fromApi(data).displayMode).toBe(displayMode)
  })

  it('prefers its own layout field over the legacy flags', () => {
    expect(def.fromApi({ displayMode: 'honeycomb', groupObjects: true }).displayMode).toBe(
      'honeycomb',
    )
  })

  it('falls back to the legacy flags for an unknown layout', () => {
    expect(def.fromApi({ displayMode: 'bogus', showRadial: true }).displayMode).toBe('sunburst')
  })

  it('sorts by status unless told otherwise', () => {
    expect(def.fromApi({}).sortBy).toBe('status')
    expect(def.fromApi({ sortBy: 'name' }).sortBy).toBe('name')
    expect(def.fromApi({ sortBy: 'bogus' }).sortBy).toBe('status')
  })

  it.each([
    ['flat', { groupObjects: false, showRadial: false }],
    ['grouped', { groupObjects: true, showRadial: false }],
    ['sunburst', { groupObjects: false, showRadial: true }],
    ['honeycomb', { groupObjects: false, showRadial: false }],
    ['treemap', { groupObjects: false, showRadial: true }],
  ])('writes %s with the closest legacy flags', (displayMode, flags) => {
    const config = { ...def.fromApi({}), displayMode, sortBy: 'name' }
    expect(def.toApi(config, {})).toMatchObject({ displayMode, sortBy: 'name', ...flags })
  })

  it('keeps legacy fields the console does not edit', () => {
    const widget = {
      id: 'w',
      type: 'status-map',
      config: def.fromApi({ objectId: 5, severityFilter: 24 }),
      raw: { data: { objectId: 5, severityFilter: 24 }, layout: {} },
    }
    const next = updateWidgetConfig(widget, {
      config: { ...widget.config, displayMode: 'grouped' },
    })
    expect(next.raw.data).toMatchObject({ severityFilter: 24, groupObjects: true })
  })
})

describe('service components elements', () => {
  const def = ELEMENT_TYPE_BY_KEY['service-components']

  it('round-trips the sort order', () => {
    expect(def.fromApi({}).sortBy).toBe('status')
    expect(def.toApi({ ...def.fromApi({}), sortBy: 'name' }, {})).toMatchObject({
      sortBy: 'name',
    })
  })
})

describe('monitor elements', () => {
  // Legacy EventMonitorConfig.java stores event codes as a comma-separated string and parses it
  // leniently.
  const def = ELEMENT_TYPE_BY_KEY['event-monitor']

  it('round-trips the text filter', () => {
    const config = def.fromApi({ filter: 'link down' })
    expect(config.filter).toBe('link down')
    expect(def.toApi(config, {})).toMatchObject({ filter: 'link down' })
  })

  it('splits the event code string into numbers and writes it back', () => {
    const config = def.fromApi({ eventCodes: '29,30' })
    expect(config.eventCodes).toEqual([29, 30])
    expect(def.toApi(config, {})).toMatchObject({ eventCodes: '29,30' })
  })

  it('treats an empty or missing code list as no filter', () => {
    expect(def.fromApi({}).eventCodes).toEqual([])
    expect(def.fromApi({ eventCodes: '' }).eventCodes).toEqual([])
    expect(def.toApi(def.fromApi({}), {})).toMatchObject({ eventCodes: '' })
  })

  it('skips blank and non-numeric entries, as the legacy parser does', () => {
    expect(def.fromApi({ eventCodes: ' 29 , ,abc, 30 ' }).eventCodes).toEqual([29, 30])
  })

  it('accepts a single code sent as a number', () => {
    expect(def.fromApi({ eventCodes: 29 }).eventCodes).toEqual([29])
  })

  it('carries the seed size and window through', () => {
    const config = def.fromApi({ maxEvents: 250, timeRangeMinutes: 15 })
    expect(config).toMatchObject({ maxEvents: 250, timeRangeMinutes: 15 })
    expect(def.toApi(config, {})).toMatchObject({ maxEvents: 250, timeRangeMinutes: 15 })
    // Legacy defaults, applied when the element omits them.
    expect(def.fromApi({})).toMatchObject({ maxEvents: 100, timeRangeMinutes: 60 })
  })

  it.each(['syslog-monitor', 'snmp-trap-monitor', 'event-monitor'])(
    '%s is backend-ready',
    (key) => {
      expect(ELEMENT_TYPE_BY_KEY[key].backendReady).toBe(true)
    },
  )
})

// GET /v1/objects/{id}/data-collection/{dci-id}/table-value serves all of these.
describe('table DCI elements', () => {
  it.each(['table-value', 'table-bar-chart', 'table-pie-chart', 'table-tube-chart'])(
    '%s is backend-ready',
    (key) => {
      expect(ELEMENT_TYPE_BY_KEY[key].backendReady).toBe(true)
    },
  )

  it('round-trips a table chart config', () => {
    const def = ELEMENT_TYPE_BY_KEY['table-bar-chart']
    const raw = {
      nodeId: 730,
      dciId: 88,
      instanceColumn: 'IFNAME',
      dataColumn: 'BYTES',
      ignoreZeroValues: 'true',
      sortOnDataColumn: 'true',
      sortDescending: 'false',
    }
    const config = def.fromApi(raw)
    expect(config).toMatchObject({
      nodeId: 730,
      dciId: 88,
      instanceColumn: 'IFNAME',
      dataColumn: 'BYTES',
      ignoreZeroValues: true,
      sortOnDataColumn: true,
      sortDescending: false,
    })
    expect(def.toApi(config, raw)).toMatchObject(config)
  })

  // The legacy client writes these; dropping them on save would reorder its charts.
  it('preserves legacy sort settings the UI does not default to', () => {
    const def = ELEMENT_TYPE_BY_KEY['table-pie-chart']
    expect(def.fromApi({})).toMatchObject({ sortOnDataColumn: false, sortDescending: false })
    expect(def.toApi(def.fromApi({ sortOnDataColumn: true }), {})).toMatchObject({
      sortOnDataColumn: true,
    })
  })

  it('round-trips a table value config', () => {
    const def = ELEMENT_TYPE_BY_KEY['table-value']
    const config = def.fromApi({ objectId: 730, dciId: 88, refreshRate: 60 })
    expect(config).toMatchObject({ objectId: 730, dciId: 88, refreshRate: 60 })
    expect(def.toApi(config, {})).toMatchObject({ objectId: 730, dciId: 88, refreshRate: 60 })
  })
})

describe('ELEMENT_TYPES registry', () => {
  it('has unique keys across all int types', () => {
    const keys = Object.values(ELEMENT_TYPES).map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every entry has the required metadata and adapters', () => {
    for (const [apiType, def] of Object.entries(ELEMENT_TYPES)) {
      expect(def.key, `type ${apiType}`).toBeTruthy()
      expect(def.label, `type ${apiType}`).toBeTruthy()
      expect(def.icon, `type ${apiType}`).toMatch(/^pi /)
      expect(def.color, `type ${apiType}`).toMatch(/^#/)
      expect(def.defaultSize?.w, `type ${apiType}`).toBeGreaterThan(0)
      expect(typeof def.fromApi, `type ${apiType}`).toBe('function')
      expect(typeof def.toApi, `type ${apiType}`).toBe('function')
      // fromApi must tolerate empty data
      expect(() => def.fromApi({})).not.toThrow()
      // toApi must tolerate the config produced from empty data
      expect(() => def.toApi(def.fromApi({}), {})).not.toThrow()
    }
  })
})
