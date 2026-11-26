// System views of the fixture nodes: 502 web-01 (Linux agent), 516 blade-01 (Windows agent with
// ENTITY-MIB), 522 fw-dmz-01 (SNMP only, ENTITY-MIB). Shaped as the WebAPI answers.

const LINUX_NODE = 502
const WINDOWS_NODE = 516
const FIREWALL_NODE = 522

const LINUX_PACKAGES = [
  ['adduser', '3.137ubuntu1', 'add and remove users and groups'],
  ['bash', '5.2.21-2ubuntu4', 'GNU Bourne Again SHell'],
  ['ca-certificates', '20240203', 'Common CA certificates'],
  ['curl', '8.5.0-2ubuntu10.6', 'command line tool for transferring data with URL syntax'],
  ['libssl3t64', '3.0.13-0ubuntu3.5', 'Secure Sockets Layer toolkit - shared libraries'],
  ['nginx', '1.24.0-2ubuntu7.3', 'small, powerful, scalable web/proxy server'],
  ['netxms-agent', '5.2.4-1', 'NetXMS agent'],
  ['openssh-server', '1:9.6p1-3ubuntu13.8', 'secure shell (SSH) server, for secure access'],
  ['postgresql-client-16', '16.6-0ubuntu0.24.04.1', 'front-end programs for PostgreSQL 16'],
  ['python3', '3.12.3-0ubuntu2', 'interactive high-level object-oriented language'],
  ['rsyslog', '8.2312.0-3ubuntu9', 'reliable system and kernel logging daemon'],
  ['systemd', '255.4-1ubuntu8.6', 'system and service manager'],
].map(([name, version, description]) => ({
  name,
  version,
  vendor: '',
  date: null,
  url: '',
  description,
  uninstallKey: `${name}:amd64`,
  user: null,
}))

const WINDOWS_PACKAGES = [
  ['7-Zip 24.08 (x64)', '24.08', 'Igor Pavlov', '2024-10-02', '7-Zip', 'https://www.7-zip.org/'],
  [
    'Microsoft Edge',
    '131.0.2903.51',
    'Microsoft Corporation',
    '2024-11-14',
    'Microsoft Edge',
    '',
  ],
  [
    'Microsoft SQL Server 2022 (64-bit)',
    '16.0.1000.6',
    'Microsoft Corporation',
    '2024-06-18',
    'Microsoft SQL Server SQL2022',
    'https://go.microsoft.com/fwlink/?LinkId=2194426',
  ],
  [
    'Microsoft Visual C++ 2015-2022 Redistributable (x64)',
    '14.40.33816.0',
    'Microsoft Corporation',
    '2024-05-27',
    '{5c7a8a51-6d35-4c1b-9a7a-1b5e6c0e3f21}',
    '',
  ],
  ['NetXMS Agent', '5.2.4', '', '2024-11-05', 'NetXMSAgent_is1', ''],
  ['Notepad++ (64-bit x64)', '8.7.1', 'Notepad++ Team', '2024-11-01', 'Notepad++', ''],
  [
    'PowerShell 7.4.6-x64',
    '7.4.6.0',
    'Microsoft Corporation',
    '2024-10-22',
    '{0F3BCE4F-8A2C-4A7E-8C1B-62B0DB2E9C11}',
    'https://github.com/PowerShell/PowerShell',
  ],
  ['VLC media player', '3.0.21', 'VideoLAN', '2024-06-10', 'VLC media player', ''],
].map(([name, version, vendor, date, uninstallKey, url]) => ({
  name,
  version,
  vendor,
  date: `${date}T00:00:00Z`,
  url,
  description: '',
  uninstallKey,
  user: name === 'VLC media player' ? 'alice' : '',
}))

const GIB = 1024 ** 3

function hardware(entries) {
  return entries.map(([category, index, type, vendor, model, capacity, serialNumber, location]) => ({
    category,
    index,
    type,
    vendor,
    model,
    location: location ?? '',
    capacity,
    partNumber: '',
    serialNumber,
    description: '',
  }))
}

