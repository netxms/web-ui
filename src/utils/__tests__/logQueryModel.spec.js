// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TIME_PRESET,
  applyOmnibarTokens,
  buildLogQueryRequest,
  createObjectFilter,
  createQueryModel,
  defaultOrderBy,
  describeCondition,
  describeFilterConditions,
  parseFromQuery,
  projectToOmnibar,
  serializeToQuery,
} from '../logQueryModel'

/** AuditLog schema, transcribed from `s_logs[]` in the server's core/logs.cpp. */
const auditColumns = [
  { name: 'record_id', description: 'Record ID', type: 'integer', recordId: true, detail: false },
  {
    name: 'timestamp',
    description: 'Timestamp',
    type: 'timestamp',
    recordId: false,
    detail: false,
  },
  { name: 'subsystem', description: 'Subsystem', type: 'text', recordId: false, detail: false },
  { name: 'object_id', description: 'Object', type: 'objectId', recordId: false, detail: false },
  { name: 'user_id', description: 'User', type: 'userId', recordId: false, detail: false },
  { name: 'message', description: 'Message', type: 'text', recordId: false, detail: false },
  {
    name: 'old_value',
    description: 'Old value',
    type: 'textDetails',
    recordId: false,
    detail: true,
  },
]

/** AlarmLog is the interesting case for coded columns. */
const alarmColumns = [
  { name: 'alarm_id', description: 'Alarm ID', type: 'integer', recordId: false, detail: false },
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
]

const TZ = 7200

function condition(patch) {
  return { id: 1, value: null, ...patch }
}

describe('createQueryModel', () => {
  it('starts on the default time range, sorted newest first', () => {
    const model = createQueryModel(auditColumns)
    expect(model.time.preset).toBe(DEFAULT_TIME_PRESET)
    expect(model.filters).toEqual([])
    expect(model.orderBy).toEqual([{ column: 'timestamp', descending: true }])
  })

  it('sorts by the record id column when a log has no timestamp', () => {
    expect(defaultOrderBy([{ name: 'id', type: 'integer', recordId: true }])).toEqual([
      { column: 'id', descending: true },
    ])
  })

  it('leaves ordering empty when a log has neither', () => {
    expect(defaultOrderBy([{ name: 'text', type: 'text', recordId: false }])).toEqual([])
  })
})

describe('buildLogQueryRequest - time range', () => {
  it('maps a rolling preset to a relative filter on the primary time column', () => {
    const model = createQueryModel(auditColumns)
    model.time.preset = 'last7d'
    const request = buildLogQueryRequest(model, auditColumns, { timeZoneOffset: TZ })
    expect(request.filters).toEqual([
      { column: 'timestamp', type: 'relative', value: 7, unit: 'day' },
    ])
  })

  it('maps a calendar preset to currentPeriod with the client time zone', () => {
    const model = createQueryModel(auditColumns)
    model.time.preset = 'yesterday'
    const request = buildLogQueryRequest(model, auditColumns, { timeZoneOffset: TZ })
    expect(request.filters).toEqual([
      { column: 'timestamp', type: 'currentPeriod', period: 'yesterday', timeZoneOffset: TZ },
    ])
  })

  // Second precision: the server's filter parser rejects milliseconds and fails the whole query.
  it('sends a custom range as ISO 8601 bounds, to second precision', () => {
    const model = createQueryModel(auditColumns)
    model.time = { preset: 'custom', from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' }
    const [filter] = buildLogQueryRequest(model, auditColumns, { timeZoneOffset: TZ }).filters
    expect(filter).toEqual({
      column: 'timestamp',
      type: 'range',
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-02T00:00:00Z',
    })
  })

  it('degrades an open-ended custom range to a one-sided comparison', () => {
    const model = createQueryModel(auditColumns)
    model.time = { preset: 'custom', from: '2026-08-01T00:00:00Z', to: null }
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'timestamp', type: 'greater', value: '2026-08-01T00:00:00Z' },
    ])

    model.time = { preset: 'custom', from: null, to: '2026-08-02T00:00:00Z' }
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'timestamp', type: 'less', value: '2026-08-02T00:00:00Z' },
    ])
  })

  it('emits no time filter for "any time", or when the log has no timestamp column', () => {
    const model = createQueryModel(auditColumns)
    model.time.preset = 'any'
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([])

    const timeless = [{ name: 'id', type: 'integer', recordId: true, detail: false }]
    expect(buildLogQueryRequest(createQueryModel(timeless), timeless).filters).toEqual([])
  })
})

