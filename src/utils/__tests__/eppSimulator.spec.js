import { describe, it, expect } from 'vitest'
import {
  bit31Clash,
  checkRule,
  noteText,
  simulateEvent,
  skipReasonText,
  timeFrameMatches,
  traceFromProcessingMetadata,
  traceMarks,
  tracePath,
} from '@/utils/eppSimulator'
import {
  RF_ACCEPT_CORRELATED_EVENTS,
  RF_ALL_SEVERITIES,
  RF_DISABLED,
  RF_GENERATE_ALARM,
  RF_NEGATED_EVENTS,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SEVERITY_CRITICAL,
  RF_SEVERITY_MAJOR,
  RF_STOP_PROCESSING,
} from '@/utils/eppRules'
import { encodeTimeFrame } from '@/utils/eppTimeFrames'

// Friday 20 November 2026, 10:00 local time.
const FRIDAY_10AM = new Date(2026, 10, 20, 10, 0)
const SUNDAY_10AM = new Date(2026, 10, 22, 10, 0)
const THURSDAY_31ST = new Date(2026, 11, 31, 10, 0)

const NODE = 100
const CONTAINER = 50
const SERVICE_ROOT = 2
const OTHER_NODE = 200

const ANCESTORS = new Map([
  [NODE, new Set([CONTAINER, SERVICE_ROOT])],
  [OTHER_NODE, new Set([SERVICE_ROOT])],
  [CONTAINER, new Set([SERVICE_ROOT])],
])

const ancestorsOf = (id) => ANCESTORS.get(id) ?? null

let guidSeq = 0
function rule(fields = {}) {
  return {
    guid: fields.guid ?? `rule-${++guidSeq}`,
    flags: RF_ALL_SEVERITIES,
    events: [1],
    sources: [],
    sourceExclusions: [],
    timeFrames: [],
    filterScript: '',
    chainCalls: [],
    ...fields,
  }
}

const EVENT = { code: 1, severity: 4, sourceId: NODE, correlated: false }

function check(r, overrides = {}) {
  return checkRule(r, {
    event: { ...EVENT, ...overrides.event },
    now: overrides.now ?? FRIDAY_10AM,
    ancestorsOf,
    scriptOutcome: overrides.scriptOutcome ?? (() => 'match'),
  })
}

function frame(fields) {
  return encodeTimeFrame({
    startTime: 0,
    endTime: 1439,
    dayOfWeek: 0,
    dayOfMonth: '',
    month: 0,
    ...fields,
  })
}

function simulate(chains, overrides = {}) {
  return simulateEvent({
    chains: new Map(Object.entries(chains).map(([id, rules]) => [Number(id), rules])),
    event: { ...EVENT, ...overrides.event },
    now: overrides.now ?? FRIDAY_10AM,
    ancestorsOf,
    scriptOutcome: overrides.scriptOutcome,
  })
}

const outcomes = (trace) => trace.visits.map((v) => [v.chainId, v.ruleNumber, v.outcome])

