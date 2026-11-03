import { describe, it, expect } from 'vitest'
import {
  aiOperatorState,
  formatTokenBudget,
  formatOverride,
  validateAiOperator,
  observationMonitorParams,
  observationReferences,
  observationState,
  checkVerdict,
  validateAiOperatorCheck,
  buildAiOperatorCheckPayload,
  buildAiOperatorPayload,
  DEFAULT_CHECK,
  INTERVAL_MIN,
} from '../aiOperatorDisplay'

describe('observationState', () => {
  it('keeps an open observation in the full text color and handled ones muted', () => {
    expect(observationState('new').color).toBe('var(--p-text-color)')
    expect(observationState('acknowledged').color).toBe('var(--p-text-muted-color)')
    expect(observationState('dismissed').color).toBe('var(--p-text-muted-color)')
  })

  it('shows a state it does not know as it came, muted', () => {
    expect(observationState('escalated')).toMatchObject({
      label: 'escalated',
      color: 'var(--p-text-muted-color)',
    })
    expect(observationState(undefined).label).toBe('Unknown')
  })
})

describe('observationReferences', () => {
  it('names a standing check, which is the one shape the server writes itself', () => {
    expect(observationReferences({ references: ['check:12:Disk: root'] })).toEqual([
      'Check: Disk: root',
    ])
  })

  it('leaves the free text the model writes as it is', () => {
    expect(observationReferences({ references: ['747931', 'check:notes'] })).toEqual([
      '747931',
      'check:notes',
    ])
  })

  it('shows a non-string entry rather than [object Object]', () => {
    expect(observationReferences({ references: [842396, { alarm: 5 }] })).toEqual([
      '842396',
      '{"alarm":5}',
    ])
  })

  it('has nothing to show when the server sends null or no references', () => {
    expect(observationReferences({ references: null })).toEqual([])
    expect(observationReferences({})).toEqual([])
    expect(observationReferences(null)).toEqual([])
  })
})

describe('aiOperatorState', () => {
  it('reports a currently executing instance as running, even when disabled mid-iteration', () => {
    expect(aiOperatorState({ enabled: false, executing: true }).label).toBe('Running')
    expect(aiOperatorState({ enabled: true, executing: true }).label).toBe('Running')
  })

  it('distinguishes idle enabled from disabled', () => {
    expect(aiOperatorState({ enabled: true, executing: false }).label).toBe('Enabled')
    expect(aiOperatorState({ enabled: false, executing: false }).label).toBe('Disabled')
  })

  it('treats a missing instance as disabled', () => {
    expect(aiOperatorState(undefined).label).toBe('Disabled')
  })
})

describe('formatTokenBudget', () => {
  it('renders 0 and absent as unlimited', () => {
    expect(formatTokenBudget(0)).toBe('Unlimited')
    expect(formatTokenBudget(undefined)).toBe('Unlimited')
  })

  it('renders a cap with thousands separators', () => {
    expect(formatTokenBudget(1000000)).toBe((1000000).toLocaleString())
  })
})

describe('formatOverride', () => {
  it('renders 0 and absent as the server default', () => {
    expect(formatOverride(0, 'days')).toBe('Server default')
    expect(formatOverride(undefined, 'days')).toBe('Server default')
  })

  it('renders a set override with its unit', () => {
    expect(formatOverride(30, 'days')).toBe('30 days')
  })
})

describe('validateAiOperator', () => {
  const valid = { name: 'watcher', minInterval: 300, maxInterval: 3600 }

  it('accepts a well-formed instance', () => {
    expect(validateAiOperator(valid)).toEqual({})
  })

  it('requires a non-blank name', () => {
    expect(validateAiOperator({ ...valid, name: '' }).name).toBeTruthy()
    expect(validateAiOperator({ ...valid, name: '   ' }).name).toBeTruthy()
    expect(validateAiOperator({ ...valid, name: undefined }).name).toBeTruthy()
  })

  it('enforces the server minimum interval floor', () => {
    expect(validateAiOperator({ ...valid, minInterval: INTERVAL_MIN - 1 }).minInterval).toBeTruthy()
    expect(validateAiOperator({ ...valid, minInterval: INTERVAL_MIN }).minInterval).toBeUndefined()
    // InputNumber clears to null when the field is emptied.
    expect(
      validateAiOperator({ ...valid, minInterval: null, maxInterval: 3600 }).minInterval,
    ).toBeTruthy()
  })

  it('rejects a maximum interval below the minimum', () => {
    expect(
      validateAiOperator({ ...valid, minInterval: 600, maxInterval: 300 }).maxInterval,
    ).toBeTruthy()
    expect(
      validateAiOperator({ ...valid, minInterval: 600, maxInterval: 600 }).maxInterval,
    ).toBeUndefined()
  })
})

