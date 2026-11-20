// What an event processing rule does, as plain data for the rule list: the filter as clauses and
// the actions as steps in the order the server runs them (EPRule::processEvent, server
// src/server/core/epp.cpp). Names are resolved by the caller; steps carry ids.

import {
  RF_ACCEPT_CORRELATED_EVENTS,
  RF_ADD_AI_COMMENT,
  RF_AI_ANALYZE_INCIDENT,
  RF_AI_AUTO_ASSIGN,
  RF_ALL_SEVERITIES,
  RF_CLEAR_LOG_FLAG,
  RF_CREATE_HELPDESK_TICKET,
  RF_CREATE_INCIDENT,
  RF_END_DOWNTIME,
  RF_GENERATE_ALARM,
  RF_NEGATED_EVENTS,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SET_LOG_FLAG,
  RF_SEVERITY_FLAGS,
  RF_START_DOWNTIME,
  RF_STOP_PROCESSING,
  RF_TERMINATE_BY_REGEXP,
  SEVERITY_FROM_EVENT,
  SEVERITY_RESOLVE,
  SEVERITY_TERMINATE,
  aiInstructionsOf,
} from '@/utils/eppRules'
import { decodeTimeFrame, frameLabel } from '@/utils/eppTimeFrames'

/** Step type → the group its icon is tinted with. */
export const STEP_KINDS = {
  'alarm-generate': 'alarm',
  'alarm-resolve': 'alarm',
  'alarm-terminate': 'alarm',
  incident: 'alarm',
  'helpdesk-ticket': 'alarm',
  'ai-comment': 'alarm',
  'server-action': 'run',
  'action-script': 'run',
  'ai-instructions': 'run',
  'timer-cancel': 'state',
  pstorage: 'state',
  'custom-attributes': 'state',
  'downtime-start': 'state',
  'downtime-end': 'state',
  'log-force': 'state',
  'log-disable': 'state',
  'chain-call': 'flow',
  stop: 'stop',
}

export const STEP_TITLES = {
  'alarm-generate': 'Generate alarm',
  'alarm-resolve': 'Resolve alarms',
  'alarm-terminate': 'Terminate alarms',
  incident: 'Create incident',
  'helpdesk-ticket': 'Create helpdesk ticket',
  'ai-comment': "Add AI assistant's comment",
  'server-action': 'Run',
  'action-script': 'Run script',
  'ai-instructions': 'Instruct AI assistant',
  'timer-cancel': 'Cancel timers',
  pstorage: 'Persistent storage',
  'custom-attributes': 'Custom attributes',
  'downtime-start': 'Start downtime',
  'downtime-end': 'End downtime',
  'log-force': 'Force event logging',
  'log-disable': 'Disable event logging',
  'chain-call': 'Enter chain',
  stop: 'Stop processing',
}

/** `rule.errors` key (server `s_ruleErrorMapping`) → message and the section that fixes it. */
const ERRORS = {
  missingSourceObject: { message: 'A source object no longer exists', section: 'sources' },
  missingEvent: { message: 'An event no longer exists', section: 'events' },
  missingAction: { message: 'A server action no longer exists', section: 'serveractions' },
  missingAlarmCategory: { message: 'An alarm category no longer exists', section: 'alarm' },
  filterScriptCompilationError: {
    message: 'The filter script does not compile',
    section: 'filter-script',
  },
  actionScriptCompilationError: {
    message: 'The action script does not compile',
    section: 'script',
  },
}

const DURATION_UNITS = [
  ['d', 86400],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
]

/** Seconds as "2h 30m", as the desktop console writes durations. */
export function formatDuration(seconds) {
  let rest = Math.floor(Number(seconds) || 0)
  if (rest <= 0) return '0s'
  const parts = []
  for (const [unit, size] of DURATION_UNITS) {
    const value = Math.floor(rest / size)
    if (value > 0) {
      parts.push(`${value}${unit}`)
      rest -= value * size
    }
  }
  return parts.join(' ')
}

/**
 * Action timer fields are strings: plain seconds, a duration such as "2h 30m", or a macro.
 *
 * @param {string|null|undefined} value
 * @returns {string} empty when unset
 */
export function formatTimerValue(value) {
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) ? formatDuration(Number(text)) : text
}

