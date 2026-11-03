// Interface traffic DCIs, as the legacy `CreateInterfaceDciAction`. Created on the node: agent when
// it has one, else SNMP; 64-bit counters when the agent or device supports them.

export const IF_NAME_PLACEHOLDER = '@@ifName@@'

/**
 * @typedef {object} InterfaceDciMetric
 * @property {string} id
 * @property {string} label - checkbox text in the dialog
 * @property {string} description - DCI description, `@@ifName@@` standing for the interface
 * @property {boolean} enabledByDefault
 */

/** @type {InterfaceDciMetric[]} In the legacy order. */
export const INTERFACE_DCI_METRICS = [
  {
    id: 'inBytes',
    label: 'Inbound traffic (bytes)',
    description: `Inbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: true,
  },
  {
    id: 'outBytes',
    label: 'Outbound traffic (bytes)',
    description: `Outbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: true,
  },
  {
    id: 'inBits',
    label: 'Inbound traffic (bits)',
    description: `Inbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
  {
    id: 'outBits',
    label: 'Outbound traffic (bits)',
    description: `Outbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
  {
    id: 'inPackets',
    label: 'Inbound traffic (packets)',
    description: `Inbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
  {
    id: 'outPackets',
    label: 'Outbound traffic (packets)',
    description: `Outbound traffic on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
  {
    id: 'inErrors',
    label: 'Input errors',
    description: `Input error rate on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
  {
    id: 'outErrors',
    label: 'Output errors',
    description: `Output error rate on ${IF_NAME_PLACEHOLDER}`,
    enabledByDefault: false,
  },
]

// Pairs are [32-bit, 64-bit] (null: 32-bit only) and unit [no delta, delta]; the tag is for delta.
const METRIC_SOURCES = {
  inBytes: {
    agent: ['Net.Interface.BytesIn', 'Net.Interface.BytesIn64'],
    oid: ['.1.3.6.1.2.1.2.2.1.10', '.1.3.6.1.2.1.31.1.1.1.6'],
    unit: ['B (Metric)', 'B/s'],
    tag: 'iface.inbound.bytes',
  },
  outBytes: {
    agent: ['Net.Interface.BytesOut', 'Net.Interface.BytesOut64'],
    oid: ['.1.3.6.1.2.1.2.2.1.16', '.1.3.6.1.2.1.31.1.1.1.10'],
    unit: ['B (Metric)', 'B/s'],
    tag: 'iface.outbound.bytes',
  },
  inBits: {
    agent: ['Net.Interface.BytesIn', 'Net.Interface.BytesIn64'],
    oid: ['.1.3.6.1.2.1.2.2.1.10', '.1.3.6.1.2.1.31.1.1.1.6'],
    unit: ['b (Metric)', 'b/s'],
    tag: 'iface.inbound.bits',
  },
  outBits: {
    agent: ['Net.Interface.BytesOut', 'Net.Interface.BytesOut64'],
    oid: ['.1.3.6.1.2.1.2.2.1.16', '.1.3.6.1.2.1.31.1.1.1.10'],
    unit: ['b (Metric)', 'b/s'],
    tag: 'iface.outbound.bits',
  },
  inPackets: {
    agent: ['Net.Interface.PacketsIn', 'Net.Interface.PacketsIn64'],
    oid: ['.1.3.6.1.2.1.2.2.1.11', '.1.3.6.1.2.1.31.1.1.1.7'],
    unit: ['packets', 'packets/s'],
    tag: null,
  },
  outPackets: {
    agent: ['Net.Interface.PacketsOut', 'Net.Interface.PacketsOut64'],
    oid: ['.1.3.6.1.2.1.2.2.1.17', '.1.3.6.1.2.1.31.1.1.1.11'],
    unit: ['packets', 'packets/s'],
    tag: null,
  },
  inErrors: {
    agent: ['Net.Interface.InErrors', null],
    oid: ['.1.3.6.1.2.1.2.2.1.14', null],
    unit: ['errors', 'errors/s'],
    tag: null,
  },
  outErrors: {
    agent: ['Net.Interface.OutErrors', null],
    oid: ['.1.3.6.1.2.1.2.2.1.20', null],
    unit: ['errors', 'errors/s'],
    tag: null,
  },
}

const BIT_METRICS = new Set(['inBits', 'outBits'])

/**
 * Some devices index ifTable by more than the ifIndex; the driver reports that suffix.
 *
 * @param {{ index?: number, ifTableSuffix?: number[] }} iface
 */
export function snmpInstanceOf(iface) {
  const suffix = iface?.ifTableSuffix ?? []
  return suffix.length > 0 ? `.${suffix.join('.')}` : `.${iface?.index ?? 0}`
}

/**
 * @typedef {object} InterfaceDciChoice
 * @property {string} metricId - an `INTERFACE_DCI_METRICS` id
 * @property {boolean} delta - collect as average per second
 * @property {string} description - may contain `@@ifName@@`
 */

/**
 * @typedef {object} InterfaceDciSchedule
 * @property {'default'|'custom'} pollingScheduleType
 * @property {number} [pollingInterval] - seconds, used when custom
 * @property {'default'|'custom'|'none'} retentionType
 * @property {number} [retentionTime] - days, used when custom
 */

/**
 * The WebAPI does not read `relatedObject` yet; it is sent for when it does.
 *
 * @param {object} args
 * @param {{ id: number, name: string, index?: number, ifTableSuffix?: number[] }} args.iface
 * @param {{ capabilities?: object }} args.node - the interface's node
 * @param {InterfaceDciChoice[]} args.choices
 * @param {InterfaceDciSchedule} args.schedule
 * @returns {object[]} DataCollectionItem payloads for POST .../data-collection/configuration
 */
export function buildInterfaceDcis({ iface, node, choices, schedule }) {
  const caps = node?.capabilities ?? {}
  const viaAgent = !!caps.isNativeAgent
  const wide = viaAgent ? !!caps.hasAgentIfxCounters : !!caps.hasIfxTable

  return choices.map(({ metricId, delta, description }) => {
    const source = METRIC_SOURCES[metricId]
    if (!source) throw new Error(`Unknown interface metric: ${metricId}`)

    const variants = viaAgent ? source.agent : source.oid
    const use64 = wide && variants[1] != null
    const base = use64 ? variants[1] : variants[0]
    const name = viaAgent ? `${base}(${iface.index ?? 0})` : `${base}${snmpInstanceOf(iface)}`

    return {
      type: 'item',
      name,
      description: (description ?? '').replaceAll(IF_NAME_PLACEHOLDER, iface.name ?? ''),
      origin: viaAgent ? 'agent' : 'snmp',
      status: 'active',
      dataType: use64 ? 'counter64' : 'counter32',
      deltaCalculation: delta ? 'averagePerSecond' : 'none',
      unitName: source.unit[delta ? 1 : 0],
      systemTag: delta && source.tag ? source.tag : '',
      transformationScript: BIT_METRICS.has(metricId) ? 'return $1 * 8;' : '',
      pollingScheduleType: schedule.pollingScheduleType,
      ...(schedule.pollingScheduleType === 'custom'
        ? { pollingInterval: String(schedule.pollingInterval) }
        : {}),
      retentionType: schedule.retentionType,
      ...(schedule.retentionType === 'custom'
        ? { retentionTime: String(schedule.retentionTime) }
        : {}),
      relatedObject: iface.id,
    }
  })
}