describe('observationMonitorParams', () => {
  it('defaults to the newest 50 new observations', () => {
    expect(observationMonitorParams({}, 0)).toEqual({ limit: 50, state: 'new' })
  })

  it('drops the state filter when not limited to new observations', () => {
    expect(observationMonitorParams({ newOnly: false }, 0)).toEqual({ limit: 50 })
  })

  it('caps the row count at 500, as legacy does', () => {
    expect(observationMonitorParams({ maxRecords: 2000 }, 0).limit).toBe(500)
  })

  it('filters on one operator instance when set', () => {
    expect(observationMonitorParams({ instanceId: 3 }, 0).instance).toBe(3)
  })

  it('scopes to an object and its children', () => {
    expect(observationMonitorParams({}, 42)).toMatchObject({ object: 42, includeChildren: true })
  })

  it('sends no object scope for object 0', () => {
    const params = observationMonitorParams({}, 0)
    expect(params).not.toHaveProperty('object')
    expect(params).not.toHaveProperty('includeChildren')
  })
})

describe('checkVerdict', () => {
  it.each([
    ['quiet', 'Quiet'],
    ['fired', 'Fired'],
    ['error', 'Error'],
    ['never', 'Never run'],
    [undefined, 'Never run'],
  ])('labels %s as %s', (verdict, label) => {
    expect(checkVerdict(verdict).label).toBe(label)
  })
})

describe('validateAiOperatorCheck', () => {
  const valid = { name: 'Disk', source: 'return null;', interval: 300 }

  it('accepts a complete check', () => {
    expect(validateAiOperatorCheck(valid)).toEqual({})
  })

  it('requires a name', () => {
    expect(validateAiOperatorCheck({ ...valid, name: '  ' }).name).toBeTruthy()
  })

  it('requires a script', () => {
    expect(validateAiOperatorCheck({ ...valid, source: '   ' }).source).toBeTruthy()
  })

  it('rejects an interval under the server floor', () => {
    expect(validateAiOperatorCheck({ ...valid, interval: 10 }).interval).toBeTruthy()
  })
})

describe('buildAiOperatorCheckPayload', () => {
  const loaded = { ...DEFAULT_CHECK, id: 5, name: 'Disk', source: 'return null;', runCount: 9 }

  it('sends every editable field for a new check', () => {
    const payload = buildAiOperatorCheckPayload({ ...DEFAULT_CHECK, name: ' Disk ' }, null)
    expect(Object.keys(payload).sort()).toEqual(Object.keys(DEFAULT_CHECK).sort())
    expect(payload.name).toBe('Disk')
  })

  it('sends only what changed for an existing check', () => {
    expect(buildAiOperatorCheckPayload({ ...loaded, enabled: false }, loaded)).toEqual({
      enabled: false,
    })
  })

  it('treats surrounding whitespace in the name as no change', () => {
    expect(buildAiOperatorCheckPayload({ ...loaded, name: '  Disk ' }, loaded)).toEqual({})
  })
})

describe('buildAiOperatorPayload', () => {
  const form = {
    name: ' Night shift ',
    description: '',
    enabled: true,
    scopeFilter: '',
    modelSlot: '',
    minInterval: 300,
    maxInterval: 3600,
    dailyTokenBudget: 0,
    personaPrompt: '',
    observationRetentionDays: 0,
    observationMaxRecords: 0,
    instructions: 'Watch the core switches.',
    instructionsLocked: false,
  }
  const operator = { id: 4, instructions: 'Watch the core switches.', instructionsLocked: false }

  it('omits unchanged instructions, which the model may have rewritten since', () => {
    const payload = buildAiOperatorPayload(form, operator)
    expect(payload).not.toHaveProperty('instructions')
    expect(payload.name).toBe('Night shift')
  })

  it('sends edited instructions, trimmed', () => {
    const payload = buildAiOperatorPayload({ ...form, instructions: ' Check UPS.  ' }, operator)
    expect(payload.instructions).toBe('Check UPS.')
  })

  it('always sends the lock for an existing operator', () => {
    expect(buildAiOperatorPayload(form, operator).instructionsLocked).toBe(false)
    expect(
      buildAiOperatorPayload({ ...form, instructionsLocked: true }, operator).instructionsLocked,
    ).toBe(true)
  })

  it('sends neither field for a new instance', () => {
    const payload = buildAiOperatorPayload({ ...form, instructions: 'x' }, null)
    expect(payload).not.toHaveProperty('instructions')
    expect(payload).not.toHaveProperty('instructionsLocked')
  })

  it('sends the owner only when it was picked or changed', () => {
    const owned = { ...operator, ownerUserId: 7 }
    expect(buildAiOperatorPayload({ ...form, ownerUserId: 7 }, owned)).not.toHaveProperty(
      'ownerUserId',
    )
    expect(buildAiOperatorPayload({ ...form, ownerUserId: 12 }, owned).ownerUserId).toBe(12)
    // A new instance left on the default lets the server pick the "ai-operator" account.
    expect(buildAiOperatorPayload({ ...form, ownerUserId: 0 }, null)).not.toHaveProperty(
      'ownerUserId',
    )
    expect(buildAiOperatorPayload({ ...form, ownerUserId: 12 }, null).ownerUserId).toBe(12)
  })
})
