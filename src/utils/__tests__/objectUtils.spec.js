import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import {
  getStatusInfo,
  STATUS_KEYS,
  STATUS_PALETTE,
  getClassIcon,
  getNavItem,
  getDciSeriesKind,
  getReachabilityChips,
  getActiveProblemChips,
  getUptimeInfo,
  getPollSummary,
  ipSortKey,
  getDciCollectionErrorInfo,
  getDciSourceTypeLabel,
  getDciDataTypeLabel,
} from '../objectUtils'

describe('getStatusInfo', () => {
  it('returns Normal for status 0', () => {
    const info = getStatusInfo(0)
    expect(info.label).toBe('Normal')
    expect(info.color).toBe('var(--netxms-status-normal)')
    expect(info.bgColor).toBe('var(--netxms-status-normal-bg)')
    expect(info.textColor).toBe('var(--netxms-status-normal-text)')
    expect(info.onFillColor).toBe('var(--netxms-status-normal-on-fill)')
  })

  it('returns Warning for status 1', () => {
    expect(getStatusInfo(1).label).toBe('Warning')
    expect(getStatusInfo(1).color).toBe('var(--netxms-status-warning)')
  })

  it('returns Minor for status 2', () => {
    expect(getStatusInfo(2).label).toBe('Minor')
    expect(getStatusInfo(2).color).toBe('var(--netxms-status-minor)')
  })

  it('returns Major for status 3', () => {
    expect(getStatusInfo(3).label).toBe('Major')
    expect(getStatusInfo(3).color).toBe('var(--netxms-status-major)')
  })

  it('returns Critical for status 4', () => {
    expect(getStatusInfo(4).label).toBe('Critical')
    expect(getStatusInfo(4).color).toBe('var(--netxms-status-critical)')
  })

  it('returns Unknown for status 5', () => {
    expect(getStatusInfo(5).label).toBe('Unknown')
    expect(getStatusInfo(5).color).toBe('var(--netxms-status-unknown)')
  })

  it('returns Unmanaged for status 6', () => {
    expect(getStatusInfo(6).label).toBe('Unmanaged')
  })

  it('returns Disabled for status 7', () => {
    expect(getStatusInfo(7).label).toBe('Disabled')
  })

  // STATUS_TESTING, set on interfaces whose operational state is "testing"
  it('returns Testing for status 8', () => {
    expect(getStatusInfo(8).label).toBe('Testing')
    expect(getStatusInfo(8).color).toBe('var(--netxms-status-testing)')
  })

  it('falls back to Unknown for invalid status', () => {
    expect(getStatusInfo(99).label).toBe('Unknown')
    expect(getStatusInfo(undefined).label).toBe('Unknown')
    expect(getStatusInfo(null).label).toBe('Unknown')
  })
})

describe('status palette', () => {
  // The hex copy (for canvas/ECharts) must match the CSS variables. Read from disk: Vitest
  // stubs CSS imports, `?raw` included, to an empty string.
  const mainCss = readFileSync(join(cwd(), 'src/assets/styles/main.css'), 'utf8')
  const darkStart = mainCss.indexOf('html.app-dark {')
  const blocks = {
    light: mainCss.slice(0, darkStart),
    dark: mainCss.slice(darkStart, mainCss.indexOf('\n}', darkStart)),
  }
  const suffixes = { fill: '', bg: '-bg', text: '-text', onFill: '-on-fill' }

  function cssPalette(theme) {
    return Object.fromEntries(
      Object.entries(suffixes).map(([variant, suffix]) => [
        variant,
        STATUS_KEYS.map((key) => {
          const match = blocks[theme].match(
            new RegExp(`--netxms-status-${key}${suffix}:\\s*(#[0-9a-f]{6})`),
          )
          return match?.[1] ?? `missing --netxms-status-${key}${suffix}`
        }),
      ]),
    )
  }

  it('main.css light variables match STATUS_PALETTE.light', () => {
    expect(cssPalette('light')).toEqual(STATUS_PALETTE.light)
  })

  it('main.css dark variables match STATUS_PALETTE.dark', () => {
    expect(cssPalette('dark')).toEqual(STATUS_PALETTE.dark)
  })

  // WCAG relative luminance / contrast ratio
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  it.each(['light', 'dark'])('text on fill is readable on every %s fill (WCAG AA)', (theme) => {
    const { fill, onFill } = STATUS_PALETTE[theme]
    const unreadable = STATUS_KEYS.filter((key, code) => contrast(onFill[code], fill[code]) < 4.5)
    expect(unreadable).toEqual([])
  })
})