describe('checkRule: skip reasons in server order', () => {
  it('matches a rule whose every check passes', () => {
    expect(check(rule())).toEqual({ matched: true, assumed: [], notes: [] })
  })

  it('skips a disabled rule before looking at anything else', () => {
    const result = check(rule({ flags: RF_ALL_SEVERITIES | RF_DISABLED, events: [99] }))
    expect(result).toMatchObject({ matched: false, reason: 'disabled' })
  })

  it('skips correlated events unless the rule accepts them', () => {
    const correlated = { event: { correlated: true } }
    expect(check(rule(), correlated)).toMatchObject({ matched: false, reason: 'correlated' })
    const accepting = rule({ flags: RF_ALL_SEVERITIES | RF_ACCEPT_CORRELATED_EVENTS })
    expect(check(accepting, correlated).matched).toBe(true)
  })

  it('skips a rule with no filter at all instead of matching every event', () => {
    expect(check(rule({ events: [] }))).toMatchObject({ reason: 'empty-filter' })
  })

  it('counts a whitespace script as a filter, which then matches', () => {
    expect(check(rule({ events: [], filterScript: '  \n' }))).toEqual({
      matched: true,
      assumed: [],
      notes: [],
    })
  })

  it('treats a script that does not compile as absent, as the server drops it', () => {
    const broken = { filterScript: 'return (', errors: { filterScriptCompilationError: true } }
    expect(check(rule({ events: [], ...broken }))).toMatchObject({ reason: 'empty-filter' })
    expect(check(rule(broken))).toEqual({ matched: true, assumed: [], notes: [] })
  })

  it("skips when the event's severity is not selected", () => {
    const majorOnly = rule({ flags: RF_SEVERITY_MAJOR })
    expect(check(majorOnly)).toMatchObject({ reason: 'severity', detail: { severity: 4 } })
    expect(check(majorOnly, { event: { severity: 3 } }).matched).toBe(true)
  })

  it('never matches a rule with no severity selected', () => {
    expect(check(rule({ flags: RF_GENERATE_ALARM }))).toMatchObject({ reason: 'severity' })
  })

  it('checks severity before the event code', () => {
    const result = check(rule({ flags: RF_SEVERITY_MAJOR, events: [99] }))
    expect(result.reason).toBe('severity')
  })

  it('checks the event before the source, and the source before time', () => {
    const r = rule({
      events: [99],
      sources: [OTHER_NODE],
      timeFrames: [frame({ startTime: 0, endTime: 60 })],
    })
    expect(check(r).reason).toBe('event')
    expect(check({ ...r, events: [1] }).reason).toBe('source')
    expect(check({ ...r, events: [1], sources: [NODE] }).reason).toBe('time')
  })
})

describe('checkRule: event list', () => {
  it('matches an event in the list and skips one that is not', () => {
    expect(check(rule({ events: [1, 2] })).matched).toBe(true)
    expect(check(rule({ events: [2, 3] }))).toMatchObject({
      reason: 'event',
      detail: { negated: false },
    })
  })

  it('flips the result when negated', () => {
    const negated = { flags: RF_ALL_SEVERITIES | RF_NEGATED_EVENTS }
    expect(check(rule({ ...negated, events: [1] }))).toMatchObject({
      reason: 'event',
      detail: { negated: true },
    })
    expect(check(rule({ ...negated, events: [2] })).matched).toBe(true)
  })

  it('matches any event with an empty list, and none when that list is negated', () => {
    const anyEvent = rule({ events: [], sources: [NODE] })
    expect(check(anyEvent).matched).toBe(true)
    const negated = { ...anyEvent, flags: RF_ALL_SEVERITIES | RF_NEGATED_EVENTS }
    expect(check(negated)).toMatchObject({ reason: 'event', detail: { empty: true } })
  })
})

