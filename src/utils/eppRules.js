// Rule flags and alarm severities of an event processing rule (include/nxcldefs.h).

export const RF_STOP_PROCESSING = 0x000001
export const RF_NEGATED_SOURCE = 0x000002
export const RF_NEGATED_EVENTS = 0x000004
export const RF_GENERATE_ALARM = 0x000008
export const RF_DISABLED = 0x000010
export const RF_TERMINATE_BY_REGEXP = 0x000020
export const RF_SEVERITY_INFO = 0x000100
export const RF_SEVERITY_WARNING = 0x000200
export const RF_SEVERITY_MINOR = 0x000400
export const RF_SEVERITY_MAJOR = 0x000800
export const RF_SEVERITY_CRITICAL = 0x001000
export const RF_CREATE_HELPDESK_TICKET = 0x002000
export const RF_ACCEPT_CORRELATED_EVENTS = 0x004000
export const RF_NEGATED_TIME_FRAMES = 0x008000
export const RF_START_DOWNTIME = 0x010000
export const RF_END_DOWNTIME = 0x020000
export const RF_ADD_AI_COMMENT = 0x040000
export const RF_CREATE_INCIDENT = 0x080000
export const RF_AI_ANALYZE_INCIDENT = 0x100000
export const RF_AI_AUTO_ASSIGN = 0x200000
export const RF_SET_LOG_FLAG = 0x400000
export const RF_CLEAR_LOG_FLAG = 0x800000

/** Index = event severity code (0 Normal … 4 Critical). */
export const RF_SEVERITY_FLAGS = [
  RF_SEVERITY_INFO,
  RF_SEVERITY_WARNING,
  RF_SEVERITY_MINOR,
  RF_SEVERITY_MAJOR,
  RF_SEVERITY_CRITICAL,
]

export const RF_ALL_SEVERITIES = RF_SEVERITY_FLAGS.reduce((mask, flag) => mask | flag, 0)

export const SEVERITY_FROM_EVENT = 5
export const SEVERITY_TERMINATE = 6
export const SEVERITY_RESOLVE = 7

/**
 * Rule editor sections a summary can open: the tab each lives on and, on the action tab, the
 * accordion panel to expand.
 *
 * @type {Record<string, { tab: 'condition'|'action', panel?: string }>}
 */
export const RULE_SECTIONS = {
  condition: { tab: 'condition' },
  events: { tab: 'condition', panel: 'events' },
  sources: { tab: 'condition', panel: 'sources' },
  severity: { tab: 'condition', panel: 'severity' },
  time: { tab: 'condition', panel: 'time' },
  'filter-script': { tab: 'condition', panel: 'filter-script' },
  actions: { tab: 'action' },
  'action-options': { tab: 'action' },
  chaincalls: { tab: 'action', panel: 'chaincalls' },
  alarm: { tab: 'action', panel: 'alarm' },
  incident: { tab: 'action', panel: 'incident' },
  downtime: { tab: 'action', panel: 'downtime' },
  pstorage: { tab: 'action', panel: 'pstorage' },
  customattr: { tab: 'action', panel: 'customattr' },
  serveractions: { tab: 'action', panel: 'serveractions' },
  script: { tab: 'action', panel: 'script' },
  timers: { tab: 'action', panel: 'timers' },
  aiagent: { tab: 'action', panel: 'aiagent' },
}

/** @param {{ flags?: number }} rule */
export function isRuleEnabled(rule) {
  return ((rule?.flags ?? 0) & RF_DISABLED) === 0
}

/**
 * Servers before netxms 2a49dc61c1 name the field `aiAgentInstructions`.
 *
 * @param {object} rule
 * @returns {string}
 */
export function aiInstructionsOf(rule) {
  return rule?.aiInstructions ?? rule?.aiAgentInstructions ?? ''
}