describe('getClassIcon', () => {
  it('returns correct icon for Node', () => {
    expect(getClassIcon('Node')).toBe('pi pi-server')
  })

  it('returns correct icon for Container', () => {
    expect(getClassIcon('Container')).toBe('pi pi-folder')
  })

  it('returns correct icon for Interface', () => {
    expect(getClassIcon('Interface')).toBe('app-icon-ethernet-port')
  })

  it('returns correct icon for ServiceRoot', () => {
    expect(getClassIcon('ServiceRoot')).toBe('pi pi-globe')
  })

  it('returns correct icon for Collector', () => {
    expect(getClassIcon('Collector')).toBe('pi pi-folder')
  })

  it('returns fallback for unknown class', () => {
    expect(getClassIcon('SomeNewClass')).toBe('pi pi-circle')
  })
})

describe('getNavItem', () => {
  it('maps ServiceRoot to Infrastructure nav item', () => {
    const item = getNavItem({ id: 2, class: 'ServiceRoot', name: 'Infrastructure Services' })
    expect(item.id).toBe(2)
    expect(item.label).toBe('Infrastructure')
    expect(item.route).toBe('/infrastructure')
    expect(item.icon).toBeTruthy()
  })

  it('maps TemplateRoot to Templates nav item', () => {
    const item = getNavItem({ id: 3, class: 'TemplateRoot', name: 'Templates' })
    expect(item.label).toBe('Templates')
    expect(item.route).toBe('/templates')
  })

  it('returns null for unmapped classes', () => {
    expect(getNavItem({ id: 1, class: 'Network', name: 'Entire Network' })).toBeNull()
  })

  it('returns null for unknown classes', () => {
    expect(getNavItem({ id: 99, class: 'SomethingElse', name: 'Test' })).toBeNull()
  })
})

describe('getDciSeriesKind', () => {
  const rows = (...vals) => vals.map((v) => ({ value: v }))

  it('classifies a 0/1 series as boolean', () => {
    expect(getDciSeriesKind(rows('0', '1', '1', '0', '1'))).toBe('boolean')
  })

  it('treats an all-zero series as boolean', () => {
    expect(getDciSeriesKind(rows('0', '0', '0'))).toBe('boolean')
  })

  it('classifies a small set of distinct integers as discrete', () => {
    expect(getDciSeriesKind(rows('0', '1', '2', '3', '2', '1'))).toBe('discrete')
  })

  it('classifies floats as continuous', () => {
    expect(getDciSeriesKind(rows('12.5', '13.1', '11.9'))).toBe('continuous')
  })

  it('classifies wide-ranging integers as continuous', () => {
    expect(getDciSeriesKind(rows('10', '250', '4096', '1', '99999'))).toBe('continuous')
  })

  it('falls back to continuous for empty or missing input', () => {
    expect(getDciSeriesKind([])).toBe('continuous')
    expect(getDciSeriesKind(undefined)).toBe('continuous')
  })

  it('ignores non-numeric (string) values and defaults to continuous', () => {
    expect(getDciSeriesKind(rows('UP', 'DOWN', 'UP'))).toBe('continuous')
  })

  it('reads aggregated rows via avg when value is absent', () => {
    expect(getDciSeriesKind([{ avg: 0 }, { avg: 1 }, { avg: 1 }])).toBe('boolean')
  })
})

describe('getReachabilityChips', () => {
  const node = (capabilities, state, ipAddress = { address: '10.0.0.1' }) => ({
    class: 'Node',
    capabilities,
    state,
    ipAddress,
  })

  it('reports one chip per protocol the object claims', () => {
    const chips = getReachabilityChips(
      node({ isNativeAgent: true, isSnmp: true }, { snmpUnreachable: true }),
    )
    expect(chips).toEqual([
      { key: 'agent', label: 'Agent', ok: true },
      { key: 'snmp', label: 'SNMP', ok: false },
      { key: 'icmp', label: 'ICMP', ok: true },
    ])
  })

  it('omits protocols the object does not speak', () => {
    const chips = getReachabilityChips(node({ isNativeAgent: true }, {}))
    expect(chips.map((c) => c.key)).toEqual(['agent', 'icmp'])
  })

  it('includes ICMP only when the object has a usable IP address', () => {
    expect(getReachabilityChips(node({}, {}, null))).toEqual([])
    expect(getReachabilityChips(node({}, {}, { address: '0.0.0.0' }))).toEqual([])
  })

  it('returns nothing when the object carries no state document', () => {
    expect(getReachabilityChips({ class: 'Subnet', capabilities: { isSnmp: true } })).toEqual([])
    expect(getReachabilityChips(null)).toEqual([])
  })
})

