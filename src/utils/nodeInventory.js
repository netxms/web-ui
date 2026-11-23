/**
 * Rows for the System views of a node: software and hardware inventory, the ENTITY-MIB
 * component tree, processes, services and user sessions. Labels, units and sort orders follow
 * the legacy views of the same names.
 */
import { DCI_DATA_TYPES, formatDataValue, measurementUnit } from '@/utils/dciFormat'
import { ipSortKey } from '@/utils/objectUtils'
import { findColumnIndex } from '@/utils/tableData'
import { formatDateMedium, formatDateTimeMedium, formatDurationCompact } from '@/utils/timeFormat'

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function timeSortKey(value) {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : null
}

/** Legacy DataFormatter with an explicit unit: `%{u,m}s` on a UINT64. */
function formatWithUnit(value, unitName, formatString = '%{u,m}s') {
  return formatDataValue(String(value), {
    formatString,
    dataType: DCI_DATA_TYPES.UINT64,
    unit: measurementUnit(unitName),
  })
}

/**
 * @param {object} entry - one `SoftwarePackage`
 * @param {number} index
 */
export function toSoftwareRow(entry, index) {
  return {
    id: index,
    name: entry.name || null,
    version: entry.version || null,
    user: entry.user || null,
    vendor: entry.vendor || null,
    date: entry.date ? formatDateMedium(entry.date, { fallback: null }) : null,
    dateSort: timeSortKey(entry.date),
    description: entry.description || null,
    url: entry.url || null,
    uninstallKey: entry.uninstallKey || null,
  }
}

/** `HardwareComponent.category` names in the order of legacy `HardwareComponentCategory`. */
const HARDWARE_CATEGORIES = [
  ['Other', 'Other'],
  ['Baseboard', 'Baseboard'],
  ['Processor', 'Processor'],
  ['Memory', 'Memory device'],
  ['Storage', 'Storage device'],
  ['Battery', 'Battery'],
  ['NetworkAdapter', 'Network adapter'],
]
const categoryOrder = new Map(HARDWARE_CATEGORIES.map(([name], i) => [name, i]))
const categoryLabel = new Map(HARDWARE_CATEGORIES)

/**
 * As legacy HardwareComponentLabelProvider: the meaning of `capacity` depends on the category,
 * and a processor reports MHz.
 *
 * @param {string} category
 * @param {number|null|undefined} capacity
 * @returns {string|null}
 */
export function formatHardwareCapacity(category, capacity) {
  const value = toNumber(capacity)
  if (value === null) return null
  switch (category) {
    case 'Battery':
      return `${value} mWh`
    case 'Memory':
    case 'Storage':
      return formatWithUnit(value, 'B (IEC)')
    case 'NetworkAdapter':
      return formatWithUnit(value, 'bps')
    case 'Processor':
      return formatWithUnit(value * 1000000, 'Hz')
    default:
      return null
  }
}

/**
 * @param {object} entry - one `HardwareComponent`
 * @param {number} index
 * @param {Map<string, {id: number, name: string}>} [assets] - component assets by serial number
 */
export function toHardwareRow(entry, index, assets = new Map()) {
  const order = categoryOrder.get(entry.category) ?? 0
  const serial = entry.serialNumber || null
  const asset = serial ? (assets.get(serial) ?? null) : null
  return {
    id: index,
    category: categoryLabel.get(entry.category) ?? entry.category ?? null,
    categorySort: order * 1e6 + (entry.index ?? 0),
    index: entry.index ?? null,
    type: entry.type || null,
    vendor: entry.vendor || null,
    model: entry.model || null,
    capacity: formatHardwareCapacity(entry.category, entry.capacity),
    capacitySort: toNumber(entry.capacity),
    partNumber: entry.partNumber || null,
    serial,
    location: entry.location || null,
    description: entry.description || null,
    assetId: asset?.id ?? null,
    asset: asset?.name ?? null,
  }
}

/** `PhysicalComponent.class` values whose legacy label differs from the name. */
const COMPONENT_CLASS_LABELS = { PowerSupply: 'Power Supply' }

/**
 * The ENTITY-MIB tree in display order, each row knowing its ancestors so collapsing and
 * filtering can work on the flat list.
 *
 * @param {object|null|undefined} root - `PhysicalComponent` root from `/physical-components`
 * @param {Map<string, {id: number, name: string}>} [assets] - component assets by serial number
 * @returns {object[]}
 */
