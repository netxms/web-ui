import { describe, it, expect } from 'vitest'
import {
  assetsBySerial,
  componentAssetQuery,
  flattenComponentTree,
  formatHardwareCapacity,
  processRows,
  serviceRows,
  toHardwareRow,
  toSessionRow,
  toSoftwareRow,
  visibleTreeRows,
} from '@/utils/nodeInventory'

/** The formatter separates the multiplier with a thin space. */
const plain = (text) => text?.replace(/\s/g, ' ')

function table(columns, data) {
  return {
    columns: columns.map((name) => ({ name })),
    data: data.map((values) => ({ values: values.map((value) => ({ value: String(value) })) })),
  }
}

describe('toSoftwareRow', () => {
  it('maps a package and keeps its uninstall key', () => {
    const row = toSoftwareRow(
      {
        name: '7-Zip 19.00',
        version: '19.00',
        vendor: 'Igor Pavlov',
        date: '2024-03-01T00:00:00Z',
        url: '',
        description: '',
        uninstallKey: '7-Zip',
        user: '',
      },
      3,
    )
    expect(row).toMatchObject({
      id: 3,
      name: '7-Zip 19.00',
      vendor: 'Igor Pavlov',
      url: null,
      description: null,
      user: null,
      uninstallKey: '7-Zip',
      dateSort: Date.parse('2024-03-01T00:00:00Z'),
    })
    expect(row.date).toBeTruthy()
  })

  it('leaves a missing install date empty', () => {
    const row = toSoftwareRow({ name: 'adduser', date: null }, 0)
    expect(row.date).toBeNull()
    expect(row.dateSort).toBeNull()
  })
})

describe('formatHardwareCapacity', () => {
  it('formats by category as legacy does', () => {
    expect(plain(formatHardwareCapacity('Memory', 17179869184))).toBe('16 GiB')
    expect(plain(formatHardwareCapacity('NetworkAdapter', 1000000000))).toBe('1 Gbps')
    expect(plain(formatHardwareCapacity('Processor', 2400))).toBe('2.4 GHz')
    expect(formatHardwareCapacity('Battery', 52000)).toBe('52000 mWh')
  })

  it('shows nothing for categories without a capacity', () => {
    expect(formatHardwareCapacity('Baseboard', 0)).toBeNull()
    expect(formatHardwareCapacity('Other', 5)).toBeNull()
  })
})

describe('toHardwareRow', () => {
  it('labels the category, sorts by category then index, and finds the asset', () => {
    const assets = new Map([['SN1', { id: 900, name: 'DIMM asset' }]])
    const row = toHardwareRow(
      { category: 'Memory', index: 2, capacity: 8589934592, serialNumber: 'SN1', model: 'X' },
      0,
      assets,
    )
    expect(row.category).toBe('Memory device')
    expect(row.categorySort).toBe(3 * 1e6 + 2)
    expect(plain(row.capacity)).toBe('8 GiB')
    expect(row.capacitySort).toBe(8589934592)
    expect(row.asset).toBe('DIMM asset')
    expect(row.assetId).toBe(900)
  })

  it('has no asset for a component without a serial number', () => {
    const row = toHardwareRow({ category: 'Processor', index: 0, serialNumber: '' }, 0)
    expect(row.serial).toBeNull()
    expect(row.asset).toBeNull()
  })
})

const TREE = {
  index: 1,
  class: 'Chassis',
  name: 'Chassis',
  children: [
    {
      index: 2,
      class: 'PowerSupply',
      name: '',
      description: 'PSU 1',
      serialNumber: 'PSU-SN',
      children: [],
    },
    {
      index: 3,
      class: 'Module',
      name: 'Slot 1',
      children: [
        { index: 10, class: 'Port', name: 'Gi1/0/1', interfaceIndex: 5, interfaceName: 'Gi1/0/1' },
        { index: 11, class: 'Port', name: '', description: '', interfaceIndex: 6 },
      ],
    },
  ],
}

describe('flattenComponentTree', () => {
  it('lists components depth first with their ancestors', () => {
    const rows = flattenComponentTree(TREE)
    expect(rows.map((r) => [r.id, r.depth, r.ancestors])).toEqual([
      [1, 0, []],
      [2, 1, [1]],
      [3, 1, [1]],
      [10, 2, [1, 3]],
      [11, 2, [1, 3]],
    ])
  })

  it('names components as legacy and labels classes', () => {
    const rows = flattenComponentTree(TREE, new Map([['PSU-SN', { id: 7, name: 'PSU asset' }]]))
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(2).name).toBe('PSU 1')
    expect(byId.get(2).class).toBe('Power Supply')
    expect(byId.get(2).asset).toBe('PSU asset')
    expect(byId.get(11).name).toBe('[11]')
    expect(byId.get(11).interface).toBe('[6]')
    expect(byId.get(10).interface).toBe('Gi1/0/1')
    expect(byId.get(3).hasChildren).toBe(true)
    expect(byId.get(10).hasChildren).toBe(false)
  })

  it('is empty without a tree', () => {
    expect(flattenComponentTree(null)).toEqual([])
  })
})

describe('visibleTreeRows', () => {
  const rows = flattenComponentTree(TREE)

  it('hides the descendants of collapsed rows', () => {
    expect(visibleTreeRows(rows, new Set([3]), null).map((r) => r.id)).toEqual([1, 2, 3])
    expect(visibleTreeRows(rows, new Set([1]), null).map((r) => r.id)).toEqual([1])
  })

  it('shows matches with their ancestors, collapsed or not', () => {
    const matches = (row) => row.name.includes('Gi1/0/1')
    expect(visibleTreeRows(rows, new Set([1, 3]), matches).map((r) => r.id)).toEqual([1, 3, 10])
  })
})

