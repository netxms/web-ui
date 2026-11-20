import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatTimerValue,
  isFilterEmpty,
  ruleConditions,
  ruleErrors,
  ruleSteps,
  scriptPreview,
  stopsProcessing,
} from '@/utils/eppRuleSummary'
import {
  RF_ACCEPT_CORRELATED_EVENTS,
  RF_ADD_AI_COMMENT,
  RF_AI_ANALYZE_INCIDENT,
  RF_AI_AUTO_ASSIGN,
  RF_ALL_SEVERITIES,
  RF_CREATE_HELPDESK_TICKET,
  RF_CREATE_INCIDENT,
  RF_END_DOWNTIME,
  RF_GENERATE_ALARM,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SET_LOG_FLAG,
  RF_SEVERITY_CRITICAL,
  RF_SEVERITY_MAJOR,
  RF_START_DOWNTIME,
  RF_STOP_PROCESSING,
  RF_TERMINATE_BY_REGEXP,
  SEVERITY_FROM_EVENT,
  SEVERITY_TERMINATE,
} from '@/utils/eppRules'
import { encodeTimeFrame } from '@/utils/eppTimeFrames'

function makeRule(overrides = {}) {
  return {
    guid: 'r1',
    flags: RF_ALL_SEVERITIES,
    events: [],
    sources: [],
    sourceExclusions: [],
    timeFrames: [],
    actions: [],
    timerCancellations: [],
    chainCalls: [],
    pstorageSetActions: {},
    pstorageDeleteActions: [],
    customAttributeSetActions: {},
    customAttributeDeleteActions: [],
    filterScript: '',
    actionScript: '',
    ...overrides,
  }
}

/** Rule 2 of the main chain in the screenshots: every kind of action at once. */
function everyActionRule() {
  return makeRule({
    flags:
      RF_ALL_SEVERITIES |
      RF_GENERATE_ALARM |
      RF_TERMINATE_BY_REGEXP |
      RF_CREATE_INCIDENT |
      RF_AI_ANALYZE_INCIDENT |
      RF_AI_AUTO_ASSIGN |
      RF_START_DOWNTIME |
      RF_SET_LOG_FLAG |
      RF_STOP_PROCESSING,
    events: [1],
    alarmSeverity: SEVERITY_TERMINATE,
    alarmKey: 'IF_UNEXP_UP_%i_%5',
    incidentDelay: 15,
    incidentAIPrompt: 'test',
    downtimeTag: 'test',
    pstorageSetActions: { test1: 'test2' },
    pstorageDeleteActions: ['test3'],
    customAttributeSetActions: { test4: 'test5' },
    customAttributeDeleteActions: ['test6'],
    actions: [
      { id: 7, timerDelay: '', timerKey: '', blockingTimerKey: '', snoozeTime: '', active: true },
    ],
    timerCancellations: ['test7'],
    actionScript: '// note\nreturn true;',
    aiInstructions: 'test8',
    chainCalls: [3],
  })
}

