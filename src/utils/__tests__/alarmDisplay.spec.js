import { describe, it, expect } from 'vitest'
import {
  normalizeSeverity,
  normalizeState,
  getSeverity,
  getState,
  severityConfig,
  stateConfig,
  severityRank,
  SEVERITY_ORDER,
  alarmActionAvailability,
} from '../alarmDisplay'
import { getStatusInfo } from '../objectUtils'

describe('normalizeSeverity', () => {
  it('maps integer codes to severity keys', () => {
    expect(normalizeSeverity(0)).toBe('normal')
    expect(normalizeSeverity(1)).toBe('warning')
    expect(normalizeSeverity(2)).toBe('minor')
    expect(normalizeSeverity(3)).toBe('major')
    expect(normalizeSeverity(4)).toBe('critical')
  })

  it('lowercases string input', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical')
  })

  it('falls back to normal for unknown values', () => {
    expect(normalizeSeverity(99)).toBe('normal')
    expect(normalizeSeverity(undefined)).toBe('normal')
  })
})

describe('normalizeState', () => {
  it('maps integer codes to state keys', () => {
    expect(normalizeState(0)).toBe('outstanding')
    expect(normalizeState(1)).toBe('acknowledged')
    expect(normalizeState(2)).toBe('resolved')
    expect(normalizeState(3)).toBe('terminated')
  })

  it('lowercases string input', () => {
    expect(normalizeState('Outstanding')).toBe('outstanding')
  })

  it('falls back to outstanding for unknown values', () => {
    expect(normalizeState(99)).toBe('outstanding')
  })
})

describe('severity colors', () => {
  it('uses the object status palette for each severity code', () => {
    const colors = (fn) =>
      Object.fromEntries(SEVERITY_ORDER.map((key, code) => [key, fn(key, code)]))
    expect(colors((key) => severityConfig[key].color)).toEqual(
      colors((key, code) => getStatusInfo(code).color),
    )
  })

  it('carries the soft background + text pair for anything with text on it', () => {
    const pair = (fn) => Object.fromEntries(SEVERITY_ORDER.map((key, code) => [key, fn(key, code)]))
    expect(pair((key) => [severityConfig[key].bgColor, severityConfig[key].textColor])).toEqual(
      pair((key, code) => [getStatusInfo(code).bgColor, getStatusInfo(code).textColor]),
    )
  })

  it('keeps alarm states off the severity hues except resolved (= normal)', () => {
    const severityColors = new Set(Object.values(severityConfig).map((c) => c.color))
    const onSeverityHue = Object.fromEntries(
      Object.entries(stateConfig).map(([state, cfg]) => [state, severityColors.has(cfg.color)]),
    )
    expect(onSeverityHue).toEqual({
      outstanding: false,
      acknowledged: false,
      resolved: true,
      terminated: false,
    })
  })
})

describe('getSeverity / getState', () => {
  it('returns the config entry for the alarm severity', () => {
    expect(getSeverity({ severity: 4 })).toBe(severityConfig.critical)
  })

  it('returns the config entry for the alarm state', () => {
    expect(getState({ state: 2 })).toBe(stateConfig.resolved)
    expect(getState({ state: 2 }).label).toBe('Resolved')
  })

  it('marks a sticky acknowledgment with its own icon, same label', () => {
    const sticky = getState({ state: 1, isSticky: true })
    expect(sticky.icon).toBe('pi pi-flag-fill')
    expect(sticky.label).toBe('Acknowledged')
    expect(sticky.hint).toBe('Acknowledged (sticky)')
    expect(getState({ state: 1, isSticky: false })).toBe(stateConfig.acknowledged)
  })

  it('ignores isSticky outside the acknowledged state', () => {
    expect(getState({ state: 0, isSticky: true })).toBe(stateConfig.outstanding)
  })
})

describe('severityRank', () => {
  it('ranks by NetXMS severity order, lowest first', () => {
    expect(SEVERITY_ORDER).toEqual(['normal', 'warning', 'minor', 'major', 'critical'])
    expect(severityRank(0)).toBe(0)
    expect(severityRank(4)).toBe(4)
    expect(severityRank('major')).toBe(3)
    expect(severityRank('CRITICAL')).toBe(4)
  })

  it('ranks unknown values as normal', () => {
    expect(severityRank(99)).toBe(0)
    expect(severityRank(undefined)).toBe(0)
  })
})

describe('alarmActionAvailability', () => {
  it.each([
    ['outstanding', { acknowledge: true, resolve: true, terminate: true }],
    ['acknowledged', { acknowledge: false, resolve: true, terminate: true }],
    ['resolved', { acknowledge: false, resolve: false, terminate: true }],
    ['terminated', { acknowledge: false, resolve: false, terminate: false }],
  ])('%s', (state, expected) => {
    expect(alarmActionAvailability(state)).toEqual(expected)
  })
})
