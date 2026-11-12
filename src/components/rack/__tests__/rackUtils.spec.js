// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeFitScale } from '../rackUtils.js'

describe('computeFitScale', () => {
  it('scales down to the limiting axis', () => {
    // Height is the tighter constraint: 600/1200 < 400/500
    expect(computeFitScale({ width: 400, height: 600 }, { width: 500, height: 1200 })).toBe(0.5)
  })

  it('honours width when width is the tighter constraint', () => {
    expect(computeFitScale({ width: 250, height: 2000 }, { width: 500, height: 1000 })).toBe(0.5)
  })

  it('never scales above natural size', () => {
    expect(computeFitScale({ width: 2000, height: 4000 }, { width: 500, height: 1000 })).toBe(1)
  })

  it('clamps at the floor so the drawing stays legible', () => {
    expect(computeFitScale({ width: 400, height: 50 }, { width: 500, height: 1000 })).toBe(0.25)
    expect(computeFitScale({ width: 400, height: 50 }, { width: 500, height: 1000 }, 0.1)).toBe(0.1)
  })

  it('renders at natural size until both boxes are measured', () => {
    expect(computeFitScale({ width: 0, height: 0 }, { width: 500, height: 1000 })).toBe(1)
    expect(computeFitScale({ width: 400, height: 600 }, { width: 0, height: 0 })).toBe(1)
    expect(computeFitScale(null, null)).toBe(1)
  })
})