/** First line that is neither blank nor a `//` comment, shortened. */
export function scriptPreview(script, max = 80) {
  if (!script?.trim()) return null
  const lines = script.split('\n')
  const line = (lines.find((l) => l.trim() && !l.trim().startsWith('//')) ?? lines[0]).trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}

/** The server skips a rule with no filter at all instead of matching every event. */
export function isFilterEmpty(rule) {
  return (
    !rule.events?.length &&
    !rule.sources?.length &&
    !rule.sourceExclusions?.length &&
    !rule.timeFrames?.length &&
    !rule.filterScript &&
    ((rule.flags ?? 0) & RF_ALL_SEVERITIES) === RF_ALL_SEVERITIES
  )
}

/**
 * Only the parts that narrow the match, in the order the server checks them.
 *
 * @param {object} rule
 * @returns {Array<object>} each with `key` and `section` (a `RULE_SECTIONS` key)
 */
export function ruleConditions(rule) {
  const flags = rule.flags ?? 0
  const clauses = []

  if (rule.events?.length) {
    clauses.push({
      key: 'events',
      section: 'events',
      negated: !!(flags & RF_NEGATED_EVENTS),
      correlated: !!(flags & RF_ACCEPT_CORRELATED_EVENTS),
      events: rule.events,
    })
  }

  if (rule.sources?.length || rule.sourceExclusions?.length) {
    clauses.push({
      key: 'sources',
      section: 'sources',
      negated: !!(flags & RF_NEGATED_SOURCE),
      sources: rule.sources ?? [],
      exclusions: rule.sourceExclusions ?? [],
    })
  }

  if ((flags & RF_ALL_SEVERITIES) !== RF_ALL_SEVERITIES) {
    clauses.push({
      key: 'severity',
      section: 'severity',
      severities: RF_SEVERITY_FLAGS.flatMap((flag, severity) => (flags & flag ? [severity] : [])),
    })
  }

  if (rule.timeFrames?.length) {
    clauses.push({
      key: 'time',
      section: 'time',
      negated: !!(flags & RF_NEGATED_TIME_FRAMES),
      frames: rule.timeFrames.map((frame) => frameLabel(decodeTimeFrame(frame))),
    })
  }

  if (rule.filterScript?.trim()) {
    clauses.push({
      key: 'script',
      section: 'filter-script',
      preview: scriptPreview(rule.filterScript),
    })
  }

  return clauses
}

function alarmStep(rule) {
  const flags = rule.flags ?? 0
  const severity = rule.alarmSeverity ?? SEVERITY_FROM_EVENT
  const common = {
    kind: 'alarm',
    section: 'alarm',
    key: rule.alarmKey ?? '',
    categoryScript: rule.alarmCategoryScript ?? '',
    categories: rule.alarmCategoryScript ? [] : (rule.alarmCategories ?? []),
    extras: alarmExtras(rule),
  }

  if (severity === SEVERITY_TERMINATE || severity === SEVERITY_RESOLVE) {
    const type = severity === SEVERITY_TERMINATE ? 'alarm-terminate' : 'alarm-resolve'
    return { ...common, type, regex: !!(flags & RF_TERMINATE_BY_REGEXP) }
  }

  return {
    ...common,
    type: 'alarm-generate',
    severity: severity < SEVERITY_FROM_EVENT ? severity : null,
    message: rule.alarmMessage ?? '',
    impact: rule.alarmImpact ?? '',
    timeout: rule.alarmTimeout > 0 ? formatDuration(rule.alarmTimeout) : '',
    timeoutEvent: rule.alarmTimeout > 0 ? (rule.alarmTimeoutEvent ?? 0) : 0,
    flapCount: rule.alarmFlapCount > 0 ? rule.alarmFlapCount : 0,
    flapWindow: rule.alarmFlapCount > 0 ? formatDuration(rule.alarmFlapWindow) : '',
    rootCauseScript: rule.rootCauseAnalysisScript ?? '',
  }
}

