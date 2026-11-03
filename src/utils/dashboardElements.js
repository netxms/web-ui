/**
 * Dashboard element types 0-34 (legacy `DashboardElement.java`; 9 is the retired CUSTOM one).
 * toApi writes edited fields over the original data so unedited fields survive a round trip.
 * Components bind in widgetRegistry.js, keeping this module free of component imports.
 */

import { parseConfigColor, toApiColor } from '@/utils/colorUtils'
import { isTemplateDci } from '@/utils/templateDci'

function coerceBool(value, fallback) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

function coerceNum(value, fallback) {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

/** Legend position ints from ChartConfiguration.java. */
const LEGEND_POSITIONS = { 1: 'left', 2: 'right', 4: 'top', 8: 'bottom' }
const LEGEND_POSITION_INTS = { left: 1, right: 2, top: 4, bottom: 8 }

function baseFromApi(data) {
  return {
    title: data.title ?? '',
    titleForeground: parseConfigColor(data.titleForeground),
    titleBackground: parseConfigColor(data.titleBackground),
  }
}

function baseToApi(config) {
  return {
    title: config.title ?? '',
    titleForeground: toApiColor(config.titleForeground),
    titleBackground: toApiColor(config.titleBackground),
  }
}

/**
 * A template entry's `name` stays as written: empty means "the matched DCI's description", and
 * in regex mode it may hold `\1` capture references. Only concrete entries fall back.
 */
function dciListFromApi(data) {
  if (!Array.isArray(data.dciList)) return []
  return data.dciList.map((d) => {
    const nodeId = coerceNum(d.nodeId, 0)
    return {
      nodeId,
      dciId: coerceNum(d.dciId, 0),
      name: isTemplateDci({ nodeId })
        ? (d.name ?? '')
        : d.name || d.dciDescription || d.dciName || '',
      color: parseConfigColor(d.color),
      lineChartType: coerceNum(d.lineChartType, -1), // -1 default, 0 line, 1 area
      invertValues: coerceBool(d.invertValues, false),
      useRawValues: coerceBool(d.useRawValues, false),
      displayFormat: d.displayFormat || '',
      dciName: d.dciName ?? '',
      dciDescription: d.dciDescription ?? '',
      dciTag: d.dciTag ?? '',
      regexMatch: coerceBool(d.regexMatch, false),
      multiMatch: coerceBool(d.multiMatch, false),
      // ChartDciConfig.type: 1 item, 2 table; a table entry plots the column/instance cell.
      type: coerceNum(d.type, 1),
      column: d.column ?? '',
      instance: d.instance ?? '',
    }
  })
}

function dciListToApi(list, originalList) {
  const orig = Array.isArray(originalList) ? originalList : []
  return (list ?? []).map((d, i) => ({
    ...orig[i],
    nodeId: d.nodeId,
    dciId: d.dciId,
    name: d.name ?? '',
    color: d.color ? toApiColor(d.color) : 'auto',
    lineChartType: d.lineChartType ?? -1,
    invertValues: d.invertValues === true,
    useRawValues: d.useRawValues === true,
    displayFormat: d.displayFormat || '',
    dciName: d.dciName ?? '',
    dciDescription: d.dciDescription ?? '',
    dciTag: d.dciTag ?? '',
    regexMatch: d.regexMatch === true,
    multiMatch: d.multiMatch === true,
    type: d.type ?? 1,
    column: d.column ?? '',
    instance: d.instance ?? '',
  }))
}

function legendFromApi(data) {
  return {
    showLegend: coerceBool(data.showLegend, true),
    extendedLegend: coerceBool(data.extendedLegend, false),
    legendPosition: LEGEND_POSITIONS[coerceNum(data.legendPosition, 8)] ?? 'bottom',
  }
}

function legendToApi(config) {
  return {
    showLegend: config.showLegend !== false,
    extendedLegend: config.extendedLegend === true,
    legendPosition: LEGEND_POSITION_INTS[config.legendPosition] ?? 8,
  }
}

/** Legacy AbstractChartConfig fields. */
function chartFromApi(data) {
  return {
    ...baseFromApi(data),
    ...legendFromApi(data),
    dciList: dciListFromApi(data),
    autoScale: coerceBool(data.autoScale, true),
    minYScaleValue: data.minYScaleValue != null ? coerceNum(data.minYScaleValue, null) : null,
    maxYScaleValue: data.maxYScaleValue != null ? coerceNum(data.maxYScaleValue, null) : null,
    yAxisLabel: data.yAxisLabel ?? '',
    refreshRate: coerceNum(data.refreshRate, 30),
    drillDownObjectId: coerceNum(data.drillDownObjectId, 0),
  }
}

function chartToApi(config, originalData) {
  return {
    ...baseToApi(config),
    ...legendToApi(config),
    dciList: dciListToApi(config.dciList, originalData?.dciList),
    autoScale: config.autoScale !== false,
    minYScaleValue: config.minYScaleValue,
    maxYScaleValue: config.maxYScaleValue,
    yAxisLabel: config.yAxisLabel ?? '',
    refreshRate: config.refreshRate ?? 30,
    drillDownObjectId: config.drillDownObjectId ?? 0,
  }
}

/** Legacy Gson writes the enum name; older data has the int. Read both, write the name. */
const RACK_VIEW_BY_NAME = { FULL: 0, FRONT: 1, BACK: 2 }
const RACK_VIEW_NAMES = ['FULL', 'FRONT', 'BACK']

/** Null when all bits are set ("no filter"). */
function bitmaskToArray(value, bitCount) {
  const mask = (1 << bitCount) - 1
  const v = parseInt(value, 10)
  if (Number.isNaN(v) || (v & mask) === mask) return null
  return Array.from({ length: bitCount }, (_, i) => i).filter((i) => (v >> i) & 1)
}

function arrayToBitmask(arr, bitCount) {
  const mask = (1 << bitCount) - 1
  if (!arr?.length) return mask
  return arr.reduce((acc, i) => acc | (1 << i), 0)
}

/** Legacy GaugeConfig fields. */
const GAUGE_DEFAULT_DATA = {
  gaugeType: 0,
  minValue: 0,
  maxValue: 100,
  leftYellowZone: 0,
  leftRedZone: 0,
  rightYellowZone: 70,
  rightRedZone: 90,
}

function gaugeFromApi(data) {
  return {
    gaugeType: coerceNum(data.gaugeType, 0), // 0 dial, 1 bar, 2 text
    minValue: coerceNum(data.minValue, 0),
    maxValue: coerceNum(data.maxValue, 100),
    leftYellowZone: coerceNum(data.leftYellowZone, 0),
    leftRedZone: coerceNum(data.leftRedZone, 0),
    rightYellowZone: coerceNum(data.rightYellowZone, 70),
    rightRedZone: coerceNum(data.rightRedZone, 90),
  }
}

function gaugeToApi(config) {
  return {
    gaugeType: config.gaugeType ?? 0,
    minValue: config.minValue ?? 0,
    maxValue: config.maxValue ?? 100,
    leftYellowZone: config.leftYellowZone ?? 0,
    leftRedZone: config.leftRedZone ?? 0,
    rightYellowZone: config.rightYellowZone ?? 70,
    rightRedZone: config.rightRedZone ?? 90,
  }
}

/**
 * Keyed by API element type.
 *   color, variant — DashboardThumbnail wireframe
 *   defaultData — API-shape data for new widgets
 *   toApi(config, original) — fields merged over the original data
 *   backendReady — false when the WebAPI endpoint does not exist yet
 *   inline — no card chrome
 */
export const ELEMENT_TYPES = {
  0: {
    key: 'label',
    label: 'Label',
    icon: 'pi pi-align-center',
    color: '#94a3b8',
    variant: 'plain',
    group: 'Layout',
    defaultSize: { w: 4, h: 1 },
    defaultData: { title: 'Label' },
    inline: true,
    backendReady: true,
    fromApi: (data) => ({
      // Legacy labels keep their text in `title`.
      text: data.title ?? data.text ?? '',
      foreground: parseConfigColor(data.foreground),
      background: parseConfigColor(data.background),
      align: data.align ?? 'center',
      fontSize: data.fontSize ?? 'md',
    }),
    toApi: (config) => ({
      title: config.text ?? '',
      foreground: toApiColor(config.foreground),
      background: toApiColor(config.background),
      align: config.align ?? 'center',
      fontSize: config.fontSize ?? 'md',
    }),
  },

  1: {
    key: 'line-chart',
    label: 'Line Chart',
    icon: 'pi pi-chart-line',
    color: '#22c55e',
    variant: 'zigzag',
    group: 'Charts',
    defaultSize: { w: 4, h: 3 },
    defaultData: { title: '', dciList: [], refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...chartFromApi(data),
      timeUnits: coerceNum(data.timeUnits, 1), // 0 min, 1 hour, 2 day
      timeRange: coerceNum(data.timeRange, 1),
      stacked: coerceBool(data.stacked, false),
      area: coerceBool(data.area, false),
      showGrid: coerceBool(data.showGrid, true),
      logScaleEnabled: coerceBool(data.logScaleEnabled, false),
      useMultipliers: coerceBool(data.useMultipliers, true),
    }),
    toApi: (config, original) => ({
      ...chartToApi(config, original),
      timeUnits: config.timeUnits ?? 1,
      timeRange: config.timeRange ?? 1,
      stacked: config.stacked === true,
      area: config.area === true,
      showGrid: config.showGrid !== false,
      logScaleEnabled: config.logScaleEnabled === true,
      useMultipliers: config.useMultipliers !== false,
    }),
  },

  2: {
    key: 'bar-chart',
    label: 'Bar Chart',
    icon: 'pi pi-chart-bar',
    color: '#8b5cf6',
    variant: 'bars',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', dciList: [], refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...chartFromApi(data),
      transposed: coerceBool(data.transposed, false),
      showPercentInLegend: coerceBool(data.showPercentInLegend, true),
    }),
    toApi: (config, original) => ({
      ...chartToApi(config, original),
      transposed: config.transposed === true,
      showPercentInLegend: config.showPercentInLegend !== false,
    }),
  },

  3: {
    key: 'pie-chart',
    label: 'Pie Chart',
    icon: 'pi pi-chart-pie',
    color: '#06b6d4',
    variant: 'ring',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', dciList: [], refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...chartFromApi(data),
      doughnutRendering: coerceBool(data.doughnutRendering, false),
      showTotal: coerceBool(data.showTotal, false),
    }),
    toApi: (config, original) => ({
      ...chartToApi(config, original),
      doughnutRendering: config.doughnutRendering === true,
      showTotal: config.showTotal === true,
    }),
  },

  4: {
    key: 'tube-chart',
    label: 'Tube Chart',
    icon: 'pi pi-chart-bar',
    color: '#8b5cf6',
    variant: 'bars',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', dciList: [], refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...chartFromApi(data),
      transposed: coerceBool(data.transposed, false),
      showPercentInLegend: coerceBool(data.showPercentInLegend, true),
    }),
    toApi: (config, original) => ({
      ...chartToApi(config, original),
      transposed: config.transposed === true,
      showPercentInLegend: config.showPercentInLegend !== false,
    }),
  },

  5: {
    key: 'status-chart',
    label: 'Status Chart',
    icon: 'pi pi-chart-bar',
    color: '#eab308',
    variant: 'bars',
    group: 'Status',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', rootObject: 0 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.rootObject, 0) || null,
      objectName: data.objectName ?? '',
      transposed: coerceBool(data.transposed, false),
      showLegend: coerceBool(data.showLegend, true),
      refreshRate: coerceNum(data.refreshRate, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      rootObject: config.objectId ?? 0,
      objectName: config.objectName ?? '',
      transposed: config.transposed === true,
      showLegend: config.showLegend !== false,
      refreshRate: config.refreshRate ?? 30,
    }),
  },

  6: {
    key: 'status-indicator',
    label: 'Status Indicator',
    icon: 'pi pi-circle-fill',
    color: '#eab308',
    variant: 'dot',
    group: 'Status',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', elements: [], numColumns: 1 },
    backendReady: true,
    fromApi: (data) => {
      let elements = Array.isArray(data.elements)
        ? data.elements.map((e) => ({
            type: coerceNum(e.type, 0), // 0 object, 1 dci, 2 dci template, 3 script
            label: e.label ?? '',
            objectId: coerceNum(e.objectId, 0),
            dciId: coerceNum(e.dciId, 0),
            drillDownObjectId: coerceNum(e.drillDownObjectId, 0),
          }))
        : []
      // Legacy single-object form.
      if (!elements.length && coerceNum(data.objectId, 0)) {
        elements = [
          {
            type: 0,
            label: data.objectName ?? '',
            objectId: coerceNum(data.objectId, 0),
            dciId: 0,
            drillDownObjectId: 0,
          },
        ]
      }
      return {
        ...baseFromApi(data),
        elements,
        numColumns: coerceNum(data.numColumns, 1),
        shape: coerceNum(data.shape, 0), // 0 circle, 1 rectangle, 2 rounded rectangle
        labelType: coerceNum(data.labelType, 2), // 0 none, 1 inside, 2 outside
        fullColorRange: coerceBool(data.fullColorRange, false),
      }
    },
    toApi: (config, original) => ({
      ...baseToApi(config),
      elements: (config.elements ?? []).map((e, i) => ({
        ...(Array.isArray(original?.elements) ? original.elements[i] : undefined),
        type: e.type ?? 0,
        label: e.label ?? '',
        objectId: e.objectId ?? 0,
        dciId: e.dciId ?? 0,
        drillDownObjectId: e.drillDownObjectId ?? 0,
      })),
      numColumns: config.numColumns ?? 1,
      shape: config.shape ?? 0,
      labelType: config.labelType ?? 2,
      fullColorRange: config.fullColorRange === true,
    }),
  },

  7: {
    key: 'embedded-dashboard',
    label: 'Embedded Dashboard',
    icon: 'pi pi-objects-column',
    color: '#3b82f6',
    variant: 'grid',
    group: 'Other',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', dashboardObjects: [], displayInterval: 60 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      dashboardObjects: Array.isArray(data.dashboardObjects) ? [...data.dashboardObjects] : [],
      displayInterval: coerceNum(data.displayInterval, 60),
      contextObjectId: coerceNum(data.contextObjectId, 0),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      dashboardObjects: config.dashboardObjects ?? [],
      displayInterval: config.displayInterval ?? 60,
      contextObjectId: config.contextObjectId ?? 0,
    }),
  },

  8: {
    key: 'network-map',
    label: 'Network Map',
    icon: 'pi pi-map',
    color: '#3b82f6',
    variant: 'plain',
    group: 'Maps',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      mapId: coerceNum(data.objectId, 0) || coerceNum(data.mapId, 0) || null,
      mapName: data.mapName ?? '',
      zoomLevel: coerceNum(data.zoomLevel, 100),
      hideLinkLabelsEnabled: coerceBool(data.hideLinkLabelsEnabled, false),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      objectId: config.mapId ?? 0,
      mapName: config.mapName ?? '',
      zoomLevel: config.zoomLevel ?? 100,
      hideLinkLabelsEnabled: config.hideLinkLabelsEnabled === true,
    }),
  },

  10: {
    key: 'geo-map',
    label: 'Geo Map',
    icon: 'pi pi-map-marker',
    color: '#3b82f6',
    variant: 'plain',
    group: 'Maps',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', latitude: 0, longitude: 0, zoom: 4, rootObjectId: 0 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      latitude: coerceNum(data.latitude, 0),
      longitude: coerceNum(data.longitude, 0),
      zoom: coerceNum(data.zoom, 4),
      rootObjectId: coerceNum(data.rootObjectId, 0) || null,
      rootObjectName: data.rootObjectName ?? '',
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      latitude: config.latitude ?? 0,
      longitude: config.longitude ?? 0,
      zoom: config.zoom ?? 4,
      rootObjectId: config.rootObjectId ?? 0,
      rootObjectName: config.rootObjectName ?? '',
    }),
  },

  11: {
    key: 'alarm-viewer',
    label: 'Alarm Viewer',
    icon: 'pi pi-bell',
    color: '#f97316',
    variant: 'lines',
    group: 'Status',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: 'Alarms', objectId: 0, severityFilter: 31, stateFilter: 15 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.objectId, 0) || null,
      objectName: data.objectName ?? '',
      // severity bits 0-4 = Normal..Critical (31 = all); state bits 0-3 (15 = all)
      severities: bitmaskToArray(data.severityFilter, 5),
      alarmStates: bitmaskToArray(data.stateFilter, 4),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      objectId: config.objectId ?? 0,
      objectName: config.objectName ?? '',
      severityFilter: arrayToBitmask(config.severities, 5),
      stateFilter: arrayToBitmask(config.alarmStates, 4),
    }),
  },

  12: {
    key: 'availability-chart',
    label: 'Availability Chart',
    icon: 'pi pi-check-circle',
    color: '#22c55e',
    variant: 'ring',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', objectId: 0, period: 0, numberOfDays: 30 },
    // Not `chartFromApi`: AvailabilityChartConfig has no dciList, Y scale or refreshRate.
    fromApi: (data) => ({
      ...baseFromApi(data),
      ...legendFromApi(data),
      objectId: coerceNum(data.objectId, 0) || null,
      objectName: data.objectName ?? '',
      period: coerceNum(data.period, 0),
      numberOfDays: coerceNum(data.numberOfDays, 30),
      doughnutRendering: coerceBool(data.doughnutRendering, false),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      ...legendToApi(config),
      objectId: config.objectId ?? 0,
      objectName: config.objectName ?? '',
      period: config.period ?? 0,
      numberOfDays: config.numberOfDays ?? 30,
      doughnutRendering: config.doughnutRendering === true,
    }),
  },

  13: {
    key: 'gauge-chart',
    label: 'Gauge',
    icon: 'pi pi-gauge',
    color: '#22c55e',
    variant: 'gauge',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', dciList: [], ...GAUGE_DEFAULT_DATA, refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({ ...chartFromApi(data), ...gaugeFromApi(data) }),
    toApi: (config, original) => ({ ...chartToApi(config, original), ...gaugeToApi(config) }),
  },

  14: {
    key: 'web-page',
    label: 'Web Page',
    icon: 'pi pi-globe',
    color: '#64748b',
    variant: 'plain',
    group: 'Other',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', url: '' },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      url: data.url ?? '',
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      url: config.url ?? '',
    }),
  },

  15: {
    key: 'table-bar-chart',
    label: 'Table Bar Chart',
    icon: 'pi pi-chart-bar',
    color: '#8b5cf6',
    variant: 'bars',
    group: 'Tables',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '' },
    backendReady: true,
    fromApi: tableChartFromApi,
    toApi: tableChartToApi,
  },

  16: {
    key: 'table-pie-chart',
    label: 'Table Pie Chart',
    icon: 'pi pi-chart-pie',
    color: '#06b6d4',
    variant: 'ring',
    group: 'Tables',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '' },
    backendReady: true,
    fromApi: tableChartFromApi,
    toApi: tableChartToApi,
  },

  17: {
    key: 'table-tube-chart',
    label: 'Table Tube Chart',
    icon: 'pi pi-chart-bar',
    color: '#8b5cf6',
    variant: 'bars',
    group: 'Tables',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '' },
    backendReady: true,
    fromApi: tableChartFromApi,
    toApi: tableChartToApi,
  },

  18: {
    key: 'separator',
    label: 'Separator',
    icon: 'pi pi-minus',
    color: '#cbd5e1',
    variant: 'plain',
    group: 'Layout',
    defaultSize: { w: 12, h: 1 },
    defaultData: { lineWidth: 2 },
    inline: true,
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      lineWidth: coerceNum(data.lineWidth, 2),
      topMargin: coerceNum(data.topMargin, 0),
      bottomMargin: coerceNum(data.bottomMargin, 0),
      leftMargin: coerceNum(data.leftMargin, 0),
      rightMargin: coerceNum(data.rightMargin, 0),
      foreground: parseConfigColor(data.foreground),
      background: parseConfigColor(data.background),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      lineWidth: config.lineWidth ?? 2,
      topMargin: config.topMargin ?? 0,
      bottomMargin: config.bottomMargin ?? 0,
      leftMargin: config.leftMargin ?? 0,
      rightMargin: config.rightMargin ?? 0,
      foreground: toApiColor(config.foreground),
      background: toApiColor(config.background),
    }),
  },

  19: {
    key: 'table-value',
    label: 'Table Value',
    icon: 'pi pi-table',
    color: '#64748b',
    variant: 'grid',
    group: 'Tables',
    defaultSize: { w: 6, h: 3 },
    defaultData: { title: '', objectId: 0, dciId: 0, refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.objectId, 0) || null,
      objectName: data.objectName ?? '',
      dciId: coerceNum(data.dciId, 0) || null,
      // How a context-bound element finds its table DCI; read-only, so saves keep it as is.
      templateConfig: data.templateConfig ?? null,
      refreshRate: coerceNum(data.refreshRate, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      objectId: config.objectId ?? 0,
      objectName: config.objectName ?? '',
      dciId: config.dciId ?? 0,
      refreshRate: config.refreshRate ?? 30,
    }),
  },

  20: {
    key: 'status-map',
    label: 'Status Map',
    icon: 'pi pi-th-large',
    color: '#eab308',
    variant: 'grid',
    group: 'Status',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0 },
    backendReady: true,
    fromApi: statusMapFromApi,
    toApi: statusMapToApi,
  },

  21: {
    key: 'dci-summary-table',
    label: 'DCI Summary Table',
    icon: 'pi pi-table',
    color: '#64748b',
    variant: 'grid',
    group: 'Tables',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', baseObjectId: 0, tableId: 0, refreshInterval: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      baseObjectId: coerceNum(data.baseObjectId, 0) || null,
      baseObjectName: data.baseObjectName ?? '',
      tableId: coerceNum(data.tableId, 0) || null,
      refreshInterval: coerceNum(data.refreshInterval, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      baseObjectId: config.baseObjectId ?? 0,
      baseObjectName: config.baseObjectName ?? '',
      tableId: config.tableId ?? 0,
      refreshInterval: config.refreshInterval ?? 30,
    }),
  },

  22: {
    key: 'syslog-monitor',
    label: 'Syslog Monitor',
    icon: 'pi pi-list',
    color: '#64748b',
    variant: 'lines',
    group: 'Monitors',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0 },
    backendReady: true,
    fromApi: monitorFromApi,
    toApi: monitorToApi,
  },

  23: {
    key: 'snmp-trap-monitor',
    label: 'SNMP Trap Monitor',
    icon: 'pi pi-list',
    color: '#64748b',
    variant: 'lines',
    group: 'Monitors',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0 },
    backendReady: true,
    fromApi: monitorFromApi,
    toApi: monitorToApi,
  },

  24: {
    key: 'event-monitor',
    label: 'Event Monitor',
    icon: 'pi pi-list',
    color: '#64748b',
    variant: 'lines',
    group: 'Monitors',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0, filter: '', eventCodes: '' },
    backendReady: true,
    fromApi: (data) => ({
      ...monitorFromApi(data),
      filter: data.filter ?? '',
      eventCodes: eventCodesFromApi(data.eventCodes),
      maxEvents: coerceNum(data.maxEvents, 100),
      timeRangeMinutes: coerceNum(data.timeRangeMinutes, 60),
    }),
    toApi: (config) => ({
      ...monitorToApi(config),
      filter: config.filter ?? '',
      eventCodes: eventCodesToApi(config.eventCodes),
      maxEvents: config.maxEvents ?? 100,
      timeRangeMinutes: config.timeRangeMinutes ?? 60,
    }),
  },

  25: {
    key: 'service-components',
    label: 'Service Components',
    icon: 'pi pi-sitemap',
    color: '#3b82f6',
    variant: 'grid',
    group: 'Maps',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0 },
    backendReady: true,
    // Drawn as a flat status map, so it shares that map's console-only tile order.
    fromApi: (data) => ({ ...monitorFromApi(data), sortBy: statusMapSortFromApi(data.sortBy) }),
    toApi: (config) => ({ ...monitorToApi(config), sortBy: statusMapSortFromApi(config.sortBy) }),
  },

  26: {
    key: 'rack-diagram',
    label: 'Rack Diagram',
    icon: 'pi pi-server',
    color: '#64748b',
    variant: 'grid',
    group: 'Other',
    defaultSize: { w: 3, h: 5 },
    defaultData: { title: '', objectId: 0, view: 0 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.objectId, 0) || null,
      objectName: data.objectName ?? '',
      view: RACK_VIEW_BY_NAME[data.view] ?? coerceNum(data.view, 0),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      objectId: config.objectId ?? 0,
      objectName: config.objectName ?? '',
      view: RACK_VIEW_NAMES[config.view] ?? 'FULL',
    }),
  },

  27: {
    key: 'object-tools',
    label: 'Object Tools',
    icon: 'pi pi-wrench',
    color: '#64748b',
    variant: 'grid',
    group: 'Other',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', tools: [], numColumns: 1 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      tools: Array.isArray(data.tools) ? [...data.tools] : [],
      numColumns: coerceNum(data.numColumns, 1),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      tools: config.tools ?? [],
      numColumns: config.numColumns ?? 1,
    }),
  },

  28: {
    key: 'object-query',
    label: 'Object Query',
    icon: 'pi pi-search',
    color: '#64748b',
    variant: 'lines',
    group: 'Tables',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', query: '', rootObjectId: 0, refreshRate: 60, recordLimit: 0 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      query: data.query ?? '',
      rootObjectId: coerceNum(data.rootObjectId, 0) || null,
      rootObjectName: data.rootObjectName ?? '',
      refreshRate: coerceNum(data.refreshRate, 60),
      recordLimit: coerceNum(data.recordLimit, 0),
      properties: Array.isArray(data.properties)
        ? data.properties.map((p) => ({ name: p.name ?? '', displayName: p.displayName ?? '' }))
        : [],
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      query: config.query ?? '',
      rootObjectId: config.rootObjectId ?? 0,
      rootObjectName: config.rootObjectName ?? '',
      refreshRate: config.refreshRate ?? 60,
      recordLimit: config.recordLimit ?? 0,
      properties: (config.properties ?? []).map((p) => ({
        name: p.name ?? '',
        displayName: p.displayName ?? '',
        type: 0,
      })),
    }),
  },

  29: {
    key: 'port-view',
    label: 'Port View',
    icon: 'pi pi-sitemap',
    color: '#64748b',
    variant: 'grid',
    group: 'Other',
    defaultSize: { w: 6, h: 3 },
    defaultData: { title: '', rootObjectId: 0 },
    backendReady: true,
    // Legacy PortViewConfig uses "rootObjectId", not "objectId".
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.rootObjectId, 0) || null,
      objectName: data.objectName ?? '',
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      rootObjectId: config.objectId ?? 0,
      objectName: config.objectName ?? '',
    }),
  },

  30: {
    key: 'scripted-bar-chart',
    label: 'Scripted Bar Chart',
    icon: 'pi pi-chart-bar',
    color: '#8b5cf6',
    variant: 'bars',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', script: '', objectId: 0, refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      script: data.script ?? '',
      objectId: coerceNum(data.objectId, 0),
      transposed: coerceBool(data.transposed, false),
      showPercentInLegend: coerceBool(data.showPercentInLegend, true),
      ...legendFromApi(data),
      refreshRate: coerceNum(data.refreshRate, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      script: config.script ?? '',
      objectId: config.objectId ?? 0,
      transposed: config.transposed === true,
      showPercentInLegend: config.showPercentInLegend !== false,
      ...legendToApi(config),
      refreshRate: config.refreshRate ?? 30,
    }),
  },

  31: {
    key: 'scripted-pie-chart',
    label: 'Scripted Pie Chart',
    icon: 'pi pi-chart-pie',
    color: '#06b6d4',
    variant: 'ring',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', script: '', objectId: 0, refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      script: data.script ?? '',
      objectId: coerceNum(data.objectId, 0),
      doughnutRendering: coerceBool(data.doughnutRendering, true),
      showTotal: coerceBool(data.showTotal, false),
      ...legendFromApi(data),
      refreshRate: coerceNum(data.refreshRate, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      script: config.script ?? '',
      objectId: config.objectId ?? 0,
      doughnutRendering: config.doughnutRendering === true,
      showTotal: config.showTotal === true,
      ...legendToApi(config),
      refreshRate: config.refreshRate ?? 30,
    }),
  },

  32: {
    key: 'file-monitor',
    label: 'File Monitor',
    icon: 'pi pi-file',
    color: '#64748b',
    variant: 'lines',
    group: 'Monitors',
    defaultSize: { w: 6, h: 4 },
    defaultData: { title: '', objectId: 0, fileName: '' },
    backendReady: false,
    fromApi: (data) => ({
      ...monitorFromApi(data),
      fileName: data.fileName ?? '',
      filter: data.filter ?? '',
      historyLimit: coerceNum(data.historyLimit, 1000),
    }),
    toApi: (config, original) => ({
      ...monitorToApi(config, original),
      fileName: config.fileName ?? '',
      filter: config.filter ?? '',
      historyLimit: config.historyLimit ?? 1000,
    }),
  },

  33: {
    key: 'scripted-gauge',
    label: 'Scripted Gauge',
    icon: 'pi pi-gauge',
    color: '#14b8a6',
    variant: 'gauge',
    group: 'Charts',
    defaultSize: { w: 3, h: 2 },
    defaultData: { title: '', script: '', objectId: 0, ...GAUGE_DEFAULT_DATA, refreshRate: 30 },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      ...gaugeFromApi(data),
      script: data.script ?? '',
      objectId: coerceNum(data.objectId, 0),
      refreshRate: coerceNum(data.refreshRate, 30),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      ...gaugeToApi(config),
      script: config.script ?? '',
      objectId: config.objectId ?? 0,
      refreshRate: config.refreshRate ?? 30,
    }),
  },

  // Reads /v1/ai/observations rather than the log legacy queries: same rows, correct `state`.
  34: {
    key: 'ai-observation-monitor',
    label: 'AI Observation Monitor',
    icon: 'pi pi-sparkles',
    color: '#a855f7',
    variant: 'lines',
    group: 'Monitors',
    defaultSize: { w: 6, h: 4 },
    defaultData: {
      title: '',
      objectId: 0,
      instanceId: 0,
      newOnly: true,
      maxRecords: 50,
      refreshInterval: 60,
    },
    backendReady: true,
    fromApi: (data) => ({
      ...baseFromApi(data),
      objectId: coerceNum(data.objectId, 0),
      instanceId: coerceNum(data.instanceId, 0),
      newOnly: coerceBool(data.newOnly, true),
      maxRecords: coerceNum(data.maxRecords, 50),
      refreshInterval: coerceNum(data.refreshInterval, 60),
    }),
    toApi: (config) => ({
      ...baseToApi(config),
      objectId: config.objectId ?? 0,
      instanceId: config.instanceId ?? 0,
      newOnly: config.newOnly !== false,
      maxRecords: config.maxRecords ?? 50,
      refreshInterval: config.refreshInterval ?? 60,
    }),
  },
}