describe('component assets', () => {
  it('queries the assets linked to the node by component serial', () => {
    const query = componentAssetQuery(813)
    expect(query).toContain('type != ASSET')
    expect(query).toContain('$object->linkedObjectId == 813')
  })

  it('keys query results by serial number', () => {
    const map = assetsBySerial([
      { object: { id: 900, name: 'sw-core' }, fields: { serial: 'ABC' } },
      { object: { id: 901, name: 'no serial' }, fields: { serial: '' } },
    ])
    expect([...map.entries()]).toEqual([['ABC', { id: 900, name: 'sw-core' }]])
    expect(assetsBySerial(null).size).toBe(0)
  })
})

const PROCESS_COLUMNS = ['PID', 'NAME', 'USER', 'KTIME', 'UTIME', 'VMSIZE', 'RSS', 'MEMORY_USAGE']

describe('processRows', () => {
  const first = table(PROCESS_COLUMNS, [
    [1, 'systemd', 'root', 1000, 1000, 23121920, 14155776, 0.34],
    [42, 'nginx', 'www', 500, 500, 1048576, 524288, 1.5],
  ])

  it('leaves CPU empty on the first sample', () => {
    const { rows, sample } = processRows(first, null, 2, 10000)
    expect(rows[0]).toMatchObject({ id: 1, pid: 1, name: 'systemd', cpu: null, memory: '0.34' })
    expect(plain(rows[0].vmSize)).toBe('22.05 MiB')
    expect(rows[0].vmSizeSort).toBe(23121920)
    expect(sample.cpuTimes.get(42)).toBe(1000)
  })

  it('computes CPU % from the time used since the previous sample over all CPUs', () => {
    const { sample } = processRows(first, null, 2, 10000)
    const second = table(PROCESS_COLUMNS, [
      [1, 'systemd', 'root', 1100, 1100, 0, 0, 0],
      [42, 'nginx', 'www', 1500, 1500, 0, 0, 0],
      [77, 'new', 'root', 50, 50, 0, 0, 0],
    ])
    const { rows } = processRows(second, sample, 2, 15000)
    // 200 ms of 5000 ms x 2 CPUs; 2000 ms of 10000 ms.
    expect(rows.map((r) => r.cpu)).toEqual(['2.00', '20.00', null])
    expect(rows[1].cpuSort).toBeCloseTo(20)
  })

  it('reads columns by name, whatever their order', () => {
    const reordered = table(['NAME', 'PID'], [['init', 1]])
    expect(processRows(reordered, null, 1, 0).rows[0]).toMatchObject({ pid: 1, name: 'init' })
  })
})

describe('serviceRows', () => {
  it('maps the agent table and blanks the PID of a stopped service', () => {
    const rows = serviceRows(
      table(
        ['NAME', 'DISPNAME', 'STATE', 'PID', 'STARTUP', 'BINARY'],
        [
          ['Spooler', 'Print Spooler', 'Running', 1234, 'Automatic', 'C:\\spoolsv.exe'],
          ['wuauserv', 'Windows Update', 'Stopped', 0, 'Manual', 'svchost.exe'],
        ],
      ),
    )
    expect(rows[0]).toMatchObject({
      id: 'Spooler',
      displayName: 'Print Spooler',
      pid: 1234,
      commandLine: 'C:\\spoolsv.exe',
      runAs: null,
    })
    expect(rows[1].pid).toBeNull()
    expect(rows[1].pidSort).toBe(0)
  })

  it('is empty without a table', () => {
    expect(serviceRows(null)).toEqual([])
  })
})

describe('toSessionRow', () => {
  const session = {
    id: 2,
    loginName: 'alice',
    sessionName: 'RDP-Tcp#3',
    terminal: 'RDP-Tcp#3',
    state: 'Active',
    connected: true,
    clientName: 'LAPTOP-7',
    clientAddress: { family: 2, address: '10.0.0.15', prefixLength: 32 },
    display: { width: 1920, height: 1080, colorDepth: 32 },
    connectTime: '2026-11-20T08:00:00Z',
    loginTime: '2026-11-20T08:00:05Z',
    idleTime: 90,
    sessionAgent: { type: 'session', pid: 4400 },
  }

  it('maps a session with a session agent', () => {
    const row = toSessionRow(session)
    expect(row).toMatchObject({
      id: 2,
      user: 'alice',
      state: 'Active',
      clientAddress: '10.0.0.15',
      display: '1920x1080x32',
      idleTime: '1m',
      agentType: 'session',
      agentPid: 4400,
      screenshotSession: 'RDP-Tcp#3',
      hasSessionAgent: true,
    })
    expect(row.loginTime).toBeTruthy()
  })

  it('falls back to the connected flag and the terminal as legacy does', () => {
    const row = toSessionRow({
      ...session,
      state: null,
      connected: false,
      sessionName: null,
      terminal: 'console',
      clientAddress: { family: 2, address: '0.0.0.0' },
      display: null,
      idleTime: 0,
      sessionAgent: null,
    })
    expect(row).toMatchObject({
      state: 'Disconnected',
      clientAddress: null,
      display: null,
      idleTime: null,
      agentType: 'none',
      agentPid: null,
      screenshotSession: 'console',
      hasSessionAgent: false,
    })
  })
})