describe('buildLogQueryRequest - column filters', () => {
  const noTime = (model) => {
    model.time.preset = 'any'
    return model
  }

  it('emits a bare filter for a single condition', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'subsystem',
        operation: 'or',
        conditions: [condition({ operatorId: 'contains', value: 'Objects' })],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'subsystem', type: 'like', value: '%Objects%' },
    ])
  })

  it('wraps multiple conditions on one column into a set, which is the only place OR exists', () => {
    const model = noTime(createQueryModel(alarmColumns))
    model.filters = [
      {
        id: 1,
        column: 'current_severity',
        operation: 'or',
        conditions: [
          condition({ id: 1, operatorId: 'is', value: 4 }),
          condition({ id: 2, operatorId: 'is', value: 3 }),
        ],
      },
    ]
    expect(buildLogQueryRequest(model, alarmColumns).filters).toEqual([
      {
        column: 'current_severity',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 4 },
          { type: 'equals', value: 3 },
        ],
      },
    ])
  })

  it('ANDs separate columns at the top level', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'subsystem',
        operation: 'or',
        conditions: [condition({ operatorId: 'contains', value: 'Objects' })],
      },
      {
        id: 2,
        column: 'record_id',
        operation: 'or',
        conditions: [condition({ operatorId: 'between', from: 100, to: 200 })],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'subsystem', type: 'like', value: '%Objects%' },
      { column: 'record_id', type: 'range', from: 100, to: 200 },
    ])
  })

  it('carries negation through as the negated flag', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'message',
        operation: 'or',
        conditions: [condition({ operatorId: 'notContains', value: 'login' })],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'message', type: 'like', negated: true, value: '%login%' },
    ])
  })

  it('passes a raw pattern through unwrapped for "matches"', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'message',
        operation: 'or',
        conditions: [condition({ operatorId: 'matches', value: 'ACL%' })],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'message', type: 'like', value: 'ACL%' },
    ])
  })

  it('drops incomplete conditions instead of sending a filter the server rejects', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'record_id',
        operation: 'or',
        conditions: [
          condition({ id: 1, operatorId: 'between', from: 100, to: null }),
          condition({ id: 2, operatorId: 'is', value: null }),
        ],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([])
  })

  it('drops filters and ordering on columns the log does not have', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'not_a_column',
        operation: 'or',
        conditions: [condition({ operatorId: 'contains', value: 'x' })],
      },
    ]
    model.orderBy = [{ column: 'not_a_column', descending: true }]
    const request = buildLogQueryRequest(model, auditColumns)
    expect(request.filters).toEqual([])
    expect(request.orderBy).toEqual([])
  })

  it('keeps a locked filter, which is how object context is enforced', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      {
        id: 1,
        column: 'object_id',
        operation: 'or',
        locked: true,
        conditions: [condition({ operatorId: 'is', value: 42 })],
      },
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      { column: 'object_id', type: 'equals', value: 42 },
    ])
  })

  it('scopes an object filter to the object and its subtree when asked', () => {
    const model = noTime(createQueryModel(auditColumns))
    model.filters = [
      createObjectFilter('object_id', 42, 'Servers', { locked: true, includeChildren: true }),
    ]
    expect(buildLogQueryRequest(model, auditColumns).filters).toEqual([
      {
        column: 'object_id',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 42 },
          { type: 'childOf', value: 42 },
        ],
      },
    ])
  })

  it('applies paging defaults', () => {
    const request = buildLogQueryRequest(createQueryModel(auditColumns), auditColumns)
    expect(request.offset).toBe(0)
    expect(request.limit).toBe(DEFAULT_PAGE_SIZE)
    expect(
      buildLogQueryRequest(createQueryModel(auditColumns), auditColumns, {
        offset: 500,
        limit: 100,
      }),
    ).toMatchObject({
      offset: 500,
      limit: 100,
    })
  })
})