export function flattenComponentTree(root, assets = new Map()) {
  const rows = []
  const visit = (component, ancestors) => {
    const children = component.children ?? []
    const serial = component.serialNumber || null
    const asset = serial ? (assets.get(serial) ?? null) : null
    const ifIndex = component.interfaceIndex ?? 0
    rows.push({
      id: component.index,
      depth: ancestors.length,
      ancestors,
      hasChildren: children.length > 0,
      // Legacy PhysicalComponent.getDisplayName.
      name: component.name || component.description || `[${component.index}]`,
      class: COMPONENT_CLASS_LABELS[component.class] ?? component.class ?? null,
      description: component.description || null,
      model: component.model || null,
      firmware: component.firmware || null,
      serial,
      vendor: component.vendor || null,
      // An index with no matching interface object still names the port.
      interface: component.interfaceName ?? (ifIndex > 0 ? `[${ifIndex}]` : null),
      assetId: asset?.id ?? null,
      asset: asset?.name ?? null,
    })
    const path = [...ancestors, component.index]
    for (const child of children) visit(child, path)
  }
  if (root) visit(root, [])
  return rows
}

/**
 * With a filter, the matching rows and their ancestors, collapsed or not; without one, the rows
 * no collapsed ancestor hides.
 *
 * @param {object[]} rows - from flattenComponentTree
 * @param {Set<number>} collapsed - ids of collapsed rows
 * @param {((row: object) => boolean)|null} matches
 * @returns {object[]}
 */
export function visibleTreeRows(rows, collapsed, matches) {
  if (matches) {
    const keep = new Set()
    for (const row of rows) {
      if (!matches(row)) continue
      keep.add(row.id)
      for (const id of row.ancestors) keep.add(id)
    }
    return rows.filter((row) => keep.has(row.id))
  }
  return rows.filter((row) => !row.ancestors.some((id) => collapsed.has(id)))
}

/**
 * Object query for the assets linked to components of a node, as legacy
 * `NXCSession.getComponentAssets`. Asset attributes do not exist on other classes, so the class
 * is tested before they are read.
 *
 * @param {number} nodeId
 * @returns {string}
 */
export function componentAssetQuery(nodeId) {
  return `global serial = "";
if (type != ASSET)
   return false;
serial = $object->componentSerial;
return ($object->linkedObjectId == ${Number(nodeId)}) and (serial != "");`
}

/**
 * @param {Array<{ object: object, fields: Record<string, string> }>|null|undefined} results
 * @returns {Map<string, {id: number, name: string}>}
 */
export function assetsBySerial(results) {
  const map = new Map()
  for (const { object, fields } of results ?? []) {
    if (fields?.serial) map.set(fields.serial, { id: object.id, name: object.name })
  }
  return map
}

function tableCell(row, index) {
  return index < 0 ? null : (row.values?.[index]?.value ?? null)
}

/**
 * Rows of the agent's `System.Processes` table. CPU % is the KTIME + UTIME (milliseconds)
 * a process used since the previous sample over the elapsed time of all CPUs, as legacy
 * ProcessesView computes it; it stays empty on the first sample.
 *
 * @param {object|null|undefined} tableData
 * @param {{ timestamp: number, cpuTimes: Map<number, number> }|null} previous
 * @param {number} cpuCount
 * @param {number} timestamp - epoch ms of this sample
 * @returns {{ rows: object[], sample: { timestamp: number, cpuTimes: Map<number, number> } }}
 */
