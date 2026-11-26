// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const { getAiOperators, getAiOperator, getAiOperatorInstructionsHistory } =
  await import('../aiOperatorsApi')

beforeEach(() => vi.clearAllMocks())

describe('AI operator cycle count', () => {
  it('keeps the cycle of a current server', async () => {
    client.get.mockResolvedValue({ id: 4, cycle: 12 })
    expect(await getAiOperator(4)).toEqual({ id: 4, cycle: 12 })
  })

  // netxms 7.1 and earlier.
  it('reads iteration as the cycle from servers before the rename', async () => {
    client.get.mockResolvedValue([
      { id: 4, iteration: 7 },
      { id: 5, cycle: 3 },
    ])
    const operators = await getAiOperators()
    expect(operators.map((o) => o.cycle)).toEqual([7, 3])
  })

  it('does the same for instruction history records', async () => {
    client.get.mockResolvedValue([{ id: 1, iteration: 2, previousText: 'x' }])
    const [record] = await getAiOperatorInstructionsHistory(4)
    expect(client.get).toHaveBeenCalledWith('/v1/ai/operators/4/instructions-history')
    expect(record).toMatchObject({ cycle: 2, previousText: 'x' })
  })

  it('counts 0 when neither name is sent', async () => {
    client.get.mockResolvedValue({ id: 4 })
    expect((await getAiOperator(4)).cycle).toBe(0)
  })
})