const LINUX_HARDWARE = hardware([
  ['Baseboard', 0, 'Motherboard', 'Dell Inc.', '0H21J3', 0, '/7XKQ2Y2/CNFCW0024J01KT/'],
  ['Processor', 0, 'Central Processor', 'Intel', 'Xeon Silver 4314', 2400, '', 'CPU1'],
  ['Processor', 1, 'Central Processor', 'Intel', 'Xeon Silver 4314', 2400, '', 'CPU2'],
  ['Memory', 0, 'DDR4', 'Samsung', 'M393A4K40EB3-CWE', 32 * GIB, '41A0C2D7', 'A1'],
  ['Memory', 1, 'DDR4', 'Samsung', 'M393A4K40EB3-CWE', 32 * GIB, '41A0C2E1', 'B1'],
  ['Storage', 0, 'SSD', 'Samsung', 'MZ7L3480HCHQ', 480103981056, 'S6KNNE0T512345'],
  ['NetworkAdapter', 0, 'Ethernet', 'Broadcom', 'BCM57416 NetXtreme-E', 10000000000, ''],
  ['NetworkAdapter', 1, 'Ethernet', 'Broadcom', 'BCM57416 NetXtreme-E', 10000000000, ''],
])

const WINDOWS_HARDWARE = hardware([
  ['Baseboard', 0, 'Motherboard', 'HPE', 'ProLiant BL460c Gen10', 0, 'CZJ0450ABC'],
  ['Processor', 0, 'Central Processor', 'Intel', 'Xeon Gold 6248R', 3000, '', 'Proc 1'],
  ['Memory', 0, 'DDR4', 'HPE', 'P00924-B21', 64 * GIB, 'MEM-0001', 'PROC 1 DIMM 1'],
  ['Memory', 1, 'DDR4', 'HPE', 'P00924-B21', 64 * GIB, 'MEM-0002', 'PROC 1 DIMM 4'],
  ['Storage', 0, 'SSD', 'HPE', 'VK000960GWTTH', 960197124096, 'PHYF0123456'],
  ['Battery', 0, 'Smart Storage Battery', 'HPE', '875241-B21', 96000, 'BAT-77821'],
  ['NetworkAdapter', 0, 'Ethernet', 'HPE', 'FlexFabric 20Gb 2-port 650FLB', 20000000000, ''],
])

let nextComponent = 1
function component(cls, name, extra = {}, children = []) {
  return {
    index: nextComponent++,
    class: cls,
    position: 0,
    name,
    description: extra.description ?? '',
    model: extra.model ?? '',
    serialNumber: extra.serialNumber ?? '',
    vendor: extra.vendor ?? '',
    firmware: extra.firmware ?? '',
    interfaceIndex: extra.interfaceIndex ?? 0,
    interfaceName: extra.interfaceName ?? null,
    children,
  }
}

function ports(count, prefix, firstIfIndex) {
  return Array.from({ length: count }, (_, i) =>
    component('Port', `${prefix}${i + 1}`, {
      interfaceIndex: firstIfIndex + i,
      // The last port has no interface object.
      interfaceName: i < count - 1 ? `${prefix}${i + 1}` : null,
    }),
  )
}

const FIREWALL_TREE = component(
  'Chassis',
  'Chassis',
  { description: 'FortiGate 200F', model: 'FG-200F', serialNumber: 'FG200FT921900123', firmware: 'v7.4.5', vendor: 'Fortinet' },
  [
    component('PowerSupply', '', { description: 'Power Supply 1', serialNumber: 'PS-200F-0001' }),
    component('PowerSupply', '', { description: 'Power Supply 2', serialNumber: 'PS-200F-0002' }),
    component('Fan', 'Fan 1'),
    component('Fan', 'Fan 2'),
    component('Sensor', 'CPU Temperature'),
    component('Module', 'Internal Switch', { model: 'NP6XLite' }, ports(8, 'port', 3)),
    component('Module', 'SFP Slots', {}, ports(4, 'x', 11)),
  ],
)

