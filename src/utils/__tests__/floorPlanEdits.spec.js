// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { editModelFromPlan, foldSaved, nextElementName, saveOperations } from '../floorPlanEdits'

const plan = {
  outline: [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4800 },
    { x: 0, y: 4800 },
  ],
  passiveElements: [
    {
      id: 7,
      name: 'Column 1',
      type: 'COLUMN',
      x: 600,
      y: 600,
      rotation: 0,
      width: 600,
      depth: 600,
    },
    { id: 8, name: 'Door', type: 'DOOR', x: 0, y: 4700, rotation: 0, width: 1200, depth: 100 },
  ],
  racks: [
    { id: 101, name: 'A01', placed: true, x: 1200, y: 1200, rotation: 0, width: 600, depth: 1200 },
    { id: 102, name: 'A02', placed: false, x: 0, y: 0, rotation: 0, width: 600, depth: 1200 },
  ],
}

describe('saveOperations', () => {
  it('sends nothing for an unchanged plan', () => {
    const model = editModelFromPlan(plan)
    expect(saveOperations(model, editModelFromPlan(plan))).toEqual([])
  })

  it('sends only the fields that changed, never an element type', () => {
    const baseline = editModelFromPlan(plan)
    const working = {
      ...baseline,
      outline: baseline.outline.slice(0, 3),
      placements: {
        ...baseline.placements,
        101: { ...baseline.placements[101], x: 1800 },
        102: { placed: true, x: 3000, y: 1200, rotation: 180 },
      },
      elements: [
        { ...baseline.elements[0], name: 'C1', type: 'WALL' },
        { id: -1, name: 'Wall 1', type: 'WALL', x: 0, y: 0, rotation: 0, width: 2400, depth: 200 },
      ],
    }
    expect(saveOperations(baseline, working)).toEqual([
      { kind: 'room', payload: { outline: working.outline } },
      { kind: 'rack', id: 101, payload: { x: 1800 } },
      { kind: 'rack', id: 102, payload: { placed: true, x: 3000, y: 1200, rotation: 180 } },
      { kind: 'element-delete', id: 8 },
      { kind: 'element-update', id: 7, payload: { name: 'C1' } },
      {
        kind: 'element-create',
        id: -1,
        payload: { name: 'Wall 1', type: 'WALL', x: 0, y: 0, rotation: 0, width: 2400, depth: 200 },
      },
    ])
  })

  it('folds a saved call into the baseline, a created element under its new id', () => {
    const baseline = editModelFromPlan(plan)
    const create = {
      kind: 'element-create',
      id: -3,
      payload: { name: 'Ramp 1', type: 'RAMP', x: 0, y: 0, rotation: 0, width: 1800, depth: 1200 },
    }
    const created = foldSaved(baseline, create, { id: 1005, ...create.payload })
    expect(created.rename).toEqual({ from: -3, to: 1005 })
    expect(created.baseline.elements.at(-1)).toEqual({ id: 1005, ...create.payload })

    const moved = foldSaved(baseline, { kind: 'rack', id: 101, payload: { y: 0 } }).baseline
    expect(moved.placements[101]).toEqual({ placed: true, x: 1200, y: 0, rotation: 0 })
    expect(foldSaved(baseline, { kind: 'element-delete', id: 8 }).baseline.elements).toHaveLength(1)
  })
})

