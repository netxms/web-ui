import { describe, it, expect, vi } from 'vitest'
import { moveObjectsToContainer, moveObjectsToGroup } from '@/utils/moveToGroup'

const group = { id: 10, name: 'Target group' }

function harness({ fetchParents }) {
  const bind = vi.fn().mockResolvedValue(undefined)
  const unbind = vi.fn().mockResolvedValue(undefined)
  return { bind, unbind, fetchParents }
}

describe('moveObjectsToGroup', () => {
  it('binds into the new group and unbinds every previous parent', async () => {
    const deps = harness({ fetchParents: vi.fn().mockResolvedValue({ parents: [1, 2] }) })

    const { succeeded, failed } = await moveObjectsToGroup({
      objects: [{ id: 5, name: 'Template A' }],
      group,
      ...deps,
    })

    expect(deps.bind).toHaveBeenCalledWith({ parentId: 10, childId: 5 })
    expect(deps.unbind).toHaveBeenCalledWith({ parentId: 1, childId: 5 })
    expect(deps.unbind).toHaveBeenCalledWith({ parentId: 2, childId: 5 })
    expect(succeeded).toEqual([{ id: 5, name: 'Template A' }])
    expect(failed).toEqual([])
  })

  it('keeps the destination group out of the unbind list', async () => {
    const deps = harness({ fetchParents: vi.fn().mockResolvedValue({ parents: [10, 1] }) })

    await moveObjectsToGroup({ objects: [{ id: 5, name: 'A' }], group, ...deps })

    expect(deps.unbind).toHaveBeenCalledTimes(1)
    expect(deps.unbind).toHaveBeenCalledWith({ parentId: 1, childId: 5 })
  })

  it('does not bind when the parent list is unknown - a move must not become a copy', async () => {
    const deps = harness({ fetchParents: vi.fn().mockResolvedValue(undefined) })

    const { succeeded, failed } = await moveObjectsToGroup({
      objects: [{ id: 5, name: 'Template A' }],
      group,
      ...deps,
    })

    expect(deps.bind).not.toHaveBeenCalled()
    expect(deps.unbind).not.toHaveBeenCalled()
    expect(succeeded).toEqual([])
    expect(failed).toEqual([
      {
        id: 5,
        name: 'Template A',
        status: undefined,
        message: 'Current group membership is unknown',
      },
    ])
  })

  it('does not bind when the detail request fails', async () => {
    const error = Object.assign(new Error('Bad gateway'), { status: 502 })
    const deps = harness({ fetchParents: vi.fn().mockRejectedValue(error) })

    const { failed } = await moveObjectsToGroup({
      objects: [{ id: 5, name: 'Template A' }],
      group,
      ...deps,
    })

    expect(deps.bind).not.toHaveBeenCalled()
    expect(failed).toEqual([{ id: 5, name: 'Template A', status: 502, message: 'Bad gateway' }])
  })

  it('settles per object so one failure does not hide the rest', async () => {
    const deps = harness({
      fetchParents: vi.fn(async (id) => {
        if (id === 6) throw Object.assign(new Error('Forbidden'), { status: 403 })
        return { parents: [1] }
      }),
    })

    const { succeeded, failed } = await moveObjectsToGroup({
      objects: [
        { id: 5, name: 'A' },
        { id: 6, name: 'B' },
        { id: 7, name: 'C' },
      ],
      group,
      ...deps,
    })

    expect(succeeded).toEqual([
      { id: 5, name: 'A' },
      { id: 7, name: 'C' },
    ])
    expect(failed).toEqual([{ id: 6, name: 'B', status: 403, message: 'Forbidden' }])
  })

  it('reports a failed unbind rather than calling the move done', async () => {
    const deps = harness({ fetchParents: vi.fn().mockResolvedValue({ parents: [1] }) })
    deps.unbind.mockRejectedValue(Object.assign(new Error('Unbind failed'), { status: 500 }))

    const { succeeded, failed } = await moveObjectsToGroup({
      objects: [{ id: 5, name: 'A' }],
      group,
      ...deps,
    })

    expect(deps.bind).toHaveBeenCalledTimes(1)
    expect(succeeded).toEqual([])
    expect(failed).toEqual([{ id: 5, name: 'A', status: 500, message: 'Unbind failed' }])
  })
})

