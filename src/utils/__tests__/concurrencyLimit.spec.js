import { describe, it, expect } from 'vitest'
import { mapConcurrent } from '../concurrencyLimit'

describe('mapConcurrent', () => {
  it('returns results in input order', async () => {
    const items = [3, 1, 4, 1, 5, 9]
    const results = await mapConcurrent(items, async (x) => x * 2, 3)
    expect(results).toEqual([6, 2, 8, 2, 10, 18])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0

    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const items = Array.from({ length: 10 }, (_, i) => i)

    await mapConcurrent(
      items,
      async () => {
        active++
        if (active > peak) peak = active
        await delay(10)
        active--
      },
      3,
    )

    expect(peak).toBeLessThanOrEqual(3)
  })

  it('works when items length is less than limit', async () => {
    const results = await mapConcurrent([10, 20], async (x) => x + 1, 5)
    expect(results).toEqual([11, 21])
  })

  it('returns empty array for empty input', async () => {
    const results = await mapConcurrent([], async (x) => x, 3)
    expect(results).toEqual([])
  })

  it('propagates errors from the mapper', async () => {
    const fn = async (x) => {
      if (x === 2) throw new Error('fail')
      return x
    }
    await expect(mapConcurrent([1, 2, 3], fn, 2)).rejects.toThrow('fail')
  })

  it('passes the index as the second argument to fn', async () => {
    const indices = []
    await mapConcurrent(
      ['a', 'b', 'c'],
      async (item, i) => {
        indices.push(i)
      },
      2,
    )
    expect(indices.sort()).toEqual([0, 1, 2])
  })
})