describe('checkRule: sources', () => {
  it('matches the source itself or any ancestor', () => {
    expect(check(rule({ sources: [NODE] })).matched).toBe(true)
    expect(check(rule({ sources: [SERVICE_ROOT] })).matched).toBe(true)
    expect(check(rule({ sources: [OTHER_NODE] }))).toMatchObject({
      reason: 'source',
      detail: { negated: false },
    })
  })

  it('excludes the source itself or through an ancestor', () => {
    expect(check(rule({ sourceExclusions: [NODE] }))).toMatchObject({
      reason: 'source',
      detail: { excludedBy: NODE },
    })
    const viaContainer = rule({
      sources: [SERVICE_ROOT],
      sourceExclusions: [OTHER_NODE, CONTAINER],
    })
    expect(check(viaContainer)).toMatchObject({ detail: { excludedBy: CONTAINER } })
  })

  it('matches any source not excluded when only exclusions are set', () => {
    expect(check(rule({ sourceExclusions: [OTHER_NODE] })).matched).toBe(true)
  })

  it('flips every outcome when negated', () => {
    const negated = { flags: RF_ALL_SEVERITIES | RF_NEGATED_SOURCE }
    expect(check(rule({ ...negated, sources: [CONTAINER] }))).toMatchObject({
      reason: 'source',
      detail: { negated: true, matchedBy: CONTAINER },
    })
    expect(check(rule({ ...negated, sources: [OTHER_NODE] })).matched).toBe(true)
    expect(check(rule({ ...negated, sourceExclusions: [CONTAINER] })).matched).toBe(true)
    expect(check(rule({ ...negated, sourceExclusions: [OTHER_NODE] }))).toMatchObject({
      reason: 'source',
      detail: { negated: true, matchedBy: null },
    })
  })

  it('never matches a negated rule without sources or exclusions', () => {
    const r = rule({ flags: RF_ALL_SEVERITIES | RF_NEGATED_SOURCE })
    expect(check(r)).toMatchObject({ reason: 'source', detail: { empty: true } })
  })

  it('matches an unknown source object only when negated', () => {
    const unknown = { event: { sourceId: 999 } }
    expect(check(rule({ sources: [NODE] }), unknown)).toMatchObject({
      reason: 'source',
      detail: { unknownObject: true },
    })
    const negated = rule({ flags: RF_ALL_SEVERITIES | RF_NEGATED_SOURCE, sources: [NODE] })
    expect(check(negated, unknown).matched).toBe(true)
    // With no sources at all the object is never looked up.
    expect(check(rule(), unknown).matched).toBe(true)
  })
})

describe('time frames', () => {
  const officeHours = frame({ startTime: 480, endTime: 1020, dayOfWeek: 62 })

  it('matches inside the range and skips outside it with the frame in words', () => {
    expect(check(rule({ timeFrames: [officeHours] })).matched).toBe(true)
    const evening = { now: new Date(2026, 10, 20, 17, 1) }
    expect(check(rule({ timeFrames: [officeHours] }), evening)).toMatchObject({
      reason: 'time',
      detail: { negated: false, frames: ['08:00–17:00, Mon, Tue, Wed, Thu, Fri, Sun only'] },
    })
  })

  it('includes both ends of the range', () => {
    expect(timeFrameMatches(officeHours, new Date(2026, 10, 20, 8, 0))).toBe(true)
    expect(timeFrameMatches(officeHours, new Date(2026, 10, 20, 17, 0))).toBe(true)
  })

  it('never matches a range that wraps midnight', () => {
    const night = frame({ startTime: 22 * 60, endTime: 6 * 60 })
    expect(timeFrameMatches(night, new Date(2026, 10, 20, 23, 0))).toBe(false)
    expect(timeFrameMatches(night, new Date(2026, 10, 20, 3, 0))).toBe(false)
  })

  it('flips the result when negated, and an empty negated list never matches', () => {
    const negated = { flags: RF_ALL_SEVERITIES | RF_NEGATED_TIME_FRAMES }
    expect(check(rule({ ...negated, timeFrames: [officeHours] }))).toMatchObject({
      reason: 'time',
      detail: { negated: true, frame: '08:00–17:00, Mon, Tue, Wed, Thu, Fri, Sun only' },
    })
    expect(
      check(rule({ ...negated, timeFrames: [officeHours] }), { now: new Date(2026, 10, 21, 10, 0) })
        .matched,
    ).toBe(true)
    expect(check(rule({ ...negated }))).toMatchObject({ reason: 'time', detail: { empty: true } })
  })

  it('matches when any one frame matches', () => {
    const weekend = frame({ dayOfWeek: 64 })
    expect(check(rule({ timeFrames: [weekend, officeHours] })).matched).toBe(true)
  })

  it('reads the last-day bit per month, February in a leap year included', () => {
    const lastDay = frame({ dayOfMonth: 'L' })
    expect(timeFrameMatches(lastDay, new Date(2027, 1, 28, 12, 0))).toBe(true)
    expect(timeFrameMatches(lastDay, new Date(2028, 1, 28, 12, 0))).toBe(false)
    expect(timeFrameMatches(lastDay, new Date(2028, 1, 29, 12, 0))).toBe(true)
    expect(timeFrameMatches(lastDay, new Date(2026, 3, 30, 12, 0))).toBe(true)
  })

  it('restricts by month', () => {
    const december = frame({ month: 2048 })
    expect(timeFrameMatches(december, FRIDAY_10AM)).toBe(false)
    expect(timeFrameMatches(december, THURSDAY_31ST)).toBe(true)
  })

  // Day 31 and Sunday share bit 31 on the server.
  it('lets a weekday-only frame over every day of the month match on Sunday, and says why', () => {
    const r = rule({ timeFrames: [frame({ dayOfWeek: 62 })] })
    const result = check(r, { now: SUNDAY_10AM })
    expect(result.matched).toBe(true)
    expect(result.notes).toEqual([
      { type: 'time-clash', clash: 'sunday', frame: expect.any(String) },
    ])
    expect(noteText(result.notes[0])).toMatch(/matched on a Sunday/)
  })

  it('lets a day-restricted frame that lists Sunday match on the 31st', () => {
    const firstWeekendDays = frame({ dayOfMonth: '1-5', dayOfWeek: 65 })
    expect(timeFrameMatches(firstWeekendDays, THURSDAY_31ST)).toBe(false)
    const withSunday = frame({ dayOfMonth: '1-5', dayOfWeek: 127 })
    expect(timeFrameMatches(withSunday, THURSDAY_31ST)).toBe(true)
    expect(bit31Clash(withSunday.date, THURSDAY_31ST)).toBe('day-31')
  })

  it('reports no clash where bit 31 means what it says', () => {
    const everyDay = frame({})
    expect(bit31Clash(everyDay.date, SUNDAY_10AM)).toBeNull()
    expect(bit31Clash(everyDay.date, THURSDAY_31ST)).toBeNull()
    expect(bit31Clash(frame({ dayOfMonth: '1-5, L' }).date, THURSDAY_31ST)).toBeNull()
  })
})