describe('ruleSteps', () => {
  it('lists actions in the order the server runs them', () => {
    expect(ruleSteps(everyActionRule()).map((s) => s.type)).toEqual([
      'alarm-terminate',
      'server-action',
      'timer-cancel',
      'action-script',
      'pstorage',
      'custom-attributes',
      'downtime-start',
      'ai-instructions',
      'log-force',
      'chain-call',
    ])
  })

  it('gives every step a unique id, a kind and the editor section it opens', () => {
    const steps = ruleSteps(everyActionRule())
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
    for (const step of steps) {
      expect(step.kind).toBeTruthy()
      expect(step.section).toBeTruthy()
    }
  })

  it('keeps stop processing out of the steps', () => {
    const rule = everyActionRule()
    expect(ruleSteps(rule).some((s) => s.type === 'stop')).toBe(false)
    expect(stopsProcessing(rule)).toBe(true)
  })

  it('hangs incident, ticket and AI comment off the alarm', () => {
    const rule = makeRule({
      flags:
        RF_GENERATE_ALARM |
        RF_CREATE_HELPDESK_TICKET |
        RF_ADD_AI_COMMENT |
        RF_CREATE_INCIDENT |
        RF_AI_ANALYZE_INCIDENT,
      alarmSeverity: 3,
      incidentDelay: 90,
      incidentAIPrompt: 'look at the logs',
    })
    const [alarm] = ruleSteps(rule)
    expect(alarm.type).toBe('alarm-generate')
    expect(alarm.extras.map((e) => e.type)).toEqual(['helpdesk-ticket', 'ai-comment', 'incident'])
    expect(alarm.extras[2]).toMatchObject({
      delay: '1m 30s',
      aiAnalysis: true,
      autoAssign: false,
      prompt: 'look at the logs',
      section: 'incident',
    })
  })

  it('shows no incident or ticket without an alarm action, as the desktop console does', () => {
    const rule = makeRule({ flags: RF_CREATE_INCIDENT | RF_CREATE_HELPDESK_TICKET })
    expect(ruleSteps(rule)).toEqual([])
  })

  it('describes a generated alarm', () => {
    const rule = makeRule({
      flags: RF_GENERATE_ALARM,
      alarmSeverity: SEVERITY_FROM_EVENT,
      alarmMessage: '%m',
      alarmKey: 'NODE_DOWN_%i',
      alarmTimeout: 600,
      alarmTimeoutEvent: 43,
      alarmFlapCount: 3,
      alarmFlapWindow: 300,
      alarmCategories: [5],
    })
    expect(ruleSteps(rule)[0]).toMatchObject({
      type: 'alarm-generate',
      severity: null,
      message: '%m',
      key: 'NODE_DOWN_%i',
      timeout: '10m',
      timeoutEvent: 43,
      flapCount: 3,
      flapWindow: '5m',
      categories: [5],
    })
  })

  it('names categories by script when a script picks them', () => {
    const rule = makeRule({
      flags: RF_GENERATE_ALARM,
      alarmSeverity: 2,
      alarmCategories: [5],
      alarmCategoryScript: 'pickCategories',
    })
    expect(ruleSteps(rule)[0]).toMatchObject({ categoryScript: 'pickCategories', categories: [] })
  })

  it('carries server action timers, formatted like the desktop console', () => {
    const rule = makeRule({
      actions: [
        {
          id: 1,
          timerDelay: '300',
          timerKey: 'K',
          blockingTimerKey: 'B',
          snoozeTime: '3600',
          active: false,
        },
        { id: 2, timerDelay: '%<delay>', timerKey: '', blockingTimerKey: '', snoozeTime: '' },
      ],
    })
    const [first, second] = ruleSteps(rule)
    expect(first).toMatchObject({
      actionId: 1,
      delay: '5m',
      timerKey: 'K',
      blockingTimerKey: 'B',
      snooze: '1h',
      active: false,
    })
    expect(second).toMatchObject({ actionId: 2, delay: '%<delay>', active: true })
  })

  it('ends downtime when asked to', () => {
    const rule = makeRule({ flags: RF_END_DOWNTIME, downtimeTag: 'maint' })
    expect(ruleSteps(rule)).toMatchObject([{ type: 'downtime-end', tag: 'maint' }])
  })

  it('reads AI instructions under either field name', () => {
    expect(ruleSteps(makeRule({ aiAgentInstructions: 'old' }))).toMatchObject([
      { type: 'ai-instructions', text: 'old' },
    ])
    expect(ruleSteps(makeRule({ aiInstructions: '  ' }))).toEqual([])
  })
})

