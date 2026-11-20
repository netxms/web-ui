// Dev-only emulation of how the server walks one event through the event processing policy
// (`EPRule::processEvent`, `EventProcessingPolicy::processRuleList` / `enterChain`, server
// src/server/core/epp.cpp). Nothing is executed. The console cannot run NXSL, so a filter script
// takes an assumed result; the trace says where it did.

import { MAIN_CHAIN_ID, callEdgeKey } from '@/utils/eppChains'
import {
  RF_ACCEPT_CORRELATED_EVENTS,
  RF_DISABLED,
  RF_NEGATED_EVENTS,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SEVERITY_FLAGS,
} from '@/utils/eppRules'
import { isFilterEmpty, ruleSteps, stopsProcessing } from '@/utils/eppRuleSummary'
import { decodeTimeFrame, frameLabel, hasBit } from '@/utils/eppTimeFrames'
import { getStatusInfo } from '@/utils/objectUtils'

/**
 * @typedef {object} SimulatedEvent
 * @property {number} code
 * @property {number} severity 0 Normal … 4 Critical
 * @property {number|null} sourceId
 * @property {boolean} [correlated] has a root event
 *
 * @typedef {object} TraceVisit
 * @property {number} chainId
 * @property {number} entry index in `chainsEntered`
 * @property {number} depth 0 in the main chain
 * @property {string} ruleGuid
 * @property {number} ruleNumber 1-based place in its chain
 * @property {'matched'|'skipped'|'not-reached'} outcome
 * @property {string} [reason] why a skipped rule was skipped, a `SKIP_REASONS` entry
 * @property {object} [detail] what the failing check saw
 * @property {string[]} [assumed] checks decided by an assumption rather than by the rule
 * @property {object[]} [notes] facts worth knowing about a check that passed
 * @property {object[]} [steps] `ruleSteps(rule)` of a matched rule
 * @property {Array<{ chainId: number, result: 'entered'|'loop'|'unavailable'|'not-reached',
 *   entry?: number }>} [calls] chain calls of a matched rule, in order
 * @property {boolean} [stops] this rule stopped processing
 * @property {object[]} [effects] replayed visits: the server's recorded effects
 *
 * @typedef {object} Trace
 * @property {TraceVisit[]} visits in execution order
 * @property {Array<{ chainId: number, depth: number, fromChainId: number|null,
 *   fromRuleGuid: string|null, fromVisit: number|null }>} chainsEntered
 * @property {Array<{ chainId: number, fromChainId: number, fromRuleGuid: string }>} loopsSkipped
 * @property {Array<{ chainId: number, fromChainId: number|null, fromRuleGuid: string|null }>}
 *   unavailableChains calls into chains not in `chains`: unreadable, or deleted
 * @property {{ chainId: number, ruleGuid: string, entry: number }|null} stoppedAt
 * @property {boolean} [replay] rebuilt from a real event's processing metadata
 */

/** In the server's order: the first failing check skips the rule. */
export const SKIP_REASONS = [
  'disabled',
  'correlated',
  'empty-filter',
  'severity',
  'event',
  'source',
  'time',
  'script',
]

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// As the server's IsLastDayOfMonth: every fourth year is a leap year, 2100 included.
function isLastDayOfMonth(now) {
  const month = now.getMonth()
  if (now.getFullYear() % 4 === 0 && month === 1) return now.getDate() === 29
  return now.getDate() === DAYS_IN_MONTH[month]
}

/**
 * `TimeFrame::match`. The range is inclusive and does not wrap midnight: a frame whose start is
 * after its end never matches.
 *
 * @param {{ time: number, date: number }} frame as the server sends it
 * @param {Date} now read in local time
 */
export function timeFrameMatches(frame, now) {
  const time = frame?.time ?? 0
  const date = frame?.date ?? 0
  const start = Math.floor(time / 10000)
  const end = time % 10000
  const current = now.getHours() * 100 + now.getMinutes()
  return (
    start <= current &&
    current <= end &&
    (hasBit(date, now.getDate()) || (hasBit(date, 0) && isLastDayOfMonth(now))) &&
    hasBit(date, now.getDay() + 31) &&
    hasBit(date, now.getMonth() + 39)
  )
}

