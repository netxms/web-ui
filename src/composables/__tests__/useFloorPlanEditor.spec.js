// @vitest-environment node
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

describe('useFloorPlanEditor - resizing an element by a handle', () => {
  const WALL = { id: 7, name: 'Wall 1', type: 'WALL', x: 1200, y: 600, rotation: 0, width: 2400, depth: 200 }

  function editingWall(fields = {}) {
    const plan = ref({ ...structuredClone(PLAN), passiveElements: [{ ...WALL }], ...fields })
    const editor = useFloorPlanEditor(plan)
    editor.enter()
    editor.select('e:7')
    return editor
  }
  const wall = (editor) => editor.editedPlan.value.passiveElements[0]

  it('follows the handle from where it was grabbed, as one undo step and one element update', () => {
    const editor = editingWall()
    // Grabbed a little off the handle's centre at 3600, 700.
    editor.beginDrag('s:7:e', { x: 3605, y: 703 })
    editor.dragTo({ x: 3705, y: 703 })
    expect(wall(editor)).toMatchObject({ x: 1200, y: 600, width: 2500, depth: 200 })
    expect(editor.dragging()).toBe(true)
    editor.dragTo({ x: 4105, y: 760 })
    editor.endDrag()

    expect(wall(editor)).toMatchObject({ x: 1200, y: 600, width: 2900, depth: 200 })
    expect(editor.selection.value).toEqual(['e:7'])
    expect(editor.selectedItems.value[0]).toMatchObject({ width: 2900, depth: 200 })
    expect(editor.pendingOps.value).toEqual([
      { kind: 'element-update', id: 7, payload: { width: 2900 } },
    ])

    editor.undo()
    expect(wall(editor)).toMatchObject({ width: 2400, depth: 200 })
    expect(editor.canUndo.value).toBe(false)
    editor.redo()
    expect(wall(editor).width).toBe(2900)
  })

  it('moves the reference corner with a handle on its side', () => {
    const editor = editingWall()
    editor.beginDrag('s:7:nw', { x: 1200, y: 600 })
    editor.dragTo({ x: 1000, y: 500 })
    editor.endDrag()

    expect(editor.pendingOps.value).toEqual([
      { kind: 'element-update', id: 7, payload: { x: 1000, y: 500, width: 2600, depth: 300 } },
    ])
  })

  it('snaps the dragged edge to the tile grid unless Snap is off', () => {
    const editor = editingWall({ gridTileSize: 600 })
    editor.beginDrag('s:7:e', { x: 3600, y: 700 })
    // Still nearest the line it stands on: nothing to undo yet.
    editor.dragTo({ x: 3800, y: 700 })
    expect(wall(editor).width).toBe(2400)
    expect(editor.canUndo.value).toBe(false)
    editor.dragTo({ x: 4000, y: 700 })
    expect(wall(editor).width).toBe(3000)
    editor.endDrag()

    editor.snapEnabled.value = false
    editor.beginDrag('s:7:s', { x: 2400, y: 800 })
    editor.dragTo({ x: 2400, y: 930 })
    editor.endDrag()
    expect(wall(editor)).toMatchObject({ width: 3000, depth: 330 })
  })

  it('stops at 50 mm and warns when the element leaves the room', () => {
    const editor = editingWall()
    editor.beginDrag('s:7:w', { x: 1200, y: 700 })
    editor.dragTo({ x: 9000, y: 700 })
    expect(wall(editor)).toMatchObject({ x: 3550, width: 50 })
    editor.dragTo({ x: -500, y: 700 })
    editor.endDrag()

    expect(wall(editor)).toMatchObject({ x: -500, width: 4100 })
    expect(editor.warnings.value.map((w) => w.text)).toEqual([
      'A01 overlaps Wall 1',
      'Wall 1 is outside the room outline',
    ])
    expect(editor.canUndo.value).toBe(true)
    editor.undo()
    expect(editor.canUndo.value).toBe(false)
  })

  it('leaves everything as it was after a press that does not move', () => {
    const editor = editingWall()
    editor.beginDrag('s:7:e', { x: 3600, y: 700 })
    editor.endDrag()

    expect(editor.selection.value).toEqual(['e:7'])
    expect(editor.dirty.value).toBe(false)
    expect(editor.canUndo.value).toBe(false)
  })

  it('ignores a handle of an element that is gone', () => {
    const editor = editingWall()
    editor.beginDrag('s:99:e', { x: 3600, y: 700 })
    editor.dragTo({ x: 4000, y: 700 })
    editor.endDrag()

    expect(editor.selection.value).toEqual(['e:7'])
    expect(editor.dirty.value).toBe(false)
  })
})

describe('useFloorPlanEditor - backdrop', () => {
  // 1000 x 500 px at 6 mm a pixel: the outline's width, as legacy stretches an uncalibrated image.
  const RECT = { x: 0, y: 0, width: 6000, height: 3000, mmPerPixel: 6 }

  function withBackdrop() {
    const plan = ref({ ...structuredClone(PLAN), backgroundImage: 'img-1', backgroundScale: 0 })
    const editor = useFloorPlanEditor(plan)
    editor.enter()
    return editor
  }

  it('drops the selection in backdrop mode, and edit mode ends it', () => {
    const editor = withBackdrop()
    editor.select('r:101')
    editor.setBackdropMode(true)
    expect(editor.selection.value).toEqual([])
    expect(editor.backdropMode.value).toBe(true)
    editor.exit()
    expect(editor.backdropMode.value).toBe(false)
  })

  it('moves the image as one undo step and keeps it uncalibrated', () => {
    const editor = withBackdrop()
    editor.setBackdropMode(true)
    editor.beginBackdropDrag('move', { x: 100, y: 100 }, RECT)
    editor.dragTo({ x: 300, y: 150 })
    editor.dragTo({ x: 400, y: 250 })
    editor.endDrag()

    expect(editor.pendingOps.value).toEqual([
      { kind: 'room', payload: { backgroundX: 300, backgroundY: 150 } },
    ])
    editor.undo()
    expect(editor.dirty.value).toBe(false)
  })

  it('scales by a corner with the opposite one kept', () => {
    const editor = withBackdrop()
    editor.setBackdropMode(true)
    // The south-east corner from (6000, 3000) to (3000, ...): half the size, 3 mm a pixel.
    editor.beginBackdropDrag('se', { x: 6000, y: 3000 }, RECT)
    editor.dragTo({ x: 3000, y: 1000 })
    editor.endDrag()
    expect(editor.editedPlan.value).toMatchObject({
      backgroundScale: 3000,
      backgroundX: 0,
      backgroundY: 0,
    })
  })

  it('nudges the image by 100 mm without a grid, 10 mm fine, merged into one step', () => {
    const editor = withBackdrop()
    editor.nudgeBackdrop(1, 0)
    editor.nudgeBackdrop(0, 1, true)
    expect(editor.editedPlan.value).toMatchObject({ backgroundX: 100, backgroundY: 10 })
    editor.undo()
    expect(editor.editedPlan.value).toMatchObject({ backgroundX: 0, backgroundY: 0 })
  })

  it('names the backdrop in a failed room call', async () => {
    const editor = withBackdrop()
    editor.updateRoom({ backgroundScale: 5000 })
    await editor.save(async (ops) => ops.map((op) => ({ op, ok: false, error: { status: 403 } })))
    expect(editor.failures.value).toEqual([
      { label: 'Room backdrop', reason: 'no modify rights (403)' },
    ])
  })
})