describe('checkRule: filter script', () => {
  const scripted = rule({ filterScript: 'return $event.parameters[0] > 90;' })

  it('takes the assumed result and says it was assumed', () => {
    expect(check(scripted)).toEqual({ matched: true, assumed: ['script'], notes: [] })
    expect(check(scripted, { scriptOutcome: () => 'no-match' })).toMatchObject({
      matched: false,
      reason: 'script',
      assumed: ['script'],
    })
  })

  it('asks per rule', () => {
    const seen = []
    check(scripted, {
      scriptOutcome: (r) => {
        seen.push(r.guid)
        return 'match'
      },
    })
    expect(seen).toEqual([scripted.guid])
  })

  it('is not consulted when an earlier check already failed', () => {
    let asked = false
    check({ ...scripted, events: [99] }, { scriptOutcome: () => ((asked = true), 'match') })
    expect(asked).toBe(false)
  })
})

describe('simulateEvent', () => {
  it('walks the main chain in order and ends after its last rule', () => {
    const trace = simulate({ 0: [rule({ events: [9] }), rule(), rule({ events: [9] })] })
    expect(outcomes(trace)).toEqual([
      [0, 1, 'skipped'],
      [0, 2, 'matched'],
      [0, 3, 'skipped'],
    ])
    expect(trace.stoppedAt).toBeNull()
    expect(trace.chainsEntered).toEqual([
      { chainId: 0, depth: 0, fromChainId: null, fromRuleGuid: null, fromVisit: null },
    ])
  })

  it('lists the steps of a matched rule in server order', () => {
    const r = rule({ flags: RF_ALL_SEVERITIES | RF_GENERATE_ALARM, actions: [{ id: 3 }] })
    const [visit] = simulate({ 0: [r] }).visits
    expect(visit.steps.map((s) => s.type)).toEqual(['alarm-generate', 'server-action'])
  })

  it('stops at a matching rule with stop processing; later rules are not reached', () => {
    const stopper = rule({ flags: RF_ALL_SEVERITIES | RF_STOP_PROCESSING })
    const trace = simulate({ 0: [stopper, rule(), rule()] })
    expect(outcomes(trace)).toEqual([
      [0, 1, 'matched'],
      [0, 2, 'not-reached'],
      [0, 3, 'not-reached'],
    ])
    expect(trace.visits[0].stops).toBe(true)
    expect(trace.stoppedAt).toEqual({ chainId: 0, ruleGuid: stopper.guid, entry: 0 })
  })

  it('enters a called chain and comes back after its last rule', () => {
    const caller = rule({ chainCalls: [5] })
    const trace = simulate({
      0: [caller, rule()],
      5: [rule({ events: [9] }), rule()],
    })
    expect(outcomes(trace)).toEqual([
      [0, 1, 'matched'],
      [5, 1, 'skipped'],
      [5, 2, 'matched'],
      [0, 2, 'matched'],
    ])
    expect(trace.chainsEntered[1]).toEqual({
      chainId: 5,
      depth: 1,
      fromChainId: 0,
      fromRuleGuid: caller.guid,
      fromVisit: 0,
    })
    expect(trace.visits[0].calls).toEqual([{ chainId: 5, result: 'entered', entry: 1 }])
    expect(trace.visits[1]).toMatchObject({ entry: 1, depth: 1 })
  })

  it('runs the chain calls before honouring the calling rule’s own stop', () => {
    const caller = rule({ flags: RF_ALL_SEVERITIES | RF_STOP_PROCESSING, chainCalls: [5] })
    const trace = simulate({ 0: [caller, rule()], 5: [rule()] })
    expect(outcomes(trace)).toEqual([
      [0, 1, 'matched'],
      [5, 1, 'matched'],
      [0, 2, 'not-reached'],
    ])
    expect(trace.stoppedAt.ruleGuid).toBe(caller.guid)
  })

  it('stops the whole event when a rule inside a called chain stops', () => {
    const stopper = rule({ flags: RF_ALL_SEVERITIES | RF_STOP_PROCESSING })
    const caller = rule({ chainCalls: [5, 6] })
    const trace = simulate({
      0: [caller, rule()],
      5: [stopper, rule()],
      6: [rule()],
    })
    expect(outcomes(trace)).toEqual([
      [0, 1, 'matched'],
      [5, 1, 'matched'],
      [5, 2, 'not-reached'],
      [0, 2, 'not-reached'],
    ])
    expect(trace.stoppedAt).toEqual({ chainId: 5, ruleGuid: stopper.guid, entry: 1 })
    expect(trace.visits[0].calls).toEqual([
      { chainId: 5, result: 'entered', entry: 1 },
      { chainId: 6, result: 'not-reached' },
    ])
    expect(trace.chainsEntered.map((e) => e.chainId)).toEqual([0, 5])
  })

  it('makes several calls of one rule in order, each chain walked to its end first', () => {
    const trace = simulate({ 0: [rule({ chainCalls: [6, 5] })], 5: [rule()], 6: [rule()] })
    expect(trace.chainsEntered.map((e) => e.chainId)).toEqual([0, 6, 5])
    expect(outcomes(trace).map(([chainId]) => chainId)).toEqual([0, 6, 5])
  })

  it('skips a call into a chain already on the call stack, and walks on', () => {
    const backToMain = rule({ chainCalls: [0, 5] })
    const trace = simulate({ 0: [rule({ chainCalls: [5] })], 5: [backToMain, rule()] })
    expect(trace.visits[1].calls).toEqual([
      { chainId: 0, result: 'loop' },
      { chainId: 5, result: 'loop' },
    ])
    expect(trace.loopsSkipped).toEqual([
      { chainId: 0, fromChainId: 5, fromRuleGuid: backToMain.guid },
      { chainId: 5, fromChainId: 5, fromRuleGuid: backToMain.guid },
    ])
    expect(outcomes(trace)).toEqual([
      [0, 1, 'matched'],
      [5, 1, 'matched'],
      [5, 2, 'matched'],
    ])
  })

  it('enters a chain again once the earlier call has returned', () => {
    const trace = simulate({
      0: [rule({ chainCalls: [5] }), rule({ chainCalls: [6] })],
      5: [rule()],
      6: [rule({ chainCalls: [5] })],
    })
    expect(trace.chainsEntered.map((e) => [e.chainId, e.depth])).toEqual([
      [0, 0],
      [5, 1],
      [6, 1],
      [5, 2],
    ])
    expect(trace.loopsSkipped).toEqual([])
  })

  it('records a call into a chain it was not given', () => {
    const caller = rule({ chainCalls: [42] })
    const trace = simulate({ 0: [caller, rule()] })
    expect(trace.visits[0].calls).toEqual([{ chainId: 42, result: 'unavailable' }])
    expect(trace.unavailableChains).toEqual([
      { chainId: 42, fromChainId: 0, fromRuleGuid: caller.guid },
    ])
    expect(trace.visits[1].outcome).toBe('matched')
  })

  it('cannot start without the main chain', () => {
    const trace = simulate({ 5: [rule()] })
    expect(trace.visits).toEqual([])
    expect(trace.unavailableChains).toEqual([{ chainId: 0, fromChainId: null, fromRuleGuid: null }])
  })

  it('carries skip details and assumptions on each visit', () => {
    const scripted = rule({ filterScript: 'return false;' })
    const trace = simulate(
      { 0: [rule({ events: [9] }), scripted] },
      { scriptOutcome: () => 'no-match' },
    )
    expect(trace.visits[0]).toMatchObject({ reason: 'event', detail: { negated: false } })
    expect(trace.visits[1]).toMatchObject({ reason: 'script', assumed: ['script'] })
  })
})

