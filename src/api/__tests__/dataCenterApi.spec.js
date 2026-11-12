// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { del, get, patch, post, put } from '../client'
import { getDciValues, getObject } from '../objectsApi'
import {
  isDemoDataCenterId,
  getFloorPlan,
  getRoomConfig,
  getFacilityConfig,
  updateRackRoomPlacement,
  createRoomPassiveElement,
  listObjectDcis,
  getDataCenterValues,
  getDemoFacilityTrees,
  saveFloorPlanOperation,
} from '../dataCenterApi'
import { DEMO_DATA_CENTER } from '../demoSeeds'

vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal()),
  get: vi.fn(() => Promise.resolve({})),
  patch: vi.fn(() => Promise.resolve({})),
  post: vi.fn(() => Promise.resolve({})),
  put: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}))

vi.mock('../objectsApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getDciValues: vi.fn(() => Promise.resolve({ '42:7': { id: 7, value: '1' } })),
  getObject: vi.fn(),
}))

const FACILITY = 2090000001
const HALL_A = 2090000030
const E1 = 2090000032

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dataCenterApi demo content', () => {
  it('seeds a facility whose racks all sit in a room', () => {
    const objects = Object.values(DEMO_DATA_CENTER.objects)
    expect(DEMO_DATA_CENTER.objects[FACILITY].class).toBe('Facility')
    const racks = objects.filter((o) => o.class === 'Rack')
    expect(racks.length).toBeGreaterThan(0)
    for (const rack of racks) {
      const rooms = rack.parents.filter((id) => DEMO_DATA_CENTER.objects[id]?.class === 'Room')
      expect(rooms).toHaveLength(1)
      expect(DEMO_DATA_CENTER.objects[rooms[0]].children).toContain(rack.id)
    }
  })

  it('serves a demo floor plan from the seed in the server shape', async () => {
    const plan = await getFloorPlan(HALL_A)

    expect(get).not.toHaveBeenCalled()
    expect(plan.roomId).toBe(HALL_A)
    expect(plan.outline.length).toBeGreaterThanOrEqual(3)
    expect(plan.racks.length).toBe(DEMO_DATA_CENTER.objects[HALL_A].children.length)
    expect(plan.racks[0]).toEqual(
      expect.objectContaining({ placed: expect.any(Boolean), width: 600, depth: 1200 }),
    )
  })

  it('hands out copies, so a caller cannot change the seed', async () => {
    const config = await getRoomConfig(HALL_A)
    config.outline.length = 0
    expect((await getRoomConfig(HALL_A)).outline.length).toBeGreaterThan(0)
  })

  it('rejects writes to demo objects without calling the server', async () => {
    const rack = DEMO_DATA_CENTER.objects[HALL_A].children[0]

    await expect(updateRackRoomPlacement(rack, { x: 0 })).rejects.toThrow(/Demo content/)
    await expect(createRoomPassiveElement(HALL_A, { type: 'COLUMN' })).rejects.toThrow()
    expect(patch).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('finds a demo rack metric by system tag and reads its value from the seed', async () => {
    const rack = DEMO_DATA_CENTER.objects[HALL_A].children[0]
    const dcis = await listObjectDcis(rack)
    const inlet = dcis.find((dci) => dci.systemTag === 'env.temp.inlet')
    expect(inlet).toBeDefined()

    const values = await getDataCenterValues([
      { objectId: rack, dciId: inlet.id },
      { objectId: 42, dciId: 7 },
    ])

    expect(Number(values[`${rack}:${inlet.id}`].value)).toBeGreaterThan(0)
    expect(values['42:7'].value).toBe('1')
    expect(getDciValues).toHaveBeenCalledWith([{ objectId: 42, dciId: 7 }], undefined)
  })

  it('builds the demo facility tree with racks under several parents', () => {
    const [facility] = getDemoFacilityTrees()
    expect(facility.id).toBe(FACILITY)
    const rackParents = []
    const walk = (node, parent) => {
      if (node.class === 'Rack' && node.name === 'A05') rackParents.push(parent.class)
      for (const child of node.children) walk(child, node)
    }
    walk(facility, null)
    expect(rackParents.sort()).toEqual(['CoolingZone', 'PowerDomain', 'PowerDomain', 'Room'])
  })

  it('keeps floor plan edits of a demo room in the tab, answered as the server would', async () => {
    const save = (op) => saveFloorPlanOperation(E1, op)
    const [first, second] = (await getFloorPlan(E1)).passiveElements

    const created = await save({
      kind: 'element-create',
      id: -1,
      payload: { name: 'Door 1', type: 'DOOR', x: 0, y: 0, rotation: 0, width: 1200, depth: 100 },
    })
    expect(created.id).toBeGreaterThan(9000)
    await save({ kind: 'element-update', id: first.id, payload: { name: 'UPS', type: 'WALL' } })
    await save({ kind: 'element-delete', id: second.id })
    const outline = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 },
    ]
    await save({ kind: 'room', payload: { outline } })

    const plan = await getFloorPlan(E1)
    expect(plan.outline).toEqual(outline)
    expect(plan.area).toBeCloseTo(3, 5)
    expect(plan.passiveElements.find((e) => e.id === first.id)).toMatchObject({
      name: 'UPS',
      type: first.type,
    })
    expect(plan.passiveElements.some((e) => e.id === second.id)).toBe(false)
    expect(plan.passiveElements.at(-1)).toEqual(created)
    expect(DEMO_DATA_CENTER.objects[E1].room.outline).not.toEqual(outline)
    expect([get, patch, post, del].every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })

  it('saves a real room one call at a time, a refusal left to the editor', async () => {
    await saveFloorPlanOperation(42, { kind: 'rack', id: 44, payload: { x: 600 } })
    await saveFloorPlanOperation(42, { kind: 'element-delete', id: 7 })
    expect(patch).toHaveBeenCalledWith(
      '/v1/objects/44/room-placement',
      { x: 600 },
      { suppressForbidden: true },
    )
    expect(del).toHaveBeenCalledWith('/v1/objects/42/floor-plan/passive-elements/7', {
      suppressForbidden: true,
    })
  })

  function recordCalls() {
    const calls = []
    const record = (verb, answer) => (url) => {
      calls.push(`${verb} ${url}`)
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    }
    return { calls, record }
  }
  const hierarchy = () => Object.assign(new Error('violates object hierarchy rules'), { status: 409 })
  const PLACEMENT = { placed: true, x: 600, y: 0, rotation: 0 }

  it('moves a rack without a room in: bound here, then placed', async () => {
    const { calls, record } = recordCalls()
    put.mockImplementationOnce(record('PUT'))
    patch.mockImplementationOnce(record('PATCH', {}))

    await saveFloorPlanOperation(42, {
      kind: 'rack-arrive',
      id: 44,
      fromRoomIds: [],
      payload: PLACEMENT,
    })

    expect(calls).toEqual(['PUT /v1/objects/42/children/44', 'PATCH /v1/objects/44/room-placement'])
    expect(patch).toHaveBeenCalledWith('/v1/objects/44/room-placement', PLACEMENT, {
      suppressForbidden: true,
    })
  })

  it('takes a rack out of its room first when the server allows one room only', async () => {
    const { calls, record } = recordCalls()
    const objects = {
      44: { class: 'Rack', parents: [50] },
      42: { class: 'Room', parents: [40] },
      40: { class: 'Facility', parents: [2] },
    }
    const lookUp = (id) => Promise.resolve(objects[id])
    getObject
      .mockImplementationOnce(lookUp)
      .mockImplementationOnce(lookUp)
      .mockImplementationOnce(lookUp)
    put
      .mockImplementationOnce(record('PUT', hierarchy()))
      .mockImplementationOnce(record('PUT'))
      .mockImplementationOnce(record('PUT'))
    del.mockImplementationOnce(record('DELETE')).mockImplementationOnce(record('DELETE'))
    patch.mockImplementationOnce(record('PATCH', {}))

    await saveFloorPlanOperation(42, {
      kind: 'rack-arrive',
      id: 44,
      fromRoomIds: [50],
      payload: PLACEMENT,
    })

    // The facility holds the rack while it has no room: with no parent it would have no rights.
    expect(calls).toEqual([
      'PUT /v1/objects/42/children/44',
      'PUT /v1/objects/40/children/44',
      'DELETE /v1/objects/50/children/44',
      'PUT /v1/objects/42/children/44',
      'DELETE /v1/objects/40/children/44',
      'PATCH /v1/objects/44/room-placement',
    ])
  })

  it('stops a move in when the rack cannot join the room', async () => {
    put.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))

    await expect(
      saveFloorPlanOperation(42, { kind: 'rack-arrive', id: 44, fromRoomIds: [50], payload: {} }),
    ).rejects.toMatchObject({ status: 403 })
    expect(del).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it('sends everything else to the server', async () => {
    expect(isDemoDataCenterId(42)).toBe(false)

    await getFloorPlan(42)
    await getFacilityConfig(43)
    await updateRackRoomPlacement(44, { placed: true, x: 600, y: 1200, rotation: 90 })

    expect(get).toHaveBeenCalledWith('/v1/objects/42/floor-plan', undefined)
    expect(get).toHaveBeenCalledWith('/v1/objects/43/facility', undefined)
    expect(patch).toHaveBeenCalledWith('/v1/objects/44/room-placement', {
      placed: true,
      x: 600,
      y: 1200,
      rotation: 90,
    })
  })
})