describe('getActiveProblemChips', () => {
  it('surfaces active flags that no reachability chip covers', () => {
    const chips = getActiveProblemChips({
      capabilities: { isNativeAgent: true },
      state: { agentUnreachable: true, networkPathProblem: true, snmpTrapFlood: true },
      ipAddress: { address: '10.0.0.1' },
    })
    expect(chips.map((c) => c.key)).toEqual(['snmpTrapFlood', 'networkPathProblem'])
  })

  it('keeps an unreachable flag for a protocol the object does not claim', () => {
    const chips = getActiveProblemChips({
      capabilities: {},
      state: { snmpUnreachable: true },
      ipAddress: null,
    })
    expect(chips.map((c) => c.key)).toEqual(['snmpUnreachable'])
  })

  it('returns nothing when no flag is active', () => {
    expect(getActiveProblemChips({ capabilities: {}, state: {} })).toEqual([])
    expect(getActiveProblemChips(null)).toEqual([])
  })
})

describe('getUptimeInfo', () => {
  const now = Date.parse('2026-07-30T12:00:00Z')

  it('reports uptime from bootTime', () => {
    expect(getUptimeInfo({ bootTime: '2026-07-29T12:00:00Z' }, now)).toEqual({
      mode: 'up',
      seconds: 86400,
      timestamp: '2026-07-29T12:00:00Z',
    })
  })

  it('prefers downSince over bootTime', () => {
    const info = getUptimeInfo(
      { bootTime: '2026-07-01T12:00:00Z', downSince: '2026-07-30T10:00:00Z' },
      now,
    )
    expect(info.mode).toBe('down')
    expect(info.seconds).toBe(7200)
  })

  it('reports nothing when neither timestamp is set', () => {
    expect(getUptimeInfo({}, now)).toEqual({ mode: null, seconds: null, timestamp: null })
    expect(getUptimeInfo(null, now)).toEqual({ mode: null, seconds: null, timestamp: null })
  })
})

describe('getPollSummary', () => {
  it('labels poll types and picks out the status poll', () => {
    const summary = getPollSummary({
      pollStates: [
        { name: 'status', pending: false, lastCompleted: '2026-07-30T11:59:00Z' },
        { name: 'routing', pending: true, lastCompleted: null },
      ],
    })
    expect(summary.status).toEqual({
      key: 'status',
      label: 'Status',
      pending: false,
      lastCompleted: '2026-07-30T11:59:00Z',
    })
    expect(summary.all.map((p) => p.label)).toEqual(['Status', 'Routing Table'])
  })

  it('falls back to the raw name for an unknown poll type', () => {
    const summary = getPollSummary({ pollStates: [{ name: 'brand-new' }] })
    expect(summary.all[0].label).toBe('brand-new')
    expect(summary.status).toBeNull()
  })

  it('returns null when the object has no poll states', () => {
    expect(getPollSummary({ pollStates: [] })).toBeNull()
    expect(getPollSummary({})).toBeNull()
    expect(getPollSummary(null)).toBeNull()
  })
})

describe('ipSortKey', () => {
  const sorted = (addresses) =>
    addresses
      .map((address) => ({ address }))
      .sort((a, b) => ipSortKey(a).localeCompare(ipSortKey(b)))
      .map((ip) => ip.address)

  it('orders IPv4 addresses numerically, not lexically', () => {
    expect(sorted(['10.0.0.1', '9.0.0.1', '100.0.0.1', '10.0.0.2'])).toEqual([
      '9.0.0.1',
      '10.0.0.1',
      '10.0.0.2',
      '100.0.0.1',
    ])
  })

  it('orders IPv6 addresses by expanded hextets', () => {
    expect(sorted(['2001:db8::10', '2001:db8::9', 'fe80::1'])).toEqual([
      '2001:db8::9',
      '2001:db8::10',
      'fe80::1',
    ])
  })

  it('expands :: in any position', () => {
    expect(ipSortKey({ address: '::1' })).toBe('0000:0000:0000:0000:0000:0000:0000:0001')
    expect(ipSortKey({ address: '2001:db8::' })).toBe('2001:0db8:0000:0000:0000:0000:0000:0000')
  })

  it('sorts IPv4 before IPv6', () => {
    expect(sorted(['fe80::1', '192.168.1.1'])).toEqual(['192.168.1.1', 'fe80::1'])
  })

  it('sorts missing addresses last', () => {
    expect(sorted(['10.0.0.1', undefined, '9.0.0.1'])).toEqual(['9.0.0.1', '10.0.0.1', undefined])
    expect(ipSortKey(null)).toBe(ipSortKey({}))
  })
})

