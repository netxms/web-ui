import { describe, it, expect } from 'vitest'
import {
  COLUMN_KIND,
  LOG_COLUMN_TYPE,
  LOG_FILTER_TYPE,
  getCodedLabel,
  getCodedOptions,
  getColumnKind,
  getColumnLabel,
  getDefaultOperator,
  getOperatorsForType,
  getPrimaryTimeColumn,
  getResultColumns,
  getSeverityDisplay,
  getStreamMetaColumns,
} from '../logColumnTypes'

const API_FILTER_TYPES = new Set(Object.values(LOG_FILTER_TYPE))

describe('getColumnKind', () => {
  it('maps every coded type to the coded kind', () => {
    for (const type of [
      LOG_COLUMN_TYPE.ALARM_STATE,
      LOG_COLUMN_TYPE.ALARM_HELPDESK_STATE,
      LOG_COLUMN_TYPE.EVENT_ORIGIN,
      LOG_COLUMN_TYPE.COMPLETION_STATUS,
      LOG_COLUMN_TYPE.ASSET_OPERATION,
      LOG_COLUMN_TYPE.DEPLOYMENT_STATUS,
      LOG_COLUMN_TYPE.AI_TASK_STATUS,
      LOG_COLUMN_TYPE.CONNECTION_EVENT,
      LOG_COLUMN_TYPE.AI_OPERATOR_EXECUTION_STATUS,
      LOG_COLUMN_TYPE.OBSERVATION_STATE,
    ]) {
      expect(getColumnKind(type)).toBe(COLUMN_KIND.CODED)
    }
  })

  it('falls back to text for a type this client does not know', () => {
    expect(getColumnKind('somethingFromAFutureServer')).toBe(COLUMN_KIND.TEXT)
    expect(getColumnKind(LOG_COLUMN_TYPE.UNKNOWN)).toBe(COLUMN_KIND.TEXT)
  })
})

describe('getOperatorsForType', () => {
  it('never offers an operator the API does not accept', () => {
    for (const type of Object.values(LOG_COLUMN_TYPE)) {
      for (const operator of getOperatorsForType(type)) {
        expect(API_FILTER_TYPES.has(operator.type)).toBe(true)
      }
    }
  })

  it('offers relative and calendar ranges only on timestamp columns', () => {
    const timeOperators = getOperatorsForType(LOG_COLUMN_TYPE.TIMESTAMP).map((o) => o.type)
    expect(timeOperators).toContain(LOG_FILTER_TYPE.RELATIVE)
    expect(timeOperators).toContain(LOG_FILTER_TYPE.CURRENT_PERIOD)

    for (const type of [LOG_COLUMN_TYPE.TEXT, LOG_COLUMN_TYPE.INTEGER, LOG_COLUMN_TYPE.SEVERITY]) {
      const types = getOperatorsForType(type).map((o) => o.type)
      expect(types).not.toContain(LOG_FILTER_TYPE.RELATIVE)
      expect(types).not.toContain(LOG_FILTER_TYPE.CURRENT_PERIOD)
    }
  })

  it('offers childOf only on object columns', () => {
    expect(getOperatorsForType(LOG_COLUMN_TYPE.OBJECT_ID).map((o) => o.type)).toContain(
      LOG_FILTER_TYPE.CHILD_OF,
    )
    expect(getOperatorsForType(LOG_COLUMN_TYPE.USER_ID).map((o) => o.type)).not.toContain(
      LOG_FILTER_TYPE.CHILD_OF,
    )
  })

  it('defaults text columns to a wrapped contains', () => {
    const operator = getDefaultOperator(LOG_COLUMN_TYPE.TEXT)
    expect(operator.type).toBe(LOG_FILTER_TYPE.LIKE)
    expect(operator.wrap).toBe(true)
    expect(operator.negated).toBe(false)
  })
})

