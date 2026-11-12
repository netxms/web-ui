// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { CONTEXT_OBJECT_ID, isContextObjectId, resolveContextObjectId } from '../dashboardContext'

describe('resolveContextObjectId', () => {
  it('passes ordinary ids through', () => {
    expect(resolveContextObjectId(42, 7)).toBe(42)
  })
  it('maps the sentinel to the context object', () => {
    expect(resolveContextObjectId(CONTEXT_OBJECT_ID, 7)).toBe(7)
  })
  it('maps the sentinel to 0 without a context, as legacy does', () => {
    expect(resolveContextObjectId(CONTEXT_OBJECT_ID, null)).toBe(0)
  })
  it('accepts the sentinel as a string', () => {
    expect(resolveContextObjectId('4294967295', 7)).toBe(7)
  })
  it('keeps 0 as 0 - scripted elements read it as "the dashboard"', () => {
    expect(resolveContextObjectId(0, 7)).toBe(0)
  })
  it('reads anything non-numeric as 0', () => {
    expect(resolveContextObjectId(undefined, 7)).toBe(0)
    expect(resolveContextObjectId('abc', 7)).toBe(0)
  })
})

describe('isContextObjectId', () => {
  it('recognises the sentinel in either type', () => {
    expect(isContextObjectId(CONTEXT_OBJECT_ID)).toBe(true)
    expect(isContextObjectId('4294967295')).toBe(true)
    expect(isContextObjectId(42)).toBe(false)
  })
})