function alarmExtras(rule) {
  const flags = rule.flags ?? 0
  const extras = []
  if (flags & RF_CREATE_HELPDESK_TICKET) {
    extras.push({ type: 'helpdesk-ticket', kind: 'alarm', section: 'alarm' })
  }
  if (flags & RF_ADD_AI_COMMENT) {
    extras.push({ type: 'ai-comment', kind: 'alarm', section: 'alarm' })
  }
  if (flags & RF_CREATE_INCIDENT) {
    const analysis = !!(flags & RF_AI_ANALYZE_INCIDENT)
    extras.push({
      type: 'incident',
      kind: 'alarm',
      section: 'incident',
      delay: rule.incidentDelay > 0 ? formatDuration(rule.incidentDelay) : '',
      aiAnalysis: analysis,
      autoAssign: analysis && !!(flags & RF_AI_AUTO_ASSIGN),
      prompt: analysis ? (rule.incidentAIPrompt ?? '') : '',
    })
  }
  return extras
}

function step(type, section, fields = {}) {
  return { type, kind: STEP_KINDS[type], section, ...fields }
}

/**
 * Every action the rule takes, in server execution order. Stop processing is not a step: it is
 * `rule.flags & RF_STOP_PROCESSING`, shown after them.
 *
 * @param {object} rule
 * @returns {Array<object>} each with a unique `id`, `type`, `kind` and `section`
 */
export function ruleSteps(rule) {
  const flags = rule.flags ?? 0
  const steps = []

  if (flags & RF_GENERATE_ALARM) steps.push(alarmStep(rule))

  ;(rule.actions ?? []).forEach((action, index) => {
    steps.push(
      step('server-action', 'serveractions', {
        index,
        actionId: action.id,
        active: action.active !== false,
        delay: formatTimerValue(action.timerDelay),
        timerKey: action.timerKey ?? '',
        blockingTimerKey: action.blockingTimerKey ?? '',
        snooze: formatTimerValue(action.snoozeTime),
      }),
    )
  })

  if (rule.timerCancellations?.length) {
    steps.push(step('timer-cancel', 'timers', { keys: rule.timerCancellations }))
  }

  if (rule.actionScript?.trim()) {
    steps.push(step('action-script', 'script', { preview: scriptPreview(rule.actionScript) }))
  }

  const pstorageSet = Object.entries(rule.pstorageSetActions ?? {})
  if (pstorageSet.length || rule.pstorageDeleteActions?.length) {
    steps.push(
      step('pstorage', 'pstorage', { set: pstorageSet, remove: rule.pstorageDeleteActions ?? [] }),
    )
  }

  const attributeSet = Object.entries(rule.customAttributeSetActions ?? {})
  if (attributeSet.length || rule.customAttributeDeleteActions?.length) {
    steps.push(
      step('custom-attributes', 'customattr', {
        set: attributeSet,
        remove: rule.customAttributeDeleteActions ?? [],
      }),
    )
  }

  if (flags & RF_START_DOWNTIME) {
    steps.push(step('downtime-start', 'downtime', { tag: rule.downtimeTag ?? '' }))
  } else if (flags & RF_END_DOWNTIME) {
    steps.push(step('downtime-end', 'downtime', { tag: rule.downtimeTag ?? '' }))
  }

  const aiInstructions = aiInstructionsOf(rule)
  if (aiInstructions.trim()) {
    steps.push(step('ai-instructions', 'aiagent', { text: aiInstructions }))
  }

  if (flags & RF_SET_LOG_FLAG) steps.push(step('log-force', 'action-options'))
  else if (flags & RF_CLEAR_LOG_FLAG) steps.push(step('log-disable', 'action-options'))

  for (const chainId of rule.chainCalls ?? []) {
    steps.push(step('chain-call', 'chaincalls', { chainId }))
  }

  return steps.map((s, i) => ({ ...s, id: `${s.type}-${i}` }))
}

/** @param {object} rule */
export function stopsProcessing(rule) {
  return ((rule.flags ?? 0) & RF_STOP_PROCESSING) !== 0
}

/**
 * @param {object} rule
 * @returns {Array<{ key: string, message: string, section: string }>}
 */
export function ruleErrors(rule) {
  const errors = rule.errors
  if (!errors || typeof errors !== 'object') return []
  return Object.entries(ERRORS)
    .filter(([key]) => errors[key])
    .map(([key, { message, section }]) => ({ key, message, section }))
}