export function processRows(tableData, previous, cpuCount, timestamp) {
  const col = (name) => findColumnIndex(tableData, name)
  const idx = {
    pid: col('PID'),
    name: col('NAME'),
    user: col('USER'),
    threads: col('THREADS'),
    handles: col('HANDLES'),
    vmSize: col('VMSIZE'),
    rss: col('RSS'),
    memory: col('MEMORY_USAGE'),
    pageFaults: col('PAGE_FAULTS'),
    ktime: col('KTIME'),
    utime: col('UTIME'),
    cmdLine: col('CMDLINE'),
  }
  const elapsed = previous ? (timestamp - previous.timestamp) * Math.max(cpuCount, 1) : 0
  const cpuTimes = new Map()

  const rows = (tableData?.data ?? []).map((row, i) => {
    const pid = toNumber(tableCell(row, idx.pid)) ?? 0
    const ktime = toNumber(tableCell(row, idx.ktime)) ?? 0
    const utime = toNumber(tableCell(row, idx.utime)) ?? 0
    cpuTimes.set(pid, ktime + utime)
    const before = elapsed > 0 ? previous.cpuTimes.get(pid) : undefined
    const used = before === undefined ? -1 : ktime + utime - before
    const cpu = used >= 0 ? (used / elapsed) * 100 : null
    const memory = toNumber(tableCell(row, idx.memory))
    const vmSize = toNumber(tableCell(row, idx.vmSize))
    const rss = toNumber(tableCell(row, idx.rss))
    return {
      id: idx.pid < 0 ? i : pid,
      pid,
      name: tableCell(row, idx.name) || null,
      user: tableCell(row, idx.user) || null,
      threads: toNumber(tableCell(row, idx.threads)),
      handles: toNumber(tableCell(row, idx.handles)),
      vmSize: vmSize === null ? null : formatWithUnit(vmSize, 'B (IEC)', '%*sB'),
      vmSizeSort: vmSize,
      rss: rss === null ? null : formatWithUnit(rss, 'B (IEC)', '%*sB'),
      rssSort: rss,
      cpu: cpu === null ? null : cpu.toFixed(2),
      cpuSort: cpu,
      memory: memory === null ? null : memory.toFixed(2),
      memorySort: memory,
      pageFaults: toNumber(tableCell(row, idx.pageFaults)),
      ktime,
      utime,
      commandLine: tableCell(row, idx.cmdLine) || null,
    }
  })
  return { rows, sample: { timestamp, cpuTimes } }
}

/**
 * Rows of the agent's `System.Services` table.
 *
 * @param {object|null|undefined} tableData
 * @returns {object[]}
 */
export function serviceRows(tableData) {
  const col = (name) => findColumnIndex(tableData, name)
  const idx = {
    name: col('NAME'),
    displayName: col('DISPNAME'),
    state: col('STATE'),
    pid: col('PID'),
    type: col('TYPE'),
    startup: col('STARTUP'),
    runAs: col('RUN_AS'),
    commandLine: col('BINARY'),
    dependencies: col('DEPENDENCIES'),
  }
  return (tableData?.data ?? []).map((row, i) => {
    const name = tableCell(row, idx.name) || null
    const pid = toNumber(tableCell(row, idx.pid))
    return {
      id: name ?? i,
      name,
      displayName: tableCell(row, idx.displayName) || null,
      state: tableCell(row, idx.state) || null,
      // A stopped service reports PID 0.
      pid: pid || null,
      pidSort: pid ?? 0,
      type: tableCell(row, idx.type) || null,
      startup: tableCell(row, idx.startup) || null,
      runAs: tableCell(row, idx.runAs) || null,
      commandLine: tableCell(row, idx.commandLine) || null,
      dependencies: tableCell(row, idx.dependencies) || null,
    }
  })
}

const UNSPECIFIED_ADDRESSES = new Set(['0.0.0.0', '::'])

/**
 * @param {object} session - one `UserSession`
 */
export function toSessionRow(session) {
  const address = session.clientAddress?.address ?? null
  const display = session.display
  const idle = session.idleTime ?? 0
  return {
    id: session.id,
    user: session.loginName || null,
    terminal: session.terminal || null,
    // Agents that report no state leave only the connected flag (legacy shows that alone).
    state: session.state || (session.connected ? 'Active' : 'Disconnected'),
    clientName: session.clientName || null,
    clientAddress: address && !UNSPECIFIED_ADDRESSES.has(address) ? address : null,
    clientAddressSort: address ? ipSortKey(session.clientAddress) : null,
    display:
      display?.width > 0 && display?.height > 0 && display?.colorDepth > 0
        ? `${display.width}x${display.height}x${display.colorDepth}`
        : null,
    loginTime: formatDateTimeMedium(session.loginTime, { fallback: null }),
    loginTimeSort: timeSortKey(session.loginTime),
    // 0 is also what the agent sends when it does not know.
    idleTime: idle > 0 ? formatDurationCompact(idle) : null,
    idleTimeSort: idle,
    agentType: session.sessionAgent?.type ?? 'none',
    agentPid: session.sessionAgent?.pid || null,
    // Legacy UserSession.getScreenshotSessionName.
    screenshotSession: session.sessionName || session.terminal || '',
    hasSessionAgent: !!session.sessionAgent,
  }
}