describe('omnibar projection', () => {
  it('projects representable conditions as tokens and the rest as chips', () => {
    const model = createQueryModel(alarmColumns)
    model.filters = [
      {
        id: 1,
        column: 'current_severity',
        operation: 'or',
        conditions: [condition({ operatorId: 'is', value: 4 })],
      },
      {
        id: 2,
        column: 'alarm_id',
        operation: 'or',
        conditions: [condition({ operatorId: 'between', from: 100, to: 200 })],
      },
    ]
    const { tokens, hidden, locked } = projectToOmnibar(model, alarmColumns)
    expect(tokens).toEqual([{ key: 'current_severity', value: 'Critical' }])
    expect(locked).toEqual([])
    // Summaries carry the column, so "between 100 and 200" is not ambiguous on its own.
    expect(hidden).toEqual([
      {
        key: 'alarm_id',
        columnLabel: 'Alarm ID',
        label: 'between 100 and 200',
        text: 'Alarm ID between 100 and 200',
      },
    ])
  })

  it('keeps a context-imposed filter out of the tokens, in its own bucket', () => {
    const model = createQueryModel(auditColumns)
    model.filters = [
      {
        id: 1,
        column: 'subsystem',
        operation: 'or',
        locked: true,
        conditions: [condition({ operatorId: 'contains', value: 'Objects' })],
      },
    ]
    const { tokens, hidden, locked } = projectToOmnibar(model, auditColumns)
    expect(tokens).toEqual([])
    // Locked filters are context, not user input: they never inflate the Advanced badge.
    expect(hidden).toEqual([])
    expect(locked).toHaveLength(1)
    expect(locked[0].text).toBe('Subsystem contains Objects')
  })

  it('summarises a locked object-and-subtree filter as one phrase', () => {
    const model = createQueryModel(auditColumns)
    model.filters = [
      createObjectFilter('object_id', 42, 'Servers', { locked: true, includeChildren: true }),
    ]
    const { locked } = projectToOmnibar(model, auditColumns)
    expect(locked).toHaveLength(1)
    expect(locked[0].text).toBe('Object is Servers or below')
  })

  it('turns repeated tokens on one key into an OR set on that column', () => {
    const model = createQueryModel(alarmColumns)
    model.filters = applyOmnibarTokens(
      model,
      [
        { key: 'current_severity', value: 'Critical' },
        { key: 'current_severity', value: 'Major' },
      ],
      alarmColumns,
    )
    model.time.preset = 'any'

    expect(buildLogQueryRequest(model, alarmColumns).filters).toEqual([
      {
        column: 'current_severity',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 4 },
          { type: 'equals', value: 3 },
        ],
      },
    ])
  })

  it('keeps chips and locked filters when tokens change', () => {
    const model = createQueryModel(alarmColumns)
    model.filters = [
      {
        id: 1,
        column: 'alarm_id',
        operation: 'or',
        conditions: [condition({ operatorId: 'between', from: 100, to: 200 })],
      },
      {
        id: 2,
        column: 'message',
        operation: 'or',
        locked: true,
        conditions: [condition({ operatorId: 'contains', value: 'locked' })],
      },
    ]
    const filters = applyOmnibarTokens(
      model,
      [{ key: 'current_severity', value: 'Major' }],
      alarmColumns,
    )

    expect(filters.map((f) => f.column)).toEqual(['alarm_id', 'message', 'current_severity'])
    expect(filters.find((f) => f.column === 'message').conditions).toHaveLength(1)
  })

  it('drops a column when its last token is removed', () => {
    const model = createQueryModel(alarmColumns)
    model.filters = applyOmnibarTokens(model, [{ key: 'message', value: 'timeout' }], alarmColumns)
    expect(model.filters).toHaveLength(1)

    expect(applyOmnibarTokens(model, [], alarmColumns)).toEqual([])
  })

  it('ignores tokens naming a column the log does not have', () => {
    const model = createQueryModel(alarmColumns)
    expect(applyOmnibarTokens(model, [{ key: 'nope', value: 'x' }], alarmColumns)).toEqual([])
  })
})

