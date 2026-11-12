// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { describePlacementError, describeRackElementError } from '../placementErrors'

function apiError(status, message) {
  return Object.assign(new Error(message), { status })
}

describe('describePlacementError', () => {
  it('explains a 404 as a server that predates placement support', () => {
    // The sub-resource is the only feature check we have: an older server has no route.
    expect(describePlacementError(apiError(404, 'Request failed: 404'))).toMatch(
      /does not support/i,
    )
  })

  it('explains a 409 as a loop in the object tree', () => {
    expect(describePlacementError(apiError(409, 'Requested change would create a loop'))).toMatch(
      /loop/i,
    )
  })

  it('passes the server reason through for a 400', () => {
    const message =
      'Request references an object that does not exist or is not of the required class'
    expect(describePlacementError(apiError(400, message))).toBe(message)
  })

  it('explains a 403 as missing modify access', () => {
    expect(describePlacementError(apiError(403, 'Access denied'))).toMatch(/access/i)
  })

  it('falls back to the error message when there is no status', () => {
    expect(describePlacementError(new Error('Network down'))).toBe('Network down')
  })
})

describe('describeRackElementError', () => {
  it('describes an object-backed failure as a placement failure', () => {
    expect(describeRackElementError(apiError(409, 'loop'), { objectBacked: true })).toMatch(/loop/i)
  })

  it('reads a 404 on a passive element as a deleted element, not an old server', () => {
    // Passive elements have their own endpoints; only the placement sub-resource is missing
    // on a server that predates it.
    expect(describeRackElementError(apiError(404, 'not found'), { objectBacked: false })).toMatch(
      /no longer exists/i,
    )
  })

  it('passes a passive-element server reason through', () => {
    expect(describeRackElementError(apiError(400, 'Bad position'), { objectBacked: false })).toBe(
      'Bad position',
    )
  })
})
