// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  buildCheckPayload,
  checkOrigin,
  checkState,
  checkToForm,
  checkTypeLabel,
  duplicateCheckPayload,
  emptyCheckForm,
  normalizeCheck,
  validateCheckForm,
} from '../businessServiceChecks'

const raw = (overrides = {}) => ({
  id: 12,
  serviceId: 100,
  type: 'script',
  description: 'Web tier',
  relatedObjectId: 0,
  relatedDciId: 0,
  statusThreshold: 0,
  script: 'return true;',
  status: 0,
  failureReason: '',
  prototypeServiceId: 0,
  prototypeCheckId: 0,
  autoCreated: false,
  ...overrides,
})

describe('normalizeCheck', () => {
  it('turns the null script of a non-script check into an empty string', () => {
    const check = normalizeCheck(raw({ type: 'object', script: null }))
    expect(check.script).toBe('')
    expect(check.type).toBe('object')
  })

  it('derives autoCreated from the prototype link when the server leaves it out', () => {
    const { autoCreated: _omit, ...withoutFlag } = raw({ prototypeServiceId: 55 })
    expect(normalizeCheck(withoutFlag).autoCreated).toBe(true)
    expect(normalizeCheck({ id: 1 }).autoCreated).toBe(false)
  })
})

describe('checkOrigin', () => {
  it('tells manual, auto-bound and prototype checks apart', () => {
    expect(checkOrigin(normalizeCheck(raw()))).toBe('manual')
    // Auto-binding marks the check with its own service as the prototype.
    expect(checkOrigin(normalizeCheck(raw({ prototypeServiceId: 100 })))).toBe('autobind')
    expect(checkOrigin(normalizeCheck(raw({ prototypeServiceId: 55 })))).toBe('prototype')
  })
})

describe('checkState and checkTypeLabel', () => {
  it('names the three states a check reports', () => {
    expect(checkState(0)).toEqual({ label: 'OK', status: 0 })
    expect(checkState(2)).toEqual({ label: 'Degraded', status: 2 })
    expect(checkState(4)).toEqual({ label: 'Failed', status: 4 })
    expect(checkState(3).label).toBe('Unknown')
  })

  it('labels the server type strings, "none" included', () => {
    expect(checkTypeLabel('dci')).toBe('DCI threshold')
    expect(checkTypeLabel('none')).toBe('None')
  })
})

describe('checkToForm', () => {
  it('opens a "none" check as an object status check, as legacy does', () => {
    expect(checkToForm(normalizeCheck(raw({ type: 'none' }))).type).toBe('object')
  })
})

describe('validateCheckForm', () => {
  it('needs the object of an object check', () => {
    expect(validateCheckForm({ ...emptyCheckForm(), type: 'object' })).toHaveProperty(
      'relatedObjectId',
    )
  })

  it('needs the object, then the DCI, of a DCI check', () => {
    const form = { ...emptyCheckForm(), type: 'dci' }
    expect(Object.keys(validateCheckForm(form))).toEqual(['relatedObjectId'])
    expect(Object.keys(validateCheckForm({ ...form, relatedObjectId: 7 }))).toEqual([
      'relatedDciId',
    ])
    expect(validateCheckForm({ ...form, relatedObjectId: 7, relatedDciId: 3 })).toEqual({})
  })

  it('lets a script check go without a related object', () => {
    expect(validateCheckForm({ ...emptyCheckForm(), type: 'script' })).toEqual({})
  })
})

describe('buildCheckPayload', () => {
  const form = {
    description: '  Disk  ',
    type: 'object',
    relatedObjectId: 7,
    relatedDciId: 3,
    statusThreshold: 2,
    script: 'return false;',
  }

  it('clears the DCI and the script outside the types that use them', () => {
    expect(buildCheckPayload(form)).toEqual({
      type: 'object',
      description: 'Disk',
      relatedObjectId: 7,
      relatedDciId: 0,
      statusThreshold: 2,
      script: null,
    })
  })

  it('keeps the script and the related object of a script check', () => {
    expect(buildCheckPayload({ ...form, type: 'script' })).toMatchObject({
      relatedObjectId: 7,
      relatedDciId: 0,
      script: 'return false;',
    })
  })

  it('keeps the DCI of a DCI check', () => {
    expect(buildCheckPayload({ ...form, type: 'dci' })).toMatchObject({
      relatedDciId: 3,
      script: null,
    })
  })

  it('fills a blank description from the fallback, then with "Unnamed"', () => {
    const blank = { ...form, description: ' ' }
    expect(buildCheckPayload(blank, { fallbackDescription: 'server1' }).description).toBe('server1')
    expect(buildCheckPayload(blank).description).toBe('Unnamed')
  })
})

describe('duplicateCheckPayload', () => {
  it('copies an auto-created check without its prototype link', () => {
    const check = normalizeCheck(
      raw({ type: 'dci', relatedObjectId: 7, relatedDciId: 3, prototypeServiceId: 55 }),
    )
    const payload = duplicateCheckPayload(check)
    expect(payload).toEqual({
      type: 'dci',
      description: 'Web tier',
      relatedObjectId: 7,
      relatedDciId: 3,
      statusThreshold: 0,
      script: null,
    })
    expect(payload).not.toHaveProperty('prototypeServiceId')
  })
})