describe('getDciCollectionErrorInfo', () => {
  it('returns the legacy marker text for each known reason', () => {
    expect(getDciCollectionErrorInfo('COMM_ERROR').text).toBe('<< COMM ERROR >>')
    expect(getDciCollectionErrorInfo('NOT_SUPPORTED').text).toBe('<< NOT SUPPORTED >>')
    expect(getDciCollectionErrorInfo('NO_SUCH_INSTANCE').text).toBe('<< NO SUCH INSTANCE >>')
    expect(getDciCollectionErrorInfo('ACCESS_DENIED').text).toBe('<< ACCESS DENIED >>')
    expect(getDciCollectionErrorInfo('INVALID_DATA').text).toBe('<< INVALID DATA >>')
  })

  it('marks invalid data as a warning and other reasons as errors', () => {
    expect(getDciCollectionErrorInfo('INVALID_DATA').severity).toBe('warn')
    expect(getDciCollectionErrorInfo('COMM_ERROR').severity).toBe('error')
    expect(getDciCollectionErrorInfo('COLLECTION_ERROR').severity).toBe('error')
  })

  it('falls back to the generic marker for unmapped, unknown and missing reasons', () => {
    // COLLECTION_ERROR / IGNORE / UNKNOWN have no dedicated text in the legacy client,
    // and servers older than the lastCollectionError field send nothing at all.
    expect(getDciCollectionErrorInfo('COLLECTION_ERROR').text).toBe('<< ERROR >>')
    expect(getDciCollectionErrorInfo('IGNORE').text).toBe('<< ERROR >>')
    expect(getDciCollectionErrorInfo('UNKNOWN').text).toBe('<< ERROR >>')
    expect(getDciCollectionErrorInfo(undefined).text).toBe('<< ERROR >>')
  })
})

describe('getDciSourceTypeLabel', () => {
  // DS_* in include/nxcldefs.h, and the names g_dciOriginNames (src/server/core/dcobject.cpp)
  // gives the config endpoint and data export.
  const ORIGINS = [
    [0, 'internal', 'Internal'],
    [1, 'agent', 'Agent'],
    [2, 'snmp', 'SNMP'],
    [3, 'websvc', 'Web Service'],
    [4, 'push', 'Push'],
    [5, 'winperf', 'WinPerf'],
    [6, 'smclp', 'SM-CLP'],
    [7, 'script', 'Script'],
    [8, 'ssh', 'SSH'],
    [9, 'mqtt', 'MQTT'],
    [10, 'driver', 'Device Driver'],
    [11, 'modbus', 'Modbus'],
    [12, 'ethernetip', 'EtherNet/IP'],
    [13, 'cloud', 'Cloud'],
    [14, 'otlp', 'OTLP'],
    [15, 'trafficobserver', 'Traffic Observer'],
    [16, 'netconf', 'NETCONF'],
    [17, 'computed', 'Computed'],
  ]

  it.each(ORIGINS)('labels DS_* %i and "%s" alike', (code, name, label) => {
    expect(getDciSourceTypeLabel(code)).toBe(label)
    expect(getDciSourceTypeLabel(name)).toBe(label)
  })

  // Older servers spell DS_NATIVE_AGENT "nxagent".
  it('labels the pre-rename agent origin', () => {
    expect(getDciSourceTypeLabel('nxagent')).toBe('Agent')
  })

  it('names an origin it does not know', () => {
    expect(getDciSourceTypeLabel(18)).toBe('Unknown (18)')
    expect(getDciSourceTypeLabel('quantum')).toBe('Unknown (quantum)')
  })
})

describe('getDciDataTypeLabel', () => {
  // DCI_DT_* in include/nms_common.h; current values send the code.
  it.each([
    [0, 'Int32'],
    [1, 'UInt32'],
    [2, 'Int64'],
    [3, 'UInt64'],
    [4, 'String'],
    [5, 'Float'],
    [6, 'Null'],
    [7, 'Counter32'],
    [8, 'Counter64'],
  ])('labels DCI_DT_* %i', (code, label) => {
    expect(getDciDataTypeLabel(code)).toBe(label)
  })
})