const DAYS_1_TO_30 = Array.from({ length: 30 }, (_, i) => i + 1)
const MONDAY_TO_SATURDAY = [32, 33, 34, 35, 36, 37]

/**
 * Bit 31 is both day 31 and Sunday on the server. Names the meaning a matching frame most likely
 * did not intend: 'sunday' for a weekday-restricted frame over every day of the month,
 * 'day-31' for a day-restricted frame that also lists Sunday.
 *
 * @returns {'sunday'|'day-31'|null}
 */
export function bit31Clash(date, now) {
  const everyDay = DAYS_1_TO_30.every((day) => hasBit(date, day))
  if (now.getDay() === 0 && now.getDate() !== 31) {
    const everyOtherWeekday = MONDAY_TO_SATURDAY.every((b) => hasBit(date, b))
    return everyDay && !everyOtherWeekday ? 'sunday' : null
  }
  if (now.getDate() === 31 && now.getDay() !== 0) {
    return !everyDay && !hasBit(date, 0) ? 'day-31' : null
  }
  return null
}

function skip(reason, detail = {}, assumed = []) {
  return { matched: false, reason, detail, assumed }
}

function checkEvent(rule, flags, event) {
  const events = rule.events ?? []
  const negated = !!(flags & RF_NEGATED_EVENTS)
  if (!events.length) return negated ? { negated, empty: true } : null
  const inList = events.includes(event.code)
  return (negated ? !inList : inList) ? null : { negated }
}

function checkSource(rule, flags, event, ancestorsOf) {
  const sources = rule.sources ?? []
  const exclusions = rule.sourceExclusions ?? []
  const negated = !!(flags & RF_NEGATED_SOURCE)
  if (!sources.length && !exclusions.length) return negated ? { negated, empty: true } : null

  const ancestors = event.sourceId ? ancestorsOf(event.sourceId) : null
  if (ancestors == null) return negated ? null : { unknownObject: true }

  const covers = (id) => id === event.sourceId || ancestors.has(id)
  const excludedBy = exclusions.find(covers)
  if (excludedBy !== undefined) return negated ? null : { excludedBy }

  const matchedBy = sources.find(covers)
  const match = !sources.length || matchedBy !== undefined
  if (negated ? !match : match) return null
  return negated ? { negated, matchedBy: matchedBy ?? null } : { negated: false }
}

function checkTime(rule, flags, now) {
  const frames = rule.timeFrames ?? []
  const negated = !!(flags & RF_NEGATED_TIME_FRAMES)
  if (!frames.length) return negated ? { fail: { negated, empty: true } } : {}

  const index = frames.findIndex((frame) => timeFrameMatches(frame, now))
  const match = index !== -1
  const clash = match ? bit31Clash(frames[index].date ?? 0, now) : null
  const labels = frames.map((frame) => frameLabel(decodeTimeFrame(frame)))
  if (negated ? !match : match) {
    return clash ? { note: { type: 'time-clash', clash, frame: labels[index] } } : {}
  }
  return { fail: { negated, frames: labels, frame: match ? labels[index] : null, clash } }
}

/**
 * Whether the server would run `rule` for the event, checked in the server's order.
 *
 * A filter script that does not compile is dropped by the server: the rule passes the script
 * check, and counts as filterless when nothing else is set.
 *
 * @returns {{ matched: true, assumed: string[], notes: object[] } |
 *   { matched: false, reason: string, detail: object, assumed: string[] }}
 */
export function checkRule(rule, { event, now, ancestorsOf, scriptOutcome }) {
  const flags = rule.flags ?? 0
  const script = rule.errors?.filterScriptCompilationError ? '' : (rule.filterScript ?? '')

  if (flags & RF_DISABLED) return skip('disabled')
  if (event.correlated && !(flags & RF_ACCEPT_CORRELATED_EVENTS)) return skip('correlated')
  if (isFilterEmpty({ ...rule, filterScript: script })) return skip('empty-filter')
  if (!(flags & (RF_SEVERITY_FLAGS[event.severity] ?? 0))) {
    return skip('severity', { severity: event.severity })
  }

  const eventFail = checkEvent(rule, flags, event)
  if (eventFail) return skip('event', eventFail)

  const sourceFail = checkSource(rule, flags, event, ancestorsOf)
  if (sourceFail) return skip('source', sourceFail)

  const notes = []
  const time = checkTime(rule, flags, now)
  if (time.fail) return skip('time', time.fail)
  if (time.note) notes.push(time.note)

  // Whitespace compiles to nothing, which the server treats as a match.
  const assumed = []
  if (script.trim()) {
    if (scriptOutcome(rule) === 'no-match') return skip('script', { assumed: true }, ['script'])
    assumed.push('script')
  }

  return { matched: true, assumed, notes }
}

