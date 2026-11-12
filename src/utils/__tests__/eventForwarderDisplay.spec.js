// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  eventForwarderStatus,
  sendStatusLabel,
  driverConfigHint,
  parseConfiguration,
  formatConfiguration,
  SEND_STATUS_LABELS,
} from '../eventForwarderDisplay'

describe('eventForwarderStatus', () => {
  it('reports an uninitialized driver as an error regardless of health check', () => {
    expect(eventForwarderStatus({ driverInitialized: false, healthCheckStatus: true })).toEqual({
      label: 'Not Initialized',
      class: 'status-error',
      icon: 'pi pi-times-circle',
    })
  })

  it('reports an initialized but failing driver as unhealthy', () => {
    expect(eventForwarderStatus({ driverInitialized: true, healthCheckStatus: false }).label).toBe(
      'Unhealthy',
    )
  })

  it('reports an initialized and healthy driver as healthy', () => {
    expect(eventForwarderStatus({ driverInitialized: true, healthCheckStatus: true }).label).toBe(
      'Healthy',
    )
  })

  it('treats a missing forwarder as not initialized', () => {
    expect(eventForwarderStatus(undefined).class).toBe('status-error')
    expect(eventForwarderStatus(null).class).toBe('status-error')
  })
})

describe('sendStatusLabel', () => {
  it('maps the server status codes in order', () => {
    expect(sendStatusLabel(0)).toBe('Unknown')
    expect(sendStatusLabel(1)).toBe('Success')
    expect(sendStatusLabel(2)).toBe('Failure')
  })

  it('falls back to Unknown for out-of-range and missing codes', () => {
    expect(sendStatusLabel(7)).toBe(SEND_STATUS_LABELS[0])
    expect(sendStatusLabel(-1)).toBe(SEND_STATUS_LABELS[0])
    expect(sendStatusLabel(undefined)).toBe(SEND_STATUS_LABELS[0])
  })
})

describe('driverConfigHint', () => {
  it('returns known keys for a built-in driver', () => {
    expect(driverConfigHint('isc')).toEqual(['hostname'])
    expect(driverConfigHint('snmptrap')).toContain('community (public)')
    expect(driverConfigHint('otlp')).toContain('headers (object)')
  })

  it('returns null for a driver supplied by a server module', () => {
    expect(driverConfigHint('some-module-driver')).toBeNull()
    expect(driverConfigHint(undefined)).toBeNull()
  })
})

describe('parseConfiguration', () => {
  it('treats blank text as an empty configuration', () => {
    expect(parseConfiguration('')).toEqual({ ok: true, value: {} })
    expect(parseConfiguration('   \n ')).toEqual({ ok: true, value: {} })
    expect(parseConfiguration(undefined)).toEqual({ ok: true, value: {} })
  })

  it('parses a JSON object', () => {
    expect(parseConfiguration('{"hostname":"trap.example.com","port":162}')).toEqual({
      ok: true,
      value: { hostname: 'trap.example.com', port: 162 },
    })
  })

  it('rejects malformed JSON', () => {
    const result = parseConfiguration('{"hostname":}')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  // The server substitutes {} for any non-object body, which would silently wipe the config.
  it('rejects valid JSON that is not an object', () => {
    expect(parseConfiguration('[1,2,3]').ok).toBe(false)
    expect(parseConfiguration('"text"').ok).toBe(false)
    expect(parseConfiguration('42').ok).toBe(false)
    expect(parseConfiguration('null').ok).toBe(false)
  })
})

describe('formatConfiguration', () => {
  it('renders an object as indented JSON', () => {
    expect(formatConfiguration({ hostname: 'a' })).toBe('{\n  "hostname": "a"\n}')
  })

  it('renders an absent or empty configuration as blank text', () => {
    expect(formatConfiguration(undefined)).toBe('')
    expect(formatConfiguration(null)).toBe('')
    expect(formatConfiguration({})).toBe('')
  })
})
