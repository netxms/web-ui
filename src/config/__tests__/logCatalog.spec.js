import { describe, it, expect } from 'vitest'
import {
  getLogCatalogEntry,
  getLogLabel,
  getMessageColumn,
  getObjectApplicableLogs,
  groupLogsByFamily,
  humanizeLogName,
} from '../logCatalog'

const log = (name, objectIdColumn = null) => ({ name, objectIdColumn })

describe('getLogCatalogEntry', () => {
  it('uses the legacy client titles for the built-in logs', () => {
    expect(getLogLabel('syslog')).toBe('Syslog')
    expect(getLogLabel('SnmpTrapLog')).toBe('SNMP Traps')
    expect(getLogLabel('ServerActionExecutionLog')).toBe('Server Action Executions')
    expect(getLogLabel('AuditLog')).toBe('Audit')
  })

  it('synthesises an entry for a log contributed by a server module', () => {
    const entry = getLogCatalogEntry('MyModuleAuditTrail')
    expect(entry.label).toBe('My Module Audit Trail')
    expect(entry.family).toBe('other')
    expect(entry.icon).toBeTruthy()
  })
})

describe('humanizeLogName', () => {
  it('splits camel case, including acronym runs', () => {
    expect(humanizeLogName('SnmpTrapLog')).toBe('Snmp Trap Log')
    expect(humanizeLogName('AIOperatorObservations')).toBe('AI Operator Observations')
    expect(humanizeLogName('syslog')).toBe('Syslog')
    expect(humanizeLogName('')).toBe('')
  })
})

describe('groupLogsByFamily', () => {
  it('groups in family order and drops empty families', () => {
    const groups = groupLogsByFamily([log('AuditLog'), log('syslog'), log('EventLog')])
    expect(groups.map((g) => g.id)).toEqual(['events', 'audit'])
    expect(groups[0].logs.map((l) => l.name)).toEqual(['EventLog', 'syslog'])
  })

  it('sorts inside a family by display label, not by raw name', () => {
    const [events] = groupLogsByFamily([log('syslog'), log('AlarmLog'), log('EventLog')])
    expect(events.logs.map((l) => getLogLabel(l.name))).toEqual(['Alarms', 'Events', 'Syslog'])
  })

  it('puts an unknown log in Other rather than dropping it', () => {
    const groups = groupLogsByFamily([log('SomeModuleLog')])
    expect(groups.map((g) => g.id)).toEqual(['other'])
  })

  it('handles no logs at all', () => {
    expect(groupLogsByFamily([])).toEqual([])
    expect(groupLogsByFamily(undefined)).toEqual([])
  })
})

describe('getObjectApplicableLogs', () => {
  const node = { class: 'Node', platformName: 'Linux 6.8' }
  const windowsNode = { class: 'Node', platformName: 'windows-x64' }
  const container = { class: 'Container' }
  const dashboard = { class: 'Dashboard' }

  const all = [
    log('syslog', 'source_object_id'),
    log('AuditLog', 'object_id'),
    log('WindowsEventLog', 'node_id'),
    log('ConnectionHistory', 'switch_id'),
    // No related-object column, so it can never be object-scoped.
    log('NotificationLog', null),
  ]

  it('excludes logs with no related-object column', () => {
    expect(getObjectApplicableLogs(all, node).map((l) => l.name)).not.toContain('NotificationLog')
  })

  it('offers syslog and audit on a node', () => {
    const names = getObjectApplicableLogs(all, node).map((l) => l.name)
    expect(names).toContain('syslog')
    expect(names).toContain('AuditLog')
  })

  it('offers Windows events only on Windows nodes and containers', () => {
    expect(getObjectApplicableLogs(all, node).map((l) => l.name)).not.toContain('WindowsEventLog')
    expect(getObjectApplicableLogs(all, windowsNode).map((l) => l.name)).toContain(
      'WindowsEventLog',
    )
    expect(getObjectApplicableLogs(all, container).map((l) => l.name)).toContain('WindowsEventLog')
  })

  it('offers connection history only on bridges', () => {
    expect(getObjectApplicableLogs(all, node).map((l) => l.name)).not.toContain('ConnectionHistory')
    const bridge = { class: 'Node', capabilities: { isBridge: true } }
    expect(getObjectApplicableLogs(all, bridge).map((l) => l.name)).toContain('ConnectionHistory')
  })

  it('offers audit on every class, unlike the rest', () => {
    expect(getObjectApplicableLogs(all, dashboard).map((l) => l.name)).toEqual(['AuditLog'])
  })

  it('returns nothing without an object', () => {
    expect(getObjectApplicableLogs(all, null)).toEqual([])
  })
})

describe('getMessageColumn', () => {
  const columns = (...names) =>
    names.map((name) => ({ name, description: name, type: 'text', detail: false }))

  it('uses the configured column for the known stream logs', () => {
    const syslog = [
      { name: 'hostname', description: 'Host', type: 'text', detail: false },
      { name: 'msg_text', description: 'Text', type: 'text', detail: false },
      { name: 'msg_sd', description: 'Structured Data', type: 'text', detail: false },
    ]
    // The last text column is Structured Data, which is not the payload.
    expect(getMessageColumn('syslog', syslog).name).toBe('msg_text')
  })

  it('picks the alarm message, not the event processing rule description', () => {
    // AlarmLog carries both.
    const alarm = [
      { name: 'message', description: 'Message', type: 'text', detail: false },
      { name: 'rule_guid', description: 'Rule', type: 'text', detail: false },
      { name: 'rule_description', description: 'Rule Description', type: 'text', detail: false },
      { name: 'alarm_key', description: 'Key', type: 'text', detail: false },
      { name: 'event_tags', description: 'Event Tags', type: 'text', detail: false },
    ]
    expect(getMessageColumn('AlarmLog', alarm).name).toBe('message')
  })

  it('picks the payload column for each stream log', () => {
    const column = (name) => ({ name, description: name, type: 'text', detail: false })
    expect(getMessageColumn('EventLog', [column('event_message'), column('event_tags')]).name).toBe(
      'event_message',
    )
    expect(
      getMessageColumn('OpenTelemetryLog', [
        column('service_name'),
        column('severity_text'),
        column('body'),
      ]).name,
    ).toBe('body')
    expect(
      getMessageColumn('SnmpTrapLog', [
        column('ip_addr'),
        column('trap_oid'),
        column('trap_varlist'),
      ]).name,
    ).toBe('trap_varlist')
  })

  it('falls back to a name heuristic for an unconfigured log', () => {
    expect(getMessageColumn('SomeModuleLog', columns('host', 'description', 'tag')).name).toBe(
      'description',
    )
  })

  it('falls back to the last text column when nothing looks like a payload', () => {
    expect(getMessageColumn('SomeModuleLog', columns('a', 'b', 'c')).name).toBe('c')
  })

  it('ignores detail columns and non-text columns', () => {
    const cols = [
      { name: 'ts', description: 'Time', type: 'timestamp', detail: false },
      { name: 'message', description: 'Message', type: 'text', detail: false },
      { name: 'raw_data', description: 'Raw data', type: 'textDetails', detail: true },
    ]
    expect(getMessageColumn('WindowsEventLog', cols).name).toBe('message')
  })

  it('returns null when a log has no text column at all', () => {
    expect(getMessageColumn('syslog', [{ name: 'id', type: 'integer', detail: false }])).toBeNull()
    expect(getMessageColumn('syslog', [])).toBeNull()
  })
})