/**
 * Walk an event through the policy as the server would, starting at the main chain.
 *
 * @param {object} args
 * @param {Map<number, object[]>} args.chains chain id → rules in order; drafts included
 * @param {SimulatedEvent} args.event
 * @param {Date} args.now the server matches time frames against its clock at processing time
 * @param {(objectId: number) => Set<number>|null} args.ancestorsOf every ancestor of the
 *   object, or null when the object does not exist
 * @param {(rule: object) => 'match'|'no-match'} [args.scriptOutcome] assumed result of a filter
 *   script
 * @param {number} [args.startChainId]
 * @returns {Trace}
 */
export function simulateEvent({
  chains,
  event,
  now,
  ancestorsOf,
  scriptOutcome = () => 'match',
  startChainId = MAIN_CHAIN_ID,
}) {
  /** @type {Trace} */
  const trace = {
    visits: [],
    chainsEntered: [],
    loopsSkipped: [],
    unavailableChains: [],
    stoppedAt: null,
  }
  const context = { event, now, ancestorsOf, scriptOutcome }
  const active = []

  function markNotReached(chainId, entry, depth, rules, from) {
    for (let i = from; i < rules.length; i++) {
      trace.visits.push({
        chainId,
        entry,
        depth,
        ruleGuid: rules[i].guid,
        ruleNumber: i + 1,
        outcome: 'not-reached',
      })
    }
  }

  /** @returns {boolean} whether processing stopped */
  function enter(chainId, depth, caller) {
    const entry = trace.chainsEntered.length
    trace.chainsEntered.push({
      chainId,
      depth,
      fromChainId: caller?.chainId ?? null,
      fromRuleGuid: caller?.ruleGuid ?? null,
      fromVisit: caller?.visit ?? null,
    })
    active.push(chainId)
    const stopped = walk(chainId, entry, depth)
    active.pop()
    return stopped
  }

  function walk(chainId, entry, depth) {
    const rules = chains.get(chainId) ?? []
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      const base = { chainId, entry, depth, ruleGuid: rule.guid, ruleNumber: i + 1 }
      const result = checkRule(rule, context)
      if (!result.matched) {
        const { reason, detail, assumed } = result
        trace.visits.push({ ...base, outcome: 'skipped', reason, detail, assumed, notes: [] })
        continue
      }

      const visit = {
        ...base,
        outcome: 'matched',
        assumed: result.assumed,
        notes: result.notes,
        steps: ruleSteps(rule),
        calls: [],
        stops: false,
      }
      const visitIndex = trace.visits.length
      trace.visits.push(visit)

      const targets = rule.chainCalls ?? []
      for (let c = 0; c < targets.length; c++) {
        const target = targets[c]
        const from = { fromChainId: chainId, fromRuleGuid: rule.guid }
        if (!chains.has(target)) {
          visit.calls.push({ chainId: target, result: 'unavailable' })
          trace.unavailableChains.push({ ...from, chainId: target })
          continue
        }
        if (active.includes(target)) {
          visit.calls.push({ chainId: target, result: 'loop' })
          trace.loopsSkipped.push({ ...from, chainId: target })
          continue
        }
        visit.calls.push({ chainId: target, result: 'entered', entry: trace.chainsEntered.length })
        if (enter(target, depth + 1, { chainId, ruleGuid: rule.guid, visit: visitIndex })) {
          for (const rest of targets.slice(c + 1)) {
            visit.calls.push({ chainId: rest, result: 'not-reached' })
          }
          markNotReached(chainId, entry, depth, rules, i + 1)
          return true
        }
      }

      if (stopsProcessing(rule)) {
        visit.stops = true
        trace.stoppedAt = { chainId, ruleGuid: rule.guid, entry }
        markNotReached(chainId, entry, depth, rules, i + 1)
        return true
      }
    }
    return false
  }

  if (!chains.has(startChainId)) {
    trace.unavailableChains.push({ chainId: startChainId, fromChainId: null, fromRuleGuid: null })
    return trace
  }
  enter(startChainId, 0, null)
  return trace
}