describe('traceMarks and tracePath', () => {
  const shared = rule({ guid: 'shared', events: [1], flags: RF_SEVERITY_CRITICAL })
  const trace = simulate({
    0: [rule({ guid: 'm1', chainCalls: [5] }), rule({ guid: 'm2', chainCalls: [5] })],
    5: [shared],
  })

  it('marks each rule by its most telling visit and counts the visits', () => {
    const { rules, chains } = traceMarks(trace)
    expect(rules.get('m1')).toMatchObject({ outcome: 'matched', count: 1 })
    expect(rules.get('shared')).toMatchObject({ outcome: 'matched', count: 2 })
    expect(chains.get(5)).toEqual({ entries: 2 })
    expect(chains.has(7)).toBe(false)
  })

  it('prefers a match over a skip of the same rule', () => {
    const mixed = {
      visits: [
        { ruleGuid: 'x', outcome: 'skipped' },
        { ruleGuid: 'x', outcome: 'matched' },
        { ruleGuid: 'x', outcome: 'not-reached' },
      ],
      chainsEntered: [],
    }
    expect(traceMarks(mixed).rules.get('x')).toMatchObject({ outcome: 'matched', count: 3 })
  })

  it('numbers chains and calls in the order the event entered them', () => {
    const path = tracePath(trace)
    expect(path.chains).toEqual(
      new Map([
        [0, [1]],
        [5, [2, 3]],
      ]),
    )
    expect(path.edges).toEqual(new Map([['0>5', [2, 3]]]))
    expect(path.loops).toEqual(new Set())
  })

  it('lists the calls skipped as loops', () => {
    const looped = simulate({ 0: [rule({ chainCalls: [5] })], 5: [rule({ chainCalls: [0] })] })
    expect(tracePath(looped).loops).toEqual(new Set(['5>0']))
  })
})

