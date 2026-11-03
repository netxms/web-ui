import { describe, it, expect } from 'vitest'
import { buildLogFilterDefs } from '../logFilterDefs'

/** syslog schema, transcribed from `s_logs[]` in the server's core/logs.cpp. */
const syslogColumns = [
  { name: 'msg_timestamp', description: 'Time', type: 'timestamp', recordId: false, detail: false },
  {
    name: 'source_object_id',
    description: 'Source',
    type: 'objectId',
    recordId: false,
    detail: false,
  },
  { name: 'zone_uin', description: 'Zone', type: 'zoneUIN', recordId: false, detail: false },
  { name: 'facility', description: 'Facility', type: 'integer', recordId: false, detail: false },
  { name: 'severity', description: 'Severity', type: 'integer', recordId: false, detail: false },
  { name: 'hostname', description: 'Host', type: 'text', recordId: false, detail: false },
  { name: 'msg_tag', description: 'Tag', type: 'text', recordId: false, detail: false },
  { name: 'msg_text', description: 'Text', type: 'text', recordId: false, detail: false },
]

const alarmColumns = [
  { name: 'alarm_state', description: 'State', type: 'alarmState', recordId: false, detail: false },
  {
    name: 'current_severity',
    description: 'Severity',
    type: 'severity',
    recordId: false,
    detail: false,
  },
  {
    name: 'creation_time',
    description: 'Created',
    type: 'timestamp',
    recordId: false,
    detail: false,
  },
  { name: 'message', description: 'Message', type: 'text', recordId: false, detail: false },
  { name: 'ack_by', description: 'Ack by', type: 'userId', recordId: false, detail: false },
]

describe('buildLogFilterDefs', () => {
  it('offers text columns as free-text keys, keyed by raw column name', () => {
    const defs = buildLogFilterDefs(syslogColumns)
    expect(defs.map((d) => d.key)).toEqual(['hostname', 'msg_tag', 'msg_text'])
    expect(defs[0]).toMatchObject({ key: 'hostname', label: 'Host', type: 'text' })
  })

  it('excludes the primary time column, which the time range control owns', () => {
    expect(buildLogFilterDefs(syslogColumns).map((d) => d.key)).not.toContain('msg_timestamp')
    expect(buildLogFilterDefs(alarmColumns).map((d) => d.key)).not.toContain('creation_time')
  })

  it('excludes columns that need a picker, since they cannot be typed unambiguously', () => {
    const keys = buildLogFilterDefs(syslogColumns).map((d) => d.key)
    expect(keys).not.toContain('source_object_id')
    expect(keys).not.toContain('zone_uin')
    expect(keys).not.toContain('facility')
    expect(buildLogFilterDefs(alarmColumns).map((d) => d.key)).not.toContain('ack_by')
  })

  it('offers coded columns as enums labelled with their code table', () => {
    const defs = buildLogFilterDefs(alarmColumns)
    expect(defs.find((d) => d.key === 'alarm_state')).toEqual({
      key: 'alarm_state',
      label: 'State',
      description: 'Filter by state',
      type: 'enum',
      options: ['Outstanding', 'Acknowledged', 'Resolved', 'Terminated'],
    })
    expect(defs.find((d) => d.key === 'current_severity').options).toEqual([
      'Normal',
      'Warning',
      'Minor',
      'Major',
      'Critical',
    ])
  })

  it('excludes detail columns, which query results never contain', () => {
    const defs = buildLogFilterDefs([
      { name: 'message', description: 'Message', type: 'text', detail: false },
      { name: 'raw_data', description: 'Raw data', type: 'textDetails', detail: true },
    ])
    expect(defs.map((d) => d.key)).toEqual(['message'])
  })

  it('handles an empty or missing schema', () => {
    expect(buildLogFilterDefs([])).toEqual([])
    expect(buildLogFilterDefs(undefined)).toEqual([])
  })
})
