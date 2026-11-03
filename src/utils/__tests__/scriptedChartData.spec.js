import { describe, it, expect } from 'vitest'
import { normalizeScriptResult } from '../scriptedChartData'

describe('normalizeScriptResult', () => {
  it('reads a hash of numbers, keeping key order', () => {
    expect(normalizeScriptResult({ CPU: 62, Memory: '78' })).toEqual([
      { name: 'CPU', value: 62 },
      { name: 'Memory', value: 78 },
    ])
  })

  it('reads array-derived results, whose hash elements arrive as JSON strings', () => {
    const result = { 1: '{"name":"Online","value":22,"color":"#22c55e"}', 2: '5' }
    expect(normalizeScriptResult(result)).toEqual([
      { name: 'Online', value: 22, color: '#22c55e' },
      { name: '2', value: 5 },
    ])
  })

  it('reads nested hash values of a hash result', () => {
    expect(normalizeScriptResult({ a: { name: 'Alpha', value: 3 } })).toEqual([
      { name: 'Alpha', value: 3 },
    ])
  })

  it('names an element by its key when it has no name', () => {
    expect(normalizeScriptResult({ web: '{"value":4}' })).toEqual([{ name: 'web', value: 4 }])
  })

  it('reads an unparseable value as 0, like legacy safeParseDouble', () => {
    expect(normalizeScriptResult({ x: 'n/a', y: '{broken' })).toEqual([
      { name: 'x', value: 0 },
      { name: 'y', value: 0 },
    ])
  })

  it('still reads the array shapes the demo mocks use', () => {
    expect(normalizeScriptResult([{ name: 'A', value: 1 }, 2])).toEqual([
      { name: 'A', value: 1 },
      { name: '2', value: 2 },
    ])
  })

  it('returns an empty list for nothing', () => {
    expect(normalizeScriptResult(null)).toEqual([])
    expect(normalizeScriptResult(undefined)).toEqual([])
  })
})