describe('moveObjectsToContainer', () => {
  const target = { id: 30, name: 'Hall B' }

  it('binds into the target and unbinds only the parent it moves from', async () => {
    const bind = vi.fn().mockResolvedValue(undefined)
    const unbind = vi.fn().mockResolvedValue(undefined)

    const { succeeded, failed } = await moveObjectsToContainer({
      moves: [{ object: { id: 5, name: 'R01' }, sourceId: 20 }],
      target,
      bind,
      unbind,
    })

    expect(bind).toHaveBeenCalledWith({ parentId: 30, childId: 5 })
    expect(unbind).toHaveBeenCalledTimes(1)
    expect(unbind).toHaveBeenCalledWith({ parentId: 20, childId: 5 })
    expect(bind.mock.invocationCallOrder[0]).toBeLessThan(unbind.mock.invocationCallOrder[0])
    expect(succeeded).toEqual([{ id: 5, name: 'R01' }])
    expect(failed).toEqual([])
  })

  it('leaves the object where it was when the bind fails', async () => {
    const bind = vi.fn().mockRejectedValue(Object.assign(new Error('Refused'), { status: 400 }))
    const unbind = vi.fn()

    const { succeeded, failed } = await moveObjectsToContainer({
      moves: [{ object: { id: 5, name: 'R01' }, sourceId: 20 }],
      target,
      bind,
      unbind,
    })

    expect(unbind).not.toHaveBeenCalled()
    expect(succeeded).toEqual([])
    expect(failed).toEqual([{ id: 5, name: 'R01', status: 400, message: 'Refused' }])
  })

  it('leaves the old room first when the server takes one room per rack', async () => {
    const calls = []
    const hierarchy = Object.assign(new Error('violates object hierarchy rules'), { status: 409 })
    const bind = vi.fn(async ({ parentId }) => {
      calls.push(`bind ${parentId}`)
      if (calls.length === 1) throw hierarchy
    })
    const unbind = vi.fn(async ({ parentId }) => calls.push(`unbind ${parentId}`))

    const { succeeded } = await moveObjectsToContainer({
      moves: [{ object: { id: 5, name: 'R01' }, sourceId: 20 }],
      target,
      bind,
      unbind,
    })

    expect(calls).toEqual(['bind 30', 'unbind 20', 'bind 30'])
    expect(succeeded).toEqual([{ id: 5, name: 'R01' }])
  })

  it('puts the object back when the second bind fails too', async () => {
    const calls = []
    const bind = vi.fn(async ({ parentId }) => {
      calls.push(`bind ${parentId}`)
      if (parentId === 30) throw Object.assign(new Error('Conflict'), { status: 409 })
    })
    const unbind = vi.fn(async ({ parentId }) => calls.push(`unbind ${parentId}`))

    const { failed } = await moveObjectsToContainer({
      moves: [{ object: { id: 5, name: 'R01' }, sourceId: 20 }],
      target,
      bind,
      unbind,
    })

    expect(calls).toEqual(['bind 30', 'unbind 20', 'bind 30', 'bind 20'])
    expect(failed).toEqual([{ id: 5, name: 'R01', status: 409, message: 'Conflict' }])
  })

  it('does nothing for an object already in the target', async () => {
    const bind = vi.fn()
    const unbind = vi.fn()

    await moveObjectsToContainer({
      moves: [{ object: { id: 5, name: 'R01' }, sourceId: 30 }],
      target,
      bind,
      unbind,
    })

    expect(bind).not.toHaveBeenCalled()
    expect(unbind).not.toHaveBeenCalled()
  })
})