const BLADE_TREE = component(
  'Chassis',
  'ProLiant BL460c Gen10',
  { model: 'BL460c Gen10', serialNumber: 'CZJ0450ABC', vendor: 'HPE', firmware: 'U41 v2.80' },
  [
    component('Module', 'System Board', { serialNumber: 'PWUKB0ARHAX123' }),
    component('CPU', 'Proc 1', { model: 'Xeon Gold 6248R' }),
    component('Module', 'FlexFabric 650FLB', { firmware: '14.28.1046' }, ports(2, 'LOM', 1)),
  ],
)

const PROCESS_COLUMNS = [
  'PID',
  'NAME',
  'USER',
  'THREADS',
  'HANDLES',
  'KTIME',
  'UTIME',
  'VMSIZE',
  'RSS',
  'MEMORY_USAGE',
  'PAGE_FAULTS',
  'CMDLINE',
]

// pid, name, user, threads, handles, cpu share (of one CPU), rss MiB, command line
const LINUX_PROCESSES = [
  [1, 'systemd', 'root', 1, 145, 0.002, 14, '/usr/lib/systemd/systemd --system'],
  [412, 'systemd-journal', 'root', 1, 40, 0.001, 22, '/usr/lib/systemd/systemd-journald'],
  [903, 'sshd', 'root', 1, 12, 0, 9, 'sshd: /usr/sbin/sshd -D [listener]'],
  [1021, 'nxagentd', 'root', 18, 64, 0.01, 31, '/usr/bin/nxagentd -d'],
  [1180, 'nginx', 'root', 1, 20, 0, 6, 'nginx: master process /usr/sbin/nginx'],
  [1181, 'nginx', 'www-data', 1, 48, 0.08, 18, 'nginx: worker process'],
  [1182, 'nginx', 'www-data', 1, 48, 0.07, 18, 'nginx: worker process'],
  [1183, 'nginx', 'www-data', 1, 48, 0.09, 19, 'nginx: worker process'],
  [1184, 'nginx', 'www-data', 1, 48, 0.06, 18, 'nginx: worker process'],
  [1402, 'rsyslogd', 'syslog', 4, 22, 0.001, 8, '/usr/sbin/rsyslogd -n -iNONE'],
  [2207, 'python3', 'deploy', 6, 31, 0.15, 212, 'python3 /opt/app/worker.py --queue=default'],
  [3310, 'bash', 'alice', 1, 5, 0, 5, '-bash'],
]

const WINDOWS_PROCESSES = [
  [4, 'System', 'SYSTEM', 220, 5400, 0.01, 1, ''],
  [612, 'smss.exe', 'SYSTEM', 2, 53, 0, 1, '\\SystemRoot\\System32\\smss.exe'],
  [880, 'services.exe', 'SYSTEM', 9, 780, 0.002, 12, 'C:\\Windows\\system32\\services.exe'],
  [1024, 'svchost.exe', 'NETWORK SERVICE', 14, 912, 0.01, 28, 'C:\\Windows\\system32\\svchost.exe -k NetworkService'],
  [1340, 'spoolsv.exe', 'SYSTEM', 11, 420, 0, 15, 'C:\\Windows\\System32\\spoolsv.exe'],
  [2050, 'sqlservr.exe', 'NT SERVICE\\MSSQL$SQL2022', 84, 1830, 0.4, 2310, '"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQL2022\\MSSQL\\Binn\\sqlservr.exe" -sSQL2022'],
  [2240, 'nxagentd.exe', 'SYSTEM', 21, 310, 0.01, 34, '"C:\\NetXMS\\bin\\nxagentd.exe" -d'],
  [3120, 'explorer.exe', 'BLADE-01\\alice', 76, 2900, 0.02, 120, 'C:\\Windows\\Explorer.EXE'],
  [3388, 'nxsagent.exe', 'BLADE-01\\alice', 4, 120, 0, 9, '"C:\\NetXMS\\bin\\nxsagent.exe"'],
  [4410, 'msedge.exe', 'BLADE-01\\alice', 38, 1240, 0.05, 340, '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"'],
]