describe('describeFilterConditions', () => {
  const subsystem = auditColumns.find((c) => c.name === 'subsystem')
  const objectColumn = auditColumns.find((c) => c.name === 'object_id')

  it('joins conditions with the filter match mode', () => {
    const conditions = [
      condition({ operatorId: 'contains', value: 'a' }),
      condition({ id: 2, operatorId: 'contains', value: 'b' }),
    ]
    expect(describeFilterConditions({ operation: 'or', conditions }, subsystem)).toBe(
      'contains a or contains b',
    )
    expect(describeFilterConditions({ operation: 'and', conditions }, subsystem)).toBe(
      'contains a and contains b',
    )
  })

  it('keeps both objects when "is" and "is below" name different ones', () => {
    const conditions = [
      condition({ operatorId: 'is', value: 1, display: 'web-01' }),
      condition({ id: 2, operatorId: 'below', value: 2, display: 'Servers' }),
    ]
    expect(describeFilterConditions({ operation: 'or', conditions }, objectColumn)).toBe(
      'is web-01 or is below Servers',
    )
  })
})

describe('describeCondition', () => {
  const severity = alarmColumns[2]
  const id = alarmColumns[0]

  it('describes coded equality with the label, not the code', () => {
    expect(describeCondition(condition({ operatorId: 'is', value: 4 }), severity)).toBe(
      'is Critical',
    )
  })

  it('describes ranges and relative windows readably', () => {
    expect(describeCondition(condition({ operatorId: 'between', from: 1, to: 9 }), id)).toBe(
      'between 1 and 9',
    )
    expect(describeCondition(condition({ operatorId: 'last', value: 1, unit: 'hour' }), id)).toBe(
      'within the last 1 hour',
    )
    expect(describeCondition(condition({ operatorId: 'last', value: 5, unit: 'day' }), id)).toBe(
      'within the last 5 days',
    )
  })

  it('prefers a cached display label for picker-backed values', () => {
    const objectColumn = auditColumns[3]
    expect(
      describeCondition(
        condition({ operatorId: 'below', value: 12, display: 'Production' }),
        objectColumn,
      ),
    ).toBe('is below Production')
  })
})

describe('URL serialisation', () => {
  it('omits everything that is already the default', () => {
    expect(serializeToQuery(createQueryModel(auditColumns), auditColumns)).toEqual({})
  })

  it('round-trips time range, filters and sort', () => {
    const model = createQueryModel(auditColumns)
    model.time.preset = 'last7d'
    model.orderBy = [{ column: 'record_id', descending: false }]
    model.filters = [
      {
        id: 1,
        column: 'subsystem',
        operation: 'and',
        conditions: [
          condition({ id: 1, operatorId: 'contains', value: 'Objects' }),
          condition({ id: 2, operatorId: 'notContains', value: 'test' }),
        ],
      },
    ]

    const restored = parseFromQuery(serializeToQuery(model, auditColumns), auditColumns)
    expect(restored.time.preset).toBe('last7d')
    expect(restored.orderBy).toEqual([{ column: 'record_id', descending: false }])
    expect(restored.filters).toHaveLength(1)
    expect(restored.filters[0].operation).toBe('and')
    expect(restored.filters[0].conditions.map((c) => [c.operatorId, c.value])).toEqual([
      ['contains', 'Objects'],
      ['notContains', 'test'],
    ])
  })

  it('round-trips a custom range', () => {
    const model = createQueryModel(auditColumns)
    model.time = { preset: 'custom', from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z' }
    const restored = parseFromQuery(serializeToQuery(model, auditColumns), auditColumns)
    expect(restored.time.preset).toBe('custom')
    expect(restored.time.from).toBe('2026-08-01T00:00:00Z')
  })

  it('never persists locked filters, which belong to the embedding context', () => {
    const model = createQueryModel(auditColumns)
    model.filters = [
      {
        id: 1,
        column: 'object_id',
        operation: 'or',
        locked: true,
        conditions: [condition({ operatorId: 'is', value: 42 })],
      },
    ]
    expect(serializeToQuery(model, auditColumns).f).toBeUndefined()
  })

  it('survives a hand-edited URL', () => {
    expect(parseFromQuery({ f: 'not json' }, auditColumns).filters).toEqual([])
    expect(parseFromQuery({ t: 'nonsense' }, auditColumns).time.preset).toBe(DEFAULT_TIME_PRESET)
    expect(parseFromQuery({ sort: 'ghost:desc' }, auditColumns).orderBy).toEqual(
      defaultOrderBy(auditColumns),
    )
    expect(
      parseFromQuery(
        { f: JSON.stringify([{ c: 'subsystem', o: 'or', x: [{ op: 'bogus' }] }]) },
        auditColumns,
      ).filters,
    ).toEqual([])
  })
})
