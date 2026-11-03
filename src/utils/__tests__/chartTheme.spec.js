import { describe, it, expect } from 'vitest'
import { timeAxisSplitNumber, formatWithMultiplier } from '../chartTheme'

describe('timeAxisSplitNumber', () => {
  it('leaves the ECharts default until the plot is measured', () => {
    expect(timeAxisSplitNumber(0)).toBeUndefined()
    expect(timeAxisSplitNumber(undefined)).toBeUndefined()
  })

  it('asks for fewer ticks on a narrow plot', () => {
    expect(timeAxisSplitNumber(220)).toBe(2)
    expect(timeAxisSplitNumber(660)).toBe(6)
  })

  it('clamps to a readable range', () => {
    expect(timeAxisSplitNumber(40)).toBe(2)
    expect(timeAxisSplitNumber(4000)).toBe(8)
  })
})

describe('formatWithMultiplier', () => {
  it('applies the largest fitting multiplier', () => {
    expect(formatWithMultiplier(1500)).toBe('1.5 K')
    expect(formatWithMultiplier(2.5e6)).toBe('2.5 M')
    expect(formatWithMultiplier(-3e9)).toBe('-3 G')
    expect(formatWithMultiplier(42)).toBe('42')
  })
})
