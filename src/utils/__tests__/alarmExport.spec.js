// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  alarmAssistantPrompt,
  alarmExportRows,
  alarmMessagesAsText,
  alarmsAsText,
} from '@/utils/alarmExport'
import { formatDateTime } from '@/utils/timeFormat'

const alarms = [
  {
    id: 7,
    severity: 4,
    state: 0,
    source: 10,
    sourceName: 'core-switch',
    zoneUIN: 2,
    message: 'Node down',
    repeatCount: 3,
    commentCount: 1,
    helpdeskReference: 'HD-1',
    ackByUserName: '',
    resolvedByUserName: 'operator',
    creationTime: '2026-11-04T08:00:00Z',
    lastChangeTime: '2026-11-04T09:30:00Z',
  },
  {
    id: 8,
    severity: 2,
    state: 1,
    source: 11,
    sourceName: 'edge-router',
    zoneUIN: 0,
    message: 'Link flapping',
    repeatCount: 1,
    commentCount: 0,
    helpdeskReference: '',
    ackByUserName: 'admin',
    resolvedByUserName: '',
    creationTime: '2026-11-03T08:00:00Z',
    lastChangeTime: '2026-11-03T08:00:00Z',
  },
]

const names = {
  sourceName: (alarm) => alarm.sourceName,
  zoneName: (alarm) => (alarm.zoneUIN === 2 ? 'Branch' : null),
}

describe('alarmsAsText', () => {
  it('writes one severity, source and message line per alarm, as the legacy client copies', () => {
    expect(alarmsAsText(alarms, names)).toBe(
      '[Critical]\tcore-switch\tNode down\n[Minor]\tedge-router\tLink flapping',
    )
  })
})

describe('alarmMessagesAsText', () => {
  it('writes one message per line', () => {
    expect(alarmMessagesAsText(alarms)).toBe('Node down\nLink flapping')
  })
})

describe('alarmExportRows', () => {
  const columns = (...ids) => ids.map((id) => ({ id, label: id }))

  it('spells out severity and state, which the table can collapse to icons', () => {
    const [row] = alarmExportRows(alarms, columns('severity', 'state'), names)
    expect(row).toEqual({ severity: 'Critical', state: 'Outstanding' })
  })

  it('resolves the source and zone names', () => {
    const rows = alarmExportRows(alarms, columns('source', 'zone'), names)
    expect(rows[0]).toEqual({ source: 'core-switch', zone: 'Branch' })
    expect(rows[1]).toEqual({ source: 'edge-router', zone: '' })
  })

  it('takes the numbers and the helpdesk reference as they are', () => {
    const [row] = alarmExportRows(
      alarms,
      columns('repeatCount', 'comments', 'helpdeskReference'),
      names,
    )
    expect(row).toEqual({ repeatCount: 3, comments: 1, helpdeskReference: 'HD-1' })
  })

  it('names whoever resolved the alarm, or else acknowledged it', () => {
    const rows = alarmExportRows(alarms, columns('ackResolveBy'), names)
    expect(rows.map((row) => row.ackResolveBy)).toEqual(['operator', 'admin'])
  })

  it('writes full dates: the short table form has no year', () => {
    const [row] = alarmExportRows(alarms, columns('created', 'lastChangeTime'), names)
    expect(row).toEqual({
      created: formatDateTime('2026-11-04T08:00:00Z'),
      lastChangeTime: formatDateTime('2026-11-04T09:30:00Z'),
    })
  })
})

describe('alarmAssistantPrompt', () => {
  it('carries what the assistant needs to look the alarm up', () => {
    const prompt = alarmAssistantPrompt(alarms[0], 'core-switch')
    expect(prompt).toContain('Alarm ID: 7')
    expect(prompt).toContain('Source object name: core-switch')
    expect(prompt).toContain('Source object ID: 10')
    expect(prompt).toContain('Severity: Critical')
    expect(prompt).toContain('Message: Node down')
  })
})