/** TableComparisonChartConfig fields (types 15-17). */
function tableChartFromApi(data) {
  return {
    ...baseFromApi(data),
    nodeId: coerceNum(data.nodeId, 0) || null,
    nodeName: data.nodeName ?? '',
    dciId: coerceNum(data.dciId, 0) || null,
    instanceColumn: data.instanceColumn ?? '',
    dataColumn: data.dataColumn ?? '',
    showLegend: coerceBool(data.showLegend, true),
    refreshRate: coerceNum(data.refreshRate, 30),
    ignoreZeroValues: coerceBool(data.ignoreZeroValues, false),
    // Not editable here; kept so saving does not drop a legacy-authored ordering.
    sortOnDataColumn: coerceBool(data.sortOnDataColumn, false),
    sortDescending: coerceBool(data.sortDescending, false),
  }
}

function tableChartToApi(config) {
  return {
    ...baseToApi(config),
    nodeId: config.nodeId ?? 0,
    nodeName: config.nodeName ?? '',
    dciId: config.dciId ?? 0,
    instanceColumn: config.instanceColumn ?? '',
    dataColumn: config.dataColumn ?? '',
    showLegend: config.showLegend !== false,
    refreshRate: config.refreshRate ?? 30,
    ignoreZeroValues: config.ignoreZeroValues === true,
    sortOnDataColumn: config.sortOnDataColumn === true,
    sortDescending: config.sortDescending === true,
  }
}

