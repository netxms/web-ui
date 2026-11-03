/**
 * Legacy-authored dashboard elements, one per element type (plus one unknown), shaped like the
 * Java client's Gson-serialized XyzConfig classes, including the quirks the adapters must
 * tolerate:
 *   - string booleans ("true"/"false") and numbers-as-strings
 *   - colors as "0xRRGGBB" strings
 *   - enums serialized by name (e.g. rack view "FRONT", map display "ICON")
 *   - fields the new UI does not model (translucent, titleFontSize, ...) that must survive a
 *     read-edit-save round trip verbatim
 *   - vestigial layout keys (horizontalAlignment/verticalAlignment)
 *
 * Fixed GUIDs let a live server test PUT the corpus and compare the GET result exactly.
 */

const guid = (type) => `a0000000-0000-4000-8000-${String(type).padStart(12, '0')}`

/** Legacy ChartDciConfig entry, full field set. */
const legacyDci = (nodeId, dciId, description) => ({
  nodeId,
  dciId,
  dciName: `DCI.${dciId}`,
  dciDescription: description,
  dciTag: '',
  type: 1,
  color: 'auto',
  name: '',
  lineWidth: 2,
  lineChartType: -1,
  displayType: 0,
  showThresholds: false,
  invertValues: 'false',
  useRawValues: 'false',
  multiMatch: false,
  regexMatch: false,
  instance: '',
  column: '',
  displayFormat: '%s',
})

/** AbstractChartConfig fields shared by chart-type configs. */
const abstractChart = () => ({
  dciList: [
    legacyDci(101, 2001, 'CPU usage'),
    { ...legacyDci(101, 2002, 'Memory'), color: '0x00C0FF' },
  ],
  legendPosition: 8,
  showLegend: 'true',
  extendedLegend: false,
  autoScale: true,
  translucent: false, // not modeled by the new UI - must survive verbatim
  refreshRate: '30',
  minYScaleValue: 0,
  maxYScaleValue: 100,
  modifyYBase: false, // not modeled - must survive
  yAxisLabel: null,
  drillDownObjectId: 0,
})