describe('ruleConditions', () => {
  it('leaves out what does not narrow the match', () => {
    expect(ruleConditions(makeRule({ events: [1] })).map((c) => c.key)).toEqual(['events'])
  })

  it('lists clauses in the order the server checks them', () => {
    const rule = makeRule({
      flags: RF_SEVERITY_MAJOR | RF_SEVERITY_CRITICAL | RF_ACCEPT_CORRELATED_EVENTS,
      events: [1, 2],
      sources: [10],
      timeFrames: [
        encodeTimeFrame({
          startTime: 480,
          endTime: 1020,
          dayOfWeek: 62,
          dayOfMonth: '1-5',
          month: 0,
        }),
      ],
      filterScript: '// why\nreturn $event.severity > 2;',
    })
    const clauses = ruleConditions(rule)
    expect(clauses.map((c) => c.key)).toEqual(['events', 'sources', 'severity', 'time', 'script'])
    expect(clauses[0]).toMatchObject({ correlated: true, negated: false })
    expect(clauses[2].severities).toEqual([3, 4])
    expect(clauses[3].frames).toEqual(['08:00–17:00, 1st–5th of each month, weekdays only'])
    expect(clauses[4].preview).toBe('return $event.severity > 2;')
  })

  it('marks negation per clause', () => {
    const rule = makeRule({
      flags: RF_ALL_SEVERITIES | RF_NEGATED_SOURCE | RF_NEGATED_TIME_FRAMES,
      sources: [10],
      sourceExclusions: [11],
      timeFrames: [
        encodeTimeFrame({ startTime: 0, endTime: 1439, dayOfWeek: 0, dayOfMonth: '', month: 1 }),
      ],
    })
    const [sources, time] = ruleConditions(rule)
    expect(sources).toMatchObject({ negated: true, sources: [10], exclusions: [11] })
    expect(time).toMatchObject({ negated: true, frames: ['In January'] })
  })

  it('keeps a source clause that only excludes objects', () => {
    const [sources] = ruleConditions(makeRule({ sourceExclusions: [11] }))
    expect(sources).toMatchObject({ key: 'sources', sources: [], exclusions: [11] })
  })
})

describe('isFilterEmpty', () => {
  it('is true for a rule with nothing to match on, which the server skips', () => {
    expect(isFilterEmpty(makeRule())).toBe(true)
  })

  it('is false once any part narrows the match', () => {
    expect(isFilterEmpty(makeRule({ events: [1] }))).toBe(false)
    expect(isFilterEmpty(makeRule({ flags: RF_SEVERITY_CRITICAL }))).toBe(false)
    expect(isFilterEmpty(makeRule({ filterScript: 'return true;' }))).toBe(false)
  })
})

describe('ruleErrors', () => {
  it('turns the server error flags into messages with the section that fixes them', () => {
    const errors = ruleErrors(
      makeRule({
        errors: { missingEvent: true, actionScriptCompilationError: true, missingAction: false },
      }),
    )
    expect(errors).toEqual([
      { key: 'missingEvent', message: 'An event no longer exists', section: 'events' },
      {
        key: 'actionScriptCompilationError',
        message: 'The action script does not compile',
        section: 'script',
      },
    ])
  })

  it('is empty when the server sends none', () => {
    expect(ruleErrors(makeRule({ errors: null }))).toEqual([])
  })
})

describe('formatting', () => {
  it('writes durations as the desktop console does', () => {
    expect(formatDuration(9000)).toBe('2h 30m')
    expect(formatDuration(90061)).toBe('1d 1h 1m 1s')
    expect(formatDuration(0)).toBe('0s')
  })

  it('leaves timer values that are not plain seconds as they are', () => {
    expect(formatTimerValue('120')).toBe('2m')
    expect(formatTimerValue('2h 30m')).toBe('2h 30m')
    expect(formatTimerValue('')).toBe('')
    expect(formatTimerValue(undefined)).toBe('')
  })

  it('previews the first line of a script that is not a comment', () => {
    expect(scriptPreview('// header\n\n  return 1;\n')).toBe('return 1;')
    expect(scriptPreview('')).toBe(null)
    expect(scriptPreview('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})
