// DCI.perfTabSettings: a simple-xml `<config>` document (legacy PerfViewGraphSettings), one child
// element per field, no attributes.

const DEFAULTS = {
  enabled: false,
  autoScale: true,
  logScaleEnabled: false,
  stacked: false,
  showLegendAlways: false,
  extendedLegend: true,
  useMultipliers: true,
  minYScaleValue: 0,
  maxYScaleValue: 100,
  timeRange: 1,
  timeUnits: 1,
  type: 1,
  color: '0x00C000',
  automaticColor: true,
  title: '',
  name: '',
  showThresholds: false,
  groupName: '',
  order: 100,
  modifyYBase: false,
  yAxisLabel: '',
  invertedValues: false,
  translucent: true,
}

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function boolText(root, tagName, defaultVal) {
  const text = root.querySelector(tagName)?.textContent?.trim()
  if (text == null || text === '') return defaultVal
  return text === 'true'
}

function numText(root, tagName, defaultVal) {
  const text = root.querySelector(tagName)?.textContent?.trim()
  if (text == null || text === '') return defaultVal
  const num = Number(text)
  return Number.isNaN(num) ? defaultVal : num
}

function strText(root, tagName, defaultVal) {
  const el = root.querySelector(tagName)
  return el ? (el.textContent ?? '') : defaultVal
}

export function parsePerfViewSettings(xmlString) {
  if (!xmlString?.trim()) return { ...DEFAULTS }

  const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  if (doc.querySelector('parsererror')) return { ...DEFAULTS }

  const root = doc.documentElement
  if (root.tagName !== 'config') return { ...DEFAULTS }

  return {
    enabled: boolText(root, 'enabled', DEFAULTS.enabled),
    autoScale: boolText(root, 'autoScale', DEFAULTS.autoScale),
    logScaleEnabled: boolText(root, 'logScaleEnabled', DEFAULTS.logScaleEnabled),
    stacked: boolText(root, 'stacked', DEFAULTS.stacked),
    showLegendAlways: boolText(root, 'showLegendAlways', DEFAULTS.showLegendAlways),
    extendedLegend: boolText(root, 'extendedLegend', DEFAULTS.extendedLegend),
    useMultipliers: boolText(root, 'useMultipliers', DEFAULTS.useMultipliers),
    minYScaleValue: numText(root, 'minYScaleValue', DEFAULTS.minYScaleValue),
    maxYScaleValue: numText(root, 'maxYScaleValue', DEFAULTS.maxYScaleValue),
    timeRange: numText(root, 'timeRange', DEFAULTS.timeRange),
    timeUnits: numText(root, 'timeUnits', DEFAULTS.timeUnits),
    type: numText(root, 'type', DEFAULTS.type),
    color: strText(root, 'color', DEFAULTS.color),
    automaticColor: boolText(root, 'automaticColor', DEFAULTS.automaticColor),
    title: strText(root, 'title', DEFAULTS.title),
    name: strText(root, 'name', DEFAULTS.name),
    showThresholds: boolText(root, 'showThresholds', DEFAULTS.showThresholds),
    groupName: strText(root, 'groupName', DEFAULTS.groupName),
    order: numText(root, 'order', DEFAULTS.order),
    modifyYBase: boolText(root, 'modifyYBase', DEFAULTS.modifyYBase),
    yAxisLabel: strText(root, 'yAxisLabel', DEFAULTS.yAxisLabel),
    invertedValues: boolText(root, 'invertedValues', DEFAULTS.invertedValues),
    translucent: boolText(root, 'translucent', DEFAULTS.translucent),
  }
}

export function serializePerfViewSettings(model) {
  const m = { ...DEFAULTS, ...model }
  const lines = ['<config>']
  for (const key of Object.keys(DEFAULTS)) {
    const value = m[key]
    const text = typeof value === 'boolean' ? String(value) : xmlEscape(value)
    lines.push(`  <${key}>${text}</${key}>`)
  }
  lines.push('</config>')
  return lines.join('\n')
}