describe('getCodedLabel', () => {
  it('labels the indexed code tables', () => {
    expect(getCodedLabel(LOG_COLUMN_TYPE.SEVERITY, 4)).toBe('Critical')
    expect(getCodedLabel(LOG_COLUMN_TYPE.EVENT_ORIGIN, 3)).toBe('Syslog')
    expect(getCodedLabel(LOG_COLUMN_TYPE.ASSET_OPERATION, 2)).toBe('Update')
    expect(getCodedLabel(LOG_COLUMN_TYPE.DEPLOYMENT_STATUS, 7)).toBe('Failed')
    expect(getCodedLabel(LOG_COLUMN_TYPE.CONNECTION_EVENT, 1)).toBe('Disconnect')
    expect(getCodedLabel(LOG_COLUMN_TYPE.OBSERVATION_STATE, 0)).toBe('New')
  })

  it('masks the helpdesk bits out of an alarm state', () => {
    expect(getCodedLabel(LOG_COLUMN_TYPE.ALARM_STATE, 1)).toBe('Acknowledged')
    // Sticky-acknowledged alarms carry bits above the state nibble.
    expect(getCodedLabel(LOG_COLUMN_TYPE.ALARM_STATE, 0x11)).toBe('Acknowledged')
  })

  it('accepts char-typed statuses as either the character or its ordinal', () => {
    expect(getCodedLabel(LOG_COLUMN_TYPE.AI_TASK_STATUS, 'F')).toBe('Failed')
    expect(getCodedLabel(LOG_COLUMN_TYPE.AI_TASK_STATUS, 3)).toBe('Failed')
    expect(getCodedLabel(LOG_COLUMN_TYPE.AI_OPERATOR_EXECUTION_STATUS, 'S')).toBe('Skipped')
    expect(getCodedLabel(LOG_COLUMN_TYPE.AI_OPERATOR_EXECUTION_STATUS, 2)).toBe('Skipped')
  })

  it('shows an unrecognised code rather than blanking the cell', () => {
    expect(getCodedLabel(LOG_COLUMN_TYPE.EVENT_ORIGIN, 99)).toBe('99')
    expect(getCodedLabel(LOG_COLUMN_TYPE.TEXT, 'plain')).toBe('plain')
  })
})

describe('getCodedOptions', () => {
  it('returns null for columns that are not coded', () => {
    expect(getCodedOptions(LOG_COLUMN_TYPE.TEXT)).toBeNull()
    expect(getCodedOptions(LOG_COLUMN_TYPE.OBJECT_ID)).toBeNull()
  })

  it('returns value/label pairs for coded columns', () => {
    expect(getCodedOptions(LOG_COLUMN_TYPE.COMPLETION_STATUS)).toEqual([
      { value: 0, label: 'Failure' },
      { value: 1, label: 'Success' },
    ])
  })
})

describe('getSeverityDisplay', () => {
  it('reuses the alarm palette', () => {
    const critical = getSeverityDisplay(4)
    expect(critical.key).toBe('critical')
    expect(critical.label).toBe('Critical')
    expect(critical.color).toBeTruthy()
  })
})

describe('column helpers', () => {
  const columns = [
    { name: 'record_id', description: 'Record ID', type: 'integer', recordId: true, detail: false },
    {
      name: 'msg_timestamp',
      description: 'Time',
      type: 'timestamp',
      recordId: false,
      detail: false,
    },
    {
      name: 'origin_timestamp',
      description: 'Origin time',
      type: 'timestamp',
      recordId: false,
      detail: false,
    },
    {
      name: 'raw_data',
      description: 'Raw data',
      type: 'textDetails',
      recordId: false,
      detail: true,
    },
  ]

  it('drops detail columns from the result column set', () => {
    expect(getResultColumns(columns).map((c) => c.name)).toEqual([
      'record_id',
      'msg_timestamp',
      'origin_timestamp',
    ])
  })

  it('picks the first timestamp column as the primary time column', () => {
    expect(getPrimaryTimeColumn(columns).name).toBe('msg_timestamp')
  })

  it('returns null when a log has no timestamp column', () => {
    expect(getPrimaryTimeColumn([{ name: 'a', type: 'text' }])).toBeNull()
  })

  it('falls back to the raw column name when the server sends no description', () => {
    expect(getColumnLabel({ name: 'msg_tag', description: null })).toBe('msg_tag')
    expect(getColumnLabel({ name: 'msg_tag', description: 'Tag' })).toBe('Tag')
  })
})