const OUTCOME_RANK = { 'not-reached': 1, skipped: 2, matched: 3 }

/**
 * Per rule, the visit that says most (matched over skipped over not reached), and how often the
 * event reached it; per chain, how often the event entered it.
 *
 * @param {Trace} trace
 * @returns {{ rules: Map<string, { outcome: string, visit: TraceVisit, count: number }>,
 *   chains: Map<number, { entries: number }> }}
 */
export function traceMarks(trace) {
  const rules = new Map()
  for (const visit of trace?.visits ?? []) {
    const mark = rules.get(visit.ruleGuid)
    if (!mark) {
      rules.set(visit.ruleGuid, { outcome: visit.outcome, visit, count: 1 })
      continue
    }
    mark.count++
    if (OUTCOME_RANK[visit.outcome] > OUTCOME_RANK[mark.outcome]) {
      mark.outcome = visit.outcome
      mark.visit = visit
    }
  }
  const chains = new Map()
  for (const entry of trace?.chainsEntered ?? []) {
    chains.set(entry.chainId, { entries: (chains.get(entry.chainId)?.entries ?? 0) + 1 })
  }
  return { rules, chains }
}

/**
 * The path for the Flow view: chains entered and calls taken, each with the 1-based order in
 * which the event entered (the main chain is 1).
 *
 * @param {Trace} trace
 * @returns {{ chains: Map<number, number[]>, edges: Map<string, number[]>, loops: Set<string> }}
 */
export function tracePath(trace) {
  const chains = new Map()
  const edges = new Map()
  ;(trace?.chainsEntered ?? []).forEach((entry, index) => {
    const order = index + 1
    chains.set(entry.chainId, [...(chains.get(entry.chainId) ?? []), order])
    if (entry.fromChainId == null) return
    const key = callEdgeKey(entry.fromChainId, entry.chainId)
    edges.set(key, [...(edges.get(key) ?? []), order])
  })
  const loops = new Set(
    (trace?.loopsSkipped ?? []).map((loop) => callEdgeKey(loop.fromChainId, loop.chainId)),
  )
  return { chains, edges, loops }
}

function joinOr(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`
}

/**
 * A skipped rule's reason in words, e.g. "outside 08:00–17:00".
 *
 * @param {TraceVisit} visit
 * @param {{ sourceId?: number|null, objectName?: (id: number) => string }} [names]
 */
export function skipReasonText(visit, { sourceId = null, objectName = (id) => `#${id}` } = {}) {
  const d = visit.detail ?? {}
  switch (visit.reason) {
    case 'disabled':
      return 'rule is disabled'
    case 'correlated':
      return 'event is correlated, and the rule does not accept correlated events'
    case 'empty-filter':
      return 'filter is empty, so the server skips the rule'
    case 'severity':
      return `severity ${getStatusInfo(d.severity).label} is not selected`
    case 'event':
      if (d.empty) return 'event list is empty and negated, so no event matches'
      return d.negated ? "event is in the rule's negated list" : "event not in the rule's list"
    case 'source':
      if (d.empty) return 'source list is empty and negated, so no source matches'
      if (d.unknownObject) return 'source object not found; only a negated source list matches'
      if (d.excludedBy != null) {
        return d.excludedBy === sourceId
          ? `source excluded: ${objectName(d.excludedBy)}`
          : `source excluded through ${objectName(d.excludedBy)}`
      }
      if (d.negated) {
        return d.matchedBy != null
          ? `source is in the rule's negated list (${objectName(d.matchedBy)})`
          : 'source is not excluded, and the source list is negated'
      }
      return "source not in the rule's list"
    case 'time':
      if (d.empty) return 'time frame list is empty and negated, so no time matches'
      if (d.negated) return `inside ${d.frame}, which the rule excludes`
      return `outside ${joinOr(d.frames ?? [])}`
    case 'script':
      return 'filter script assumed not to match'
    default:
      return 'skipped'
  }
}

/** A note on a check that passed, in words. */
export function noteText(note) {
  if (note.type === 'time-clash') {
    return note.clash === 'sunday'
      ? `${note.frame} matched on a Sunday: the server stores Sunday and day 31 in one bit`
      : `${note.frame} matched on the 31st: the server stores Sunday and day 31 in one bit`
  }
  return ''
}