const STARTED_AT = Date.now()

/** CPU times grow with the clock, so two reads a few seconds apart give a CPU %. */
function processTable(processes) {
  const elapsed = Date.now() - STARTED_AT + 3600000
  return {
    columns: PROCESS_COLUMNS.map((name) => ({ name, displayName: name, dataType: 4 })),
    data: processes.map(([pid, name, user, threads, handles, share, rssMiB, cmdLine]) => {
      const busy = Math.round(elapsed * share)
      const rss = rssMiB * 1024 * 1024
      const values = [
        pid,
        name,
        user,
        threads,
        handles,
        Math.round(busy * 0.3),
        busy - Math.round(busy * 0.3),
        rss * 3,
        rss,
        ((rssMiB / 65536) * 100).toFixed(2),
        pid * 37,
        cmdLine,
      ]
      return { values: values.map((value) => ({ value: String(value) })) }
    }),
  }
}

const SERVICE_COLUMNS = [
  'NAME',
  'DISPNAME',
  'TYPE',
  'STATE',
  'STARTUP',
  'PID',
  'BINARY',
  'RUN_AS',
  'DEPENDENCIES',
]

const WINDOWS_SERVICES = [
  ['Dhcp', 'DHCP Client', 'Shared', 'Running', 'Automatic', 1024, 'C:\\Windows\\system32\\svchost.exe -k LocalServiceNetworkRestricted -p', 'NT Authority\\LocalService', 'NSI,Afd'],
  ['Dnscache', 'DNS Client', 'Shared', 'Running', 'Automatic', 1024, 'C:\\Windows\\system32\\svchost.exe -k NetworkService -p', 'NT AUTHORITY\\NetworkService', 'nsi'],
  ['EventLog', 'Windows Event Log', 'Shared', 'Running', 'Automatic', 1024, 'C:\\Windows\\System32\\svchost.exe -k LocalServiceNetworkRestricted -p', 'NT AUTHORITY\\LocalService', ''],
  ['MSSQL$SQL2022', 'SQL Server (SQL2022)', 'Own', 'Running', 'Automatic', 2050, '"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQL2022\\MSSQL\\Binn\\sqlservr.exe" -sSQL2022', 'NT Service\\MSSQL$SQL2022', 'KEYISO'],
  ['NetXMSAgentdW32', 'NetXMS Agent', 'Own', 'Running', 'Automatic', 2240, '"C:\\NetXMS\\bin\\nxagentd.exe" -d', 'LocalSystem', ''],
  ['Spooler', 'Print Spooler', 'Own', 'Running', 'Automatic', 1340, 'C:\\Windows\\System32\\spoolsv.exe', 'LocalSystem', 'RPCSS,http'],
  ['SQLAgent$SQL2022', 'SQL Server Agent (SQL2022)', 'Own', 'Stopped', 'Manual', 0, '"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQL2022\\MSSQL\\Binn\\SQLAGENT.EXE" -i SQL2022', 'NT Service\\SQLAgent$SQL2022', 'MSSQL$SQL2022'],
  ['W32Time', 'Windows Time', 'Shared', 'Running', 'Manual', 1024, 'C:\\Windows\\system32\\svchost.exe -k LocalService', 'NT AUTHORITY\\LocalService', ''],
  ['wuauserv', 'Windows Update', 'Shared', 'Stopped', 'Manual', 0, 'C:\\Windows\\system32\\svchost.exe -k netsvcs -p', 'LocalSystem', 'rpcss'],
  ['XblGameSave', 'Xbox Live Game Save', 'Shared', 'Stopped', 'Disabled', 0, 'C:\\Windows\\system32\\svchost.exe -k netsvcs -p', 'LocalSystem', 'UserManager,XblAuthManager'],
]