function monitorFromApi(data) {
  return {
    ...baseFromApi(data),
    objectId: coerceNum(data.objectId, 0) || null,
    objectName: data.objectName ?? '',
  }
}

function monitorToApi(config) {
  return {
    ...baseToApi(config),
    objectId: config.objectId ?? 0,
    objectName: config.objectName ?? '',
  }
}

/**
 * `displayMode` and `sortBy` are console-only. The legacy client drops them when it re-saves
 * the element, so its `showRadial` (wins) and `groupObjects` flags are written alongside.
 */
const STATUS_MAP_DISPLAY_MODES = new Set(['flat', 'honeycomb', 'grouped', 'sunburst', 'treemap'])

function statusMapSortFromApi(value) {
  return value === 'name' ? 'name' : 'status'
}

function statusMapFromApi(data) {
  let displayMode = data.displayMode
  if (!STATUS_MAP_DISPLAY_MODES.has(displayMode)) {
    if (coerceBool(data.showRadial, false)) displayMode = 'sunburst'
    else displayMode = coerceBool(data.groupObjects, false) ? 'grouped' : 'flat'
  }
  return { ...monitorFromApi(data), displayMode, sortBy: statusMapSortFromApi(data.sortBy) }
}

function statusMapToApi(config) {
  const displayMode = config.displayMode ?? 'flat'
  return {
    ...monitorToApi(config),
    displayMode,
    sortBy: statusMapSortFromApi(config.sortBy),
    // Honeycomb is a flat map to the legacy client, Treemap a hierarchical (radial) one.
    groupObjects: displayMode === 'grouped',
    showRadial: displayMode === 'sunburst' || displayMode === 'treemap',
  }
}

/** Legacy stores event codes as "29,30", skipping blank and non-numeric entries. */
function eventCodesFromApi(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? [value] : []
  if (!value) return []
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(Number)
    .filter((code) => Number.isInteger(code))
}

function eventCodesToApi(codes) {
  return Array.isArray(codes) ? codes.join(',') : ''
}

export const UNKNOWN_TYPE_DEF = {
  key: 'unknown',
  label: 'Unsupported Widget',
  icon: 'pi pi-box',
  color: '#cbd5e1',
  variant: 'plain',
  group: 'Other',
  defaultSize: { w: 2, h: 2 },
  defaultData: {},
  backendReady: true,
  fromApi: baseFromApi,
  toApi: () => ({}), // never write anything over unknown data
}

export const ELEMENT_TYPE_BY_KEY = Object.fromEntries(
  Object.entries(ELEMENT_TYPES).map(([apiType, def]) => [
    def.key,
    { ...def, apiType: Number(apiType) },
  ]),
)

export function getTypeDef(key) {
  return ELEMENT_TYPE_BY_KEY[key] ?? UNKNOWN_TYPE_DEF
}

export function getTypeDefByApi(apiType) {
  return ELEMENT_TYPES[apiType] ?? UNKNOWN_TYPE_DEF
}
