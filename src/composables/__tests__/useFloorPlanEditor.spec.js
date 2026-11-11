import { describe, it, expect } from 'vitest'
import { nextTick, ref } from 'vue'
import { useFloorPlanEditor } from '../useFloorPlanEditor'

const PLAN = {
  roomId: 42,
  outline: [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4800 },
    { x: 0, y: 4800 },
  ],
  gridTileSize: 0,
  passiveElements: [],
  racks: [
    { id: 101, name: 'A01', placed: true, x: 0, y: 0, rotation: 0, width: 600, depth: 1200 },
  ],
}

const HALL_B = { id: 50, name: 'Hall B' }
const B01 = { id: 201, name: 'B01', status: 0, width: 600, depth: 1200, rooms: [HALL_B] }
const B02 = { id: 202, name: 'B02', status: 0, width: 600, depth: 1200, rooms: [] }

function editing() {
  const plan = ref(structuredClone(PLAN))
  const editor = useFloorPlanEditor(plan)
  editor.enter()
  return { plan, editor }
}

describe('useFloorPlanEditor - racks from elsewhere', () => {
  it('places one centred on the point and saves it as a move into the room', () => {
    const { editor } = editing()
    editor.bringRacks([B01], { x: 3000, y: 2400 })

    expect(editor.selection.value).toEqual(['r:201'])
    expect(editor.editedPlan.value.racks.find((r) => r.id === 201)).toMatchObject({
      placed: true,
      x: 2700,
      y: 1800,
      arriving: true,
    })
    expect(editor.selectedItems.value[0].arrivingFrom).toEqual([HALL_B])
    expect(editor.pendingOps.value).toEqual([
      {
        kind: 'rack-arrive',
        id: 201,
        fromRoomIds: [50],
        payload: { placed: true, x: 2700, y: 1800, rotation: 0 },
      },
    ])
  })

  it('lines several up as a row and leaves the room own racks alone', () => {
    const { editor } = editing()
    editor.bringRacks([B02, B01, { ...B01, id: 101 }], { x: 3000, y: 2400 })

    expect(editor.selection.value).toEqual(['r:201', 'r:202'])
    expect(editor.pendingOps.value.map((op) => op.id)).toEqual([201, 202])
  })

  it('sends a removed one back where it came from, and Undo brings it again', () => {
    const { editor } = editing()
    editor.bringRacks([B01], { x: 3000, y: 2400 })
    editor.removeSelection()

    expect(editor.pendingOps.value).toEqual([])
    expect(editor.editedPlan.value.racks.map((r) => r.id)).toEqual([101])

    editor.undo()
    expect(editor.pendingOps.value.map((op) => op.kind)).toEqual(['rack-arrive'])
  })

  it('names a failed move and keeps it pending', async () => {
    const { editor } = editing()
    editor.bringRacks([B01], { x: 3000, y: 2400 })

    const result = await editor.save(async (ops) =>
      ops.map((op) => ({ op, ok: false, error: { status: 403 } })),
    )

    expect(result).toEqual({ total: 1, failed: 1 })
    expect(editor.failures.value).toEqual([
      { label: 'B01: move into this room', reason: 'no modify rights (403)' },
    ])
    expect(editor.dirty.value).toBe(true)
  })

  it('becomes one of the room racks once saved and the plan lists it', async () => {
    const { plan, editor } = editing()
    editor.bringRacks([B01], { x: 3000, y: 2400 })
    await editor.save(async (ops) => ops.map((op) => ({ op, ok: true })))

    expect(editor.dirty.value).toBe(false)
    expect(editor.editedPlan.value.racks.find((r) => r.id === 201).arriving).toBe(false)

    plan.value = {
      ...plan.value,
      racks: [
        ...plan.value.racks,
        { id: 201, name: 'B01', placed: true, x: 2700, y: 1800, rotation: 0, width: 600, depth: 1200 },
      ],
    }
    await nextTick()

    expect(editor.working.value.arrivals).toEqual({})
    expect(editor.editedPlan.value.racks.map((r) => r.id)).toEqual([101, 201])
    expect(editor.dirty.value).toBe(false)
  })

  it('keeps a pending move across a plan refresh', async () => {
    const { plan, editor } = editing()
    editor.bringRacks([B01], { x: 3000, y: 2400 })
    plan.value = structuredClone(PLAN)
    await nextTick()

    expect(editor.pendingOps.value.map((op) => op.kind)).toEqual(['rack-arrive'])
  })
})