export const LEGACY_ELEMENTS = [
  {
    guid: guid(0),
    type: 0, // LABEL
    data: {
      title: 'Data Center Overview',
      titleForeground: '0xFFFFFF',
      titleBackground: '0x2C5AA0',
      titleFontSize: 4, // base-class field, not modeled - must survive
      titleFontName: 'Verdana',
      foreground: '0xffffff',
      background: '0x2c5aa0',
    },
    layout: {
      horizontalSpan: 12,
      verticalSpan: 1,
      grabVerticalSpace: false,
      heightHint: 40,
      showInNarrowScreenMode: true,
      narrowScreenOrder: 1,
      narrowScreenHeightHint: -1,
      horizontalAlignment: 0, // vestigial keys stamped by DashboardElement.java
      verticalAlignment: 0,
    },
  },
  {
    guid: guid(1),
    type: 1, // LINE_CHART
    data: {
      ...abstractChart(),
      title: 'Traffic',
      timeUnits: 1,
      timeRange: '4',
      showGrid: 'true',
      logScaleEnabled: 'false',
      useMultipliers: 'true',
      stacked: 'false',
      lineWidth: 2, // not modeled - must survive
      area: 'false',
      interactive: false, // not modeled - must survive
      show95thPercentile: false, // not modeled - must survive
    },
    layout: {
      horizontalSpan: 6,
      verticalSpan: 3,
      grabVerticalSpace: true,
      heightHint: -1,
      showInNarrowScreenMode: true,
      narrowScreenOrder: 255,
      narrowScreenHeightHint: 300,
    },
  },
  {
    guid: guid(2),
    type: 2, // BAR_CHART
    data: {
      ...abstractChart(),
      title: 'Load by node',
      transposed: 'true',
      invertedAxis: false, // not modeled - must survive
      showPercentInLegend: true,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2, grabVerticalSpace: true, heightHint: -1 },
  },
  {
    guid: guid(3),
    type: 3, // PIE_CHART
    data: {
      ...abstractChart(),
      title: 'Disk usage',
      doughnutRendering: 'true',
      showTotal: 'true',
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(4),
    type: 4, // TUBE_CHART
    data: { ...abstractChart(), title: 'Queue depth', transposed: 'false' },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(5),
    type: 5, // STATUS_CHART (ObjectStatusChartConfig)
    data: {
      title: 'Node status',
      rootObject: '2',
      legendPosition: 2, // not modeled for this type - must survive
      showLegend: 'true',
      transposed: 'true',
      translucent: false,
      refreshRate: 60,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(6),
    type: 6, // STATUS_INDICATOR
    data: {
      title: 'Services',
      elements: [
        {
          type: 0,
          label: 'Core router',
          objectId: 105,
          dciId: 0,
          dciName: '',
          dciDescription: '',
          templateConfig: null, // not modeled - must survive
          tag: 'net', // not modeled - must survive
          drillDownObjectId: 700,
        },
        {
          type: 1,
          label: 'DB latency',
          objectId: 106,
          dciId: 3001,
          dciName: 'db.latency',
          dciDescription: 'DB latency',
          templateConfig: null,
          tag: '',
          drillDownObjectId: 0,
        },
      ],
      objectId: 0, // legacy single-object compat field - must survive
      script: null, // not modeled - must survive
      scriptContextObjectId: 0, // not modeled - must survive
      numColumns: 2,
      fullColorRange: 'true',
      shape: 1,
      labelType: 2,
    },
    layout: { horizontalSpan: 2, verticalSpan: 2 },
  },
  {
    guid: guid(7),
    type: 7, // DASHBOARD (embedded)
    data: {
      title: '',
      objectId: 0, // legacy compat field - must survive
      dashboardObjects: [702, 703],
      contextObjectId: 0,
      displayInterval: '120',
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(8),
    type: 8, // NETWORK_MAP
    data: {
      title: 'Backbone',
      objectId: 600,
      zoomLevel: '75',
      objectDoubleClickEnabled: false, // not modeled - must survive
      hideLinkLabelsEnabled: 'true',
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(10),
    type: 10, // GEO_MAP
    data: {
      title: 'Sites',
      latitude: '56.95',
      longitude: '24.1',
      zoom: 14,
      rootObjectId: 2,
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(11),
    type: 11, // ALARM_VIEWER
    data: {
      title: 'Alarms',
      objectId: 2,
      severityFilter: 0xff, // legacy default: all bits set beyond the 5-bit mask
      stateFilter: 0xff,
      isLocalSoundEnabled: 'false', // not modeled - must survive
    },
    layout: { horizontalSpan: 7, verticalSpan: 4 },
  },
  {
    guid: guid(12),
    type: 12, // AVAILABILITY_CHART
    data: {
      title: 'SLA',
      objectId: 300,
      period: 2,
      numberOfDays: '30',
      legendPosition: 2, // not modeled - must survive
      showLegend: true, // not modeled for this type - must survive
      translucent: false,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(13),
    type: 13, // DIAL_CHART (gauge)
    data: {
      ...abstractChart(),
      title: 'CPU gauge',
      gaugeType: '1',
      legendInside: false, // not modeled - must survive
      vertical: false, // not modeled - must survive
      minValue: '0',
      maxValue: '100',
      leftYellowZone: 0,
      leftRedZone: 0,
      rightYellowZone: '70',
      rightRedZone: '90',
      fontName: '', // not modeled - must survive
      fontSize: 0, // not modeled - must survive
      expectedTextWidth: 0, // not modeled - must survive
      elementBordersVisible: false, // not modeled - must survive
      colorMode: 1, // not modeled - must survive
      customColor: 0, // not modeled - must survive
    },
    layout: { horizontalSpan: 2, verticalSpan: 2 },
  },
  {
    guid: guid(14),
    type: 14, // WEB_PAGE
    data: { title: 'Wiki', url: 'https://wiki.example.org/noc' },
    layout: { horizontalSpan: 4, verticalSpan: 3 },
  },
  {
    guid: guid(15),
    type: 15, // TABLE_BAR_CHART (TableComparisonChartConfig)
    data: {
      title: 'Top talkers',
      nodeId: '101',
      dciId: '4001',
      instanceColumn: 'HOST',
      dataColumn: 'BYTES',
      legendPosition: 2, // not modeled - must survive
      showLegend: 'true',
      extendedLegend: false, // not modeled - must survive
      refreshRate: '60',
      translucent: false,
      ignoreZeroValues: 'true',
      sortOnDataColumn: true, // not modeled - must survive
      sortDescending: true, // not modeled - must survive
      autoScale: true,
      minYScaleValue: 0,
      maxYScaleValue: 100,
      modifyYBase: false,
      drillDownObjectId: 0,
      yAxisLabel: null,
      contextObjectId: 0,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(16),
    type: 16, // TABLE_PIE_CHART
    data: {
      title: 'Traffic share',
      nodeId: 101,
      dciId: 4001,
      instanceColumn: 'HOST',
      dataColumn: 'BYTES',
      showLegend: true,
      refreshRate: 30,
      ignoreZeroValues: false,
      contextObjectId: 0,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(17),
    type: 17, // TABLE_TUBE_CHART
    data: {
      title: 'Sessions',
      nodeId: 102,
      dciId: 4002,
      instanceColumn: 'USER',
      dataColumn: 'COUNT',
      showLegend: 'false',
      refreshRate: 30,
      ignoreZeroValues: 'false',
      contextObjectId: 0,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(18),
    type: 18, // SEPARATOR
    data: {
      title: '',
      lineWidth: '3',
      topMargin: 4,
      bottomMargin: 4,
      leftMargin: 0,
      rightMargin: 0,
      foreground: '0x606060',
      background: '0xF0F0F0',
    },
    layout: { horizontalSpan: 12, verticalSpan: 1, grabVerticalSpace: false },
  },
  {
    guid: guid(19),
    type: 19, // TABLE_VALUE
    data: {
      title: 'Process table',
      objectId: '103',
      dciId: '5001',
      dciName: 'proc.table', // not modeled - must survive
      dciDescription: 'Processes', // not modeled - must survive
      dciTag: '', // not modeled - must survive
      templateConfig: null, // not modeled - must survive
      refreshRate: 30,
      sortColumn: 'CPU', // not modeled - must survive
      sortDirection: 128, // not modeled - must survive (SWT.UP)
    },
    layout: { horizontalSpan: 6, verticalSpan: 3 },
  },
  {
    guid: guid(20),
    type: 20, // STATUS_MAP
    data: {
      title: 'Health map',
      objectId: 2,
      severityFilter: 0xff, // not modeled - must survive
      hideObjectsInMaintenance: 'true', // not modeled - must survive
      groupObjects: true, // not modeled - must survive
      showTextFilter: false, // not modeled - must survive
      showRadial: false, // not modeled - must survive
      fitToScreen: true, // not modeled - must survive
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(21),
    type: 21, // DCI_SUMMARY_TABLE
    data: {
      title: 'CPU summary',
      baseObjectId: '2',
      tableId: '5',
      refreshInterval: '120',
      numRowShown: 20, // not modeled - must survive
      sortingColumnList: ['>CPU', 'NAME'], // not modeled - must survive
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(22),
    type: 22, // SYSLOG_MONITOR
    data: { title: 'Syslog', objectId: '104' },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(23),
    type: 23, // SNMP_TRAP_MONITOR
    data: { title: 'Traps', objectId: 0 },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(24),
    type: 24, // EVENT_MONITOR
    data: {
      title: 'Events',
      objectId: 2,
      filter: 'severity >= 3', // modeled: client-side token filter
      maxEvents: '200',
      timeRangeMinutes: '120',
      eventCodes: '1,4,29', // modeled: comma string <-> number[]
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(25),
    type: 25, // SERVICE_COMPONENTS
    data: {
      title: 'Service tree',
      objectId: 400,
      zoomLevel: 100, // not modeled - must survive
      objectDoubleClickEnabled: false, // not modeled - must survive
      objectDisplayMode: 'ICON', // Gson enum-by-name - must survive
      flags: 0, // not modeled - must survive
      linkRouting: 0, // not modeled - must survive
      defaultLinkColor: -1, // not modeled - must survive
      mapLayout: 'SPARSE_VTREE', // Gson enum-by-name - must survive
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(26),
    type: 26, // RACK_DIAGRAM - view is a Gson enum-by-name string in legacy data
    data: { title: 'Rack 12', objectId: 800, view: 'FRONT' },
    layout: { horizontalSpan: 3, verticalSpan: 5 },
  },
  {
    guid: guid(27),
    type: 27, // OBJECT_TOOLS
    data: {
      title: 'Quick actions',
      tools: [
        { objectId: 105, toolId: 11, name: 'Restart agent', color: 0 },
        { objectId: 105, toolId: 12, name: 'Ping', color: 3394611 },
      ],
      numColumns: '2',
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(28),
    type: 28, // OBJECT_QUERY (ObjectDetailsConfig)
    data: {
      title: 'Down nodes',
      query: 'status == DOWN',
      rootObjectId: '2',
      properties: [{ name: 'name', displayName: 'Name', type: 0 }],
      refreshRate: '60',
      orderingProperties: null, // not modeled - must survive
      recordLimit: 50,
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(29),
    type: 29, // PORT_VIEW
    data: { title: 'Switch ports', rootObjectId: '107' },
    layout: { horizontalSpan: 6, verticalSpan: 3 },
  },
  {
    guid: guid(30),
    type: 30, // SCRIPTED_BAR_CHART (extends AbstractChartConfig)
    data: {
      ...abstractChart(),
      title: 'By protocol',
      script: 'return %{ "tcp": 10, "udp": 4 };',
      objectId: 2,
      transposed: 'false',
      invertedAxis: false, // not modeled - must survive
      showPercentInLegend: true,
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(31),
    type: 31, // SCRIPTED_PIE_CHART
    data: {
      ...abstractChart(),
      title: 'By severity',
      script: 'return GetAlarmStats($object);',
      objectId: 2,
      doughnutRendering: 'true',
      showTotal: 'false',
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(32),
    type: 32, // FILE_MONITOR
    data: {
      title: 'App log',
      objectId: 103,
      fileName: '/var/log/app.log',
      historyLimit: '2000',
      filter: 'ERROR', // modeled
      syntaxHighlighter: null, // not modeled - must survive
    },
    layout: { horizontalSpan: 6, verticalSpan: 4 },
  },
  {
    guid: guid(33),
    type: 33, // SCRIPTED_GAUGE (ScriptedGaugeConfig extends GaugeConfig)
    data: {
      ...abstractChart(), // inherited, unused by a scripted gauge - must survive
      title: 'Load',
      script: 'return %{ "CPU": 42, "Mem": 77 };',
      objectId: 4294967295, // AbstractObject.CONTEXT
      gaugeType: '0',
      legendInside: false, // not modeled - must survive
      vertical: false, // not modeled - must survive
      minValue: '0',
      maxValue: '100',
      leftYellowZone: 0,
      leftRedZone: 0,
      rightYellowZone: '70',
      rightRedZone: '90',
      fontName: '', // not modeled - must survive
      colorMode: 1, // not modeled - must survive
    },
    layout: { horizontalSpan: 3, verticalSpan: 2 },
  },
  {
    guid: guid(34),
    type: 34, // AI_OBSERVATION_MONITOR
    data: {
      title: 'AI observations',
      objectId: 2,
      instanceId: '3',
      newOnly: 'false',
      maxRecords: 100,
      refreshInterval: 30,
    },
    layout: { horizontalSpan: 6, verticalSpan: 2 },
  },
  {
    guid: guid(9),
    type: 9, // CUSTOM - retired, unknown to this UI; must pass through untouched
    data: { title: 'Custom', futureField: { nested: true } },
    layout: { horizontalSpan: 6, verticalSpan: 2 },
  },
]

/** Flow-order layout (no gridX/gridY), as every dashboard saved by the Java client. */
export const LEGACY_DASHBOARD = {
  id: 9999,
  name: 'Legacy parity corpus',
  numColumns: 12,
  elements: LEGACY_ELEMENTS,
}