describe('getStreamMetaColumns', () => {
  /** AlarmLog is the dense case. */
  const alarmColumns = [
    { name: 'alarm_id', description: 'Alarm ID', type: 'integer', detail: false },
    { name: 'alarm_state', description: 'State', type: 'alarmState', detail: false },
    { name: 'hd_state', description: 'Helpdesk State', type: 'alarmHelpdeskState', detail: false },
    { name: 'source_object_id', description: 'Source', type: 'objectId', detail: false },
    { name: 'zone_uin', description: 'Zone', type: 'zoneUIN', detail: false },
    { name: 'dci_id', description: 'DCI', type: 'integer', detail: false },
    { name: 'current_severity', description: 'Severity', type: 'severity', detail: false },
    {
      name: 'original_severity',
      description: 'Original Severity',
      type: 'severity',
      detail: false,
    },
    { name: 'source_event_code', description: 'Event', type: 'eventCode', detail: false },
    { name: 'message', description: 'Message', type: 'text', detail: false },
    { name: 'repeat_count', description: 'Repeat Count', type: 'integer', detail: false },
    { name: 'creation_time', description: 'Created', type: 'timestamp', detail: false },
    { name: 'last_change_time', description: 'Last Changed', type: 'timestamp', detail: false },
    { name: 'ack_by', description: 'Ack by', type: 'userId', detail: false },
    { name: 'rule_guid', description: 'Rule', type: 'text', detail: false },
    { name: 'alarm_key', description: 'Key', type: 'text', detail: false },
  ]

  const headline = ['creation_time', 'message', 'current_severity', 'source_object_id']

  it('caps the set so a 20-column log still renders one tidy line', () => {
    const meta = getStreamMetaColumns(alarmColumns, { exclude: headline })
    expect(meta).toHaveLength(6)
  })

  it('leads with the record id, then state, then supporting fields', () => {
    const meta = getStreamMetaColumns(alarmColumns, {
      exclude: headline,
      recordIdColumn: 'alarm_id',
    })
    expect(meta.map((c) => c.name)).toEqual([
      'alarm_id',
      'alarm_state',
      'hd_state',
      'original_severity',
      'source_event_code',
      'dci_id',
    ])
  })

  it('never repeats a column already shown on the headline', () => {
    const meta = getStreamMetaColumns(alarmColumns, { exclude: headline })
    for (const name of headline) {
      expect(meta.map((c) => c.name)).not.toContain(name)
    }
  })

  it('pushes secondary timestamps and free text below the cut', () => {
    const names = getStreamMetaColumns(alarmColumns, {
      exclude: headline,
      recordIdColumn: 'alarm_id',
    }).map((c) => c.name)
    expect(names).not.toContain('last_change_time')
    expect(names).not.toContain('rule_guid')
  })

  it('excludes detail columns, which query results never contain', () => {
    const meta = getStreamMetaColumns([
      { name: 'a', description: 'A', type: 'integer', detail: false },
      { name: 'raw', description: 'Raw', type: 'textDetails', detail: true },
    ])
    expect(meta.map((c) => c.name)).toEqual(['a'])
  })

  it('returns the same set for every row, so values line up down the list', () => {
    const first = getStreamMetaColumns(alarmColumns, { exclude: headline })
    const second = getStreamMetaColumns(alarmColumns, { exclude: headline })
    expect(first.map((c) => c.name)).toEqual(second.map((c) => c.name))
  })
})