describe('racks moving in', () => {
  const arrival = { id: 201, name: 'B01', status: 0, width: 600, depth: 1200, rooms: [{ id: 50 }] }

  it('saves a rack from elsewhere with its whole placement and the rooms it leaves', () => {
    const baseline = editModelFromPlan(plan)
    const working = {
      ...baseline,
      arrivals: { 201: arrival },
      placements: { ...baseline.placements, 201: { placed: true, x: 600, y: 0, rotation: 90 } },
    }
    expect(saveOperations(baseline, working)).toEqual([
      {
        kind: 'rack-arrive',
        id: 201,
        fromRoomIds: [50],
        payload: { placed: true, x: 600, y: 0, rotation: 90 },
      },
    ])
  })

  it('stops sending the move once it is saved, and later edits go as placement changes', () => {
    const baseline = editModelFromPlan(plan)
    const placement = { placed: true, x: 600, y: 0, rotation: 90 }
    const working = {
      ...baseline,
      arrivals: { 201: arrival },
      placements: { ...baseline.placements, 201: placement },
    }
    const [op] = saveOperations(baseline, working)
    const saved = foldSaved(baseline, op).baseline

    expect(saveOperations(saved, working)).toEqual([])
    const moved = { ...working, placements: { ...working.placements, 201: { ...placement, x: 0 } } }
    expect(saveOperations(saved, moved)).toEqual([{ kind: 'rack', id: 201, payload: { x: 0 } }])
  })
})

describe('room grid', () => {
  it('reads the grid of a room without one as no grid', () => {
    expect(editModelFromPlan(plan).room).toEqual({
      gridTileSize: 0,
      gridLabels: 'NONE',
      backgroundImage: null,
      backgroundScale: 0,
      backgroundX: 0,
      backgroundY: 0,
    })
  })

  it('sends a grid change in the same room call as the outline, and folds both', () => {
    const baseline = editModelFromPlan(plan)
    const working = {
      ...baseline,
      outline: baseline.outline.map((p) => ({ ...p, x: p.x ? 7200 : 0 })),
      room: { ...baseline.room, gridTileSize: 600, gridLabels: 'LETTERS_NUMBERS' },
    }
    const ops = saveOperations(baseline, working)
    expect(ops).toEqual([
      {
        kind: 'room',
        payload: { gridTileSize: 600, gridLabels: 'LETTERS_NUMBERS', outline: working.outline },
      },
    ])
    const folded = foldSaved(baseline, ops[0]).baseline
    expect(saveOperations(folded, working)).toEqual([])

    const gridOnly = { ...baseline, room: { ...baseline.room, gridTileSize: 500 } }
    const [op] = saveOperations(baseline, gridOnly)
    expect(op).toEqual({ kind: 'room', payload: { gridTileSize: 500 } })
    expect(foldSaved(baseline, op).baseline.outline).toEqual(baseline.outline)
  })
})

describe('room backdrop', () => {
  const withImage = {
    ...plan,
    backgroundImage: 'b1d0e7f2-0000-4000-8000-000000000001',
    backgroundScale: 0,
    backgroundX: 0,
    backgroundY: 0,
  }

  it('reads the all-zero GUID as no image', () => {
    const none = { ...plan, backgroundImage: '00000000-0000-0000-0000-000000000000' }
    expect(editModelFromPlan(none).room.backgroundImage).toBeNull()
  })

  it('sends a moved and scaled backdrop in the room call', () => {
    const baseline = editModelFromPlan(withImage)
    const working = {
      ...baseline,
      room: { ...baseline.room, backgroundScale: 5000, backgroundX: -300, backgroundY: 120 },
    }
    expect(saveOperations(baseline, working)).toEqual([
      { kind: 'room', payload: { backgroundScale: 5000, backgroundX: -300, backgroundY: 120 } },
    ])
  })

  it('sends null to clear the image', () => {
    const baseline = editModelFromPlan(withImage)
    const working = { ...baseline, room: { ...baseline.room, backgroundImage: null } }
    expect(saveOperations(baseline, working)).toEqual([
      { kind: 'room', payload: { backgroundImage: null } },
    ])
  })
})

describe('nextElementName', () => {
  it('takes the first free number of the type', () => {
    expect(nextElementName(plan.passiveElements, 'COLUMN')).toBe('Column 2')
    expect(nextElementName(plan.passiveElements, 'STAIRS')).toBe('Stairs 1')
  })
})