/** Server effect type (`processingMetadata`) → the `STEP_KINDS` key drawn for it. */
export const EFFECT_STEP_TYPES = {
  alarm: 'alarm-generate',
  incident: 'incident',
  'incident-scheduled': 'incident',
  'rca-parent-alarm': 'alarm-generate',
  action: 'server-action',
  'action-script': 'action-script',
  'timer-cancel': 'timer-cancel',
  'pstorage-set': 'pstorage',
  'pstorage-delete': 'pstorage',
  'custom-attribute-set': 'custom-attributes',
  'custom-attribute-delete': 'custom-attributes',
  'downtime-start': 'downtime-start',
  'downtime-end': 'downtime-end',
  'ai-analysis': 'ai-instructions',
  'log-flag': 'log-force',
  'chain-call': 'chain-call',
  'chain-call-loop': 'chain-call',
}

/**
 * A real event's `raw_data.processingMetadata` as a trace: matched rules only, since the server
 * records nothing for rules it skipped. Chain calls carry the chain's name, resolved against
 * `chains`; an unresolved or ambiguous call leaves the following records at the caller's depth.
 *
 * @param {Array<{ rule: number, chainId: number, guid: string, comments?: string,
 *   effects?: Array<{ type: string, id?: number, scheduled?: boolean, failed?: boolean,
 *   info?: string }> }>} metadata
 * @param {Array<{ id: number, name: string }>} chains
 * @returns {Trace}
 */
export function traceFromProcessingMetadata(metadata, chains) {
  /** @type {Trace} */
  const trace = {
    visits: [],
    chainsEntered: [],
    loopsSkipped: [],
    unavailableChains: [],
    stoppedAt: null,
    replay: true,
  }
  const records = Array.isArray(metadata) ? metadata : []
  const idsByName = new Map()
  for (const chain of chains ?? []) {
    idsByName.set(chain.name, [...(idsByName.get(chain.name) ?? []), chain.id])
  }
  let next = 0

  // Names need not be unique: among namesakes, prefer the chain the next record comes from.
  function resolve(name) {
    const ids = idsByName.get(name) ?? []
    if (ids.length <= 1) return ids[0] ?? null
    const upcoming = records[next]?.chainId
    return ids.includes(upcoming) ? upcoming : ids[0]
  }

  function enter(chainId, depth, caller) {
    const entry = trace.chainsEntered.length
    trace.chainsEntered.push({
      chainId,
      depth,
      fromChainId: caller?.chainId ?? null,
      fromRuleGuid: caller?.ruleGuid ?? null,
      fromVisit: caller?.visit ?? null,
    })
    while (next < records.length && records[next].chainId === chainId) {
      const record = records[next++]
      const visitIndex = trace.visits.length
      const visit = {
        chainId,
        entry,
        depth,
        ruleGuid: record.guid,
        ruleNumber: record.rule,
        outcome: 'matched',
        comments: record.comments ?? '',
        effects: record.effects ?? [],
        calls: [],
      }
      trace.visits.push(visit)
      for (const effect of visit.effects) {
        if (effect.type !== 'chain-call' && effect.type !== 'chain-call-loop') continue
        const target = resolve(effect.info)
        if (effect.type === 'chain-call-loop') {
          visit.calls.push({ chainId: target ?? null, name: effect.info, result: 'loop' })
          trace.loopsSkipped.push({
            chainId: target ?? null,
            fromChainId: chainId,
            fromRuleGuid: record.guid,
          })
          continue
        }
        if (target == null) {
          visit.calls.push({ chainId: null, name: effect.info, result: 'unavailable' })
          trace.unavailableChains.push({
            chainId: null,
            fromChainId: chainId,
            fromRuleGuid: record.guid,
          })
          continue
        }
        visit.calls.push({ chainId: target, result: 'entered', entry: trace.chainsEntered.length })
        enter(target, depth + 1, { chainId, ruleGuid: record.guid, visit: visitIndex })
      }
    }
  }

  // The walk always starts at the main chain; records it cannot place start a new top level.
  enter(MAIN_CHAIN_ID, 0, null)
  while (next < records.length) enter(records[next].chainId, 0, null)
  return trace
}