function serviceTable(services) {
  return {
    columns: SERVICE_COLUMNS.map((name) => ({ name, displayName: name, dataType: 4 })),
    data: services.map((values) => ({ values: values.map((value) => ({ value: String(value) })) })),
  }
}

const WINDOWS_SESSIONS = [
  {
    id: 1,
    loginName: 'alice',
    sessionName: 'Console',
    terminal: 'Console',
    state: 'Active',
    connected: true,
    clientName: '',
    clientAddress: null,
    display: { width: 1920, height: 1080, colorDepth: 32 },
    connectTime: '2026-11-23T07:58:12Z',
    loginTime: '2026-11-23T07:58:20Z',
    idleTime: 0,
    sessionAgent: { type: 'session', pid: 3388 },
  },
  {
    id: 2,
    loginName: 'svc-backup',
    sessionName: null,
    terminal: 'RDP-Tcp#4',
    state: 'Disconnected',
    connected: false,
    clientName: 'ADMIN-WS-07',
    clientAddress: { family: 2, address: '10.20.4.37', prefixLength: 32 },
    display: null,
    connectTime: '2026-11-22T21:14:03Z',
    loginTime: '2026-11-22T21:14:09Z',
    idleTime: 38400,
    sessionAgent: null,
  },
  {
    id: 3,
    loginName: 'bob',
    sessionName: 'RDP-Tcp#7',
    terminal: 'RDP-Tcp#7',
    state: 'Active',
    connected: true,
    clientName: 'LAPTOP-BOB',
    clientAddress: { family: 2, address: '10.20.6.112', prefixLength: 32 },
    display: { width: 2560, height: 1440, colorDepth: 32 },
    connectTime: '2026-11-23T09:02:44Z',
    loginTime: '2026-11-23T09:02:51Z',
    idleTime: 420,
    sessionAgent: { type: 'user', pid: 5120 },
  },
]

const LINUX_SESSIONS = [
  {
    id: 1,
    loginName: 'alice',
    sessionName: null,
    terminal: 'pts/0',
    state: 'Active',
    connected: true,
    clientName: '10.20.4.37',
    clientAddress: { family: 2, address: '10.20.4.37', prefixLength: 32 },
    display: null,
    connectTime: null,
    loginTime: '2026-11-23T08:41:00Z',
    idleTime: 0,
    sessionAgent: null,
  },
]

export const SOFTWARE = { [LINUX_NODE]: LINUX_PACKAGES, [WINDOWS_NODE]: WINDOWS_PACKAGES }
export const HARDWARE = { [LINUX_NODE]: LINUX_HARDWARE, [WINDOWS_NODE]: WINDOWS_HARDWARE }
export const COMPONENT_TREES = { [WINDOWS_NODE]: BLADE_TREE, [FIREWALL_NODE]: FIREWALL_TREE }
export const SESSIONS = { [LINUX_NODE]: LINUX_SESSIONS, [WINDOWS_NODE]: WINDOWS_SESSIONS }
export const CPU_COUNTS = { [LINUX_NODE]: 4, [WINDOWS_NODE]: 8 }

export function processesFor(nodeId) {
  if (nodeId === LINUX_NODE) return processTable(LINUX_PROCESSES)
  if (nodeId === WINDOWS_NODE) return processTable(WINDOWS_PROCESSES)
  return null
}

export function servicesFor(nodeId) {
  return nodeId === WINDOWS_NODE ? serviceTable(WINDOWS_SERVICES) : null
}

/** The node id of a `/v1/objects/{id}/...` request. */
export function nodeIdOf(req) {
  return Number(new URL(req.url, 'http://mock').pathname.split('/')[3])
}