describe('skipReasonText', () => {
  const names = {
    sourceId: NODE,
    objectName: (id) => ({ [NODE]: 'web-01', [CONTAINER]: 'DC' })[id],
  }

  it.each([
    [{ reason: 'disabled' }, 'rule is disabled'],
    [{ reason: 'severity', detail: { severity: 2 } }, 'severity Minor is not selected'],
    [{ reason: 'event', detail: { negated: false } }, "event not in the rule's list"],
    [{ reason: 'source', detail: { excludedBy: NODE } }, 'source excluded: web-01'],
    [{ reason: 'source', detail: { excludedBy: CONTAINER } }, 'source excluded through DC'],
    [
      { reason: 'time', detail: { negated: false, frames: ['08:00–17:00', 'Weekends'] } },
      'outside 08:00–17:00 or Weekends',
    ],
    [
      { reason: 'time', detail: { negated: true, frame: '08:00–17:00' } },
      'inside 08:00–17:00, which the rule excludes',
    ],
    [{ reason: 'script', detail: { assumed: true } }, 'filter script assumed not to match'],
  ])('%o', (visit, text) => {
    expect(skipReasonText(visit, names)).toBe(text)
  })
})

describe('traceFromProcessingMetadata', () => {
  const chains = [
    { id: 0, name: 'Main' },
    { id: 2, name: 'Escalation' },
    { id: 3, name: 'Backup handling' },
  ]

  it('rebuilds the nesting from the chain-call effects', () => {
    const trace = traceFromProcessingMetadata(
      [
        {
          rule: 3,
          chainId: 0,
          guid: 'm3',
          comments: 'Threshold',
          effects: [
            { type: 'alarm', id: 7 },
            { type: 'chain-call', info: 'Escalation' },
          ],
        },
        { rule: 1, chainId: 2, guid: 'e1', effects: [{ type: 'alarm', id: 8 }] },
        { rule: 6, chainId: 0, guid: 'm6', effects: [] },
      ],
      chains,
    )
    expect(trace.replay).toBe(true)
    expect(trace.chainsEntered.map((e) => [e.chainId, e.depth, e.fromRuleGuid])).toEqual([
      [0, 0, null],
      [2, 1, 'm3'],
    ])
    expect(trace.visits.map((v) => [v.ruleGuid, v.entry, v.ruleNumber])).toEqual([
      ['m3', 0, 3],
      ['e1', 1, 1],
      ['m6', 0, 6],
    ])
    expect(trace.visits[0].calls).toEqual([{ chainId: 2, result: 'entered', entry: 1 }])
  })

  it('records a loop and enters a chain whose rules all missed', () => {
    const trace = traceFromProcessingMetadata(
      [
        {
          rule: 1,
          chainId: 0,
          guid: 'm1',
          effects: [
            { type: 'chain-call', info: 'Backup handling' },
            { type: 'chain-call-loop', info: 'Main' },
          ],
        },
      ],
      chains,
    )
    expect(trace.chainsEntered.map((e) => e.chainId)).toEqual([0, 3])
    expect(trace.loopsSkipped).toEqual([{ chainId: 0, fromChainId: 0, fromRuleGuid: 'm1' }])
  })

  it('picks among namesakes the chain the next record comes from', () => {
    const twins = [...chains, { id: 4, name: 'Escalation' }]
    const trace = traceFromProcessingMetadata(
      [
        { rule: 1, chainId: 0, guid: 'm1', effects: [{ type: 'chain-call', info: 'Escalation' }] },
        { rule: 1, chainId: 4, guid: 'x1', effects: [] },
      ],
      twins,
    )
    expect(trace.chainsEntered.map((e) => e.chainId)).toEqual([0, 4])
  })

  it('keeps records it cannot place instead of dropping them', () => {
    const trace = traceFromProcessingMetadata(
      [
        { rule: 1, chainId: 0, guid: 'm1', effects: [{ type: 'chain-call', info: 'Gone' }] },
        { rule: 1, chainId: 9, guid: 'g1', effects: [] },
      ],
      chains,
    )
    expect(trace.visits.map((v) => v.ruleGuid)).toEqual(['m1', 'g1'])
    expect(trace.visits[0].calls).toEqual([{ chainId: null, name: 'Gone', result: 'unavailable' }])
  })

  it('reads nothing from a missing list', () => {
    expect(traceFromProcessingMetadata(undefined, chains).visits).toEqual([])
  })
})
