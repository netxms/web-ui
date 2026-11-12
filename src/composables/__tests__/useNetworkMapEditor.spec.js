// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useNetworkMapEditor } from '@/composables/useNetworkMapEditor'

function baseMap() {
  return { id: 1, rawContent: {}, background: null, elements: [], links: [] }
}

describe('useNetworkMapEditor undo/redo', () => {
  it('starts clean with no history', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    expect(ed.dirty.value).toBe(false)
    expect(ed.canUndo.value).toBe(false)
    expect(ed.canRedo.value).toBe(false)
  })

  it('does not report undo/redo outside edit mode', () => {
    const ed = useNetworkMapEditor()
    expect(ed.canUndo.value).toBe(false)
    expect(ed.canRedo.value).toBe(false)
  })

  it('undo reverses a mutation and redo re-applies it', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    const id = ed.addTextBox({ x: 10, y: 20 })
    expect(ed.working.value.elements).toHaveLength(1)
    expect(ed.dirty.value).toBe(true)
    expect(ed.canUndo.value).toBe(true)

    ed.undo()
    expect(ed.working.value.elements).toHaveLength(0)
    expect(ed.canUndo.value).toBe(false)
    expect(ed.canRedo.value).toBe(true)

    ed.redo()
    expect(ed.working.value.elements).toHaveLength(1)
    expect(ed.working.value.elements[0].id).toBe(id)
    expect(ed.canRedo.value).toBe(false)
  })

  it('a new mutation after undo clears the redo stack', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    ed.addTextBox({ x: 0, y: 0 })
    ed.undo()
    expect(ed.canRedo.value).toBe(true)
    ed.addGroupBox({ x: 5, y: 5 })
    expect(ed.canRedo.value).toBe(false)
    expect(ed.working.value.elements).toHaveLength(1)
    expect(ed.working.value.elements[0].type).toBe('decoration')
  })

  it('undo restores an earlier geometry value, then the add', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    const id = ed.addTextBox({ x: 0, y: 0 })
    ed.setNodePosition(id, 100, 200)
    expect(ed.getElement(id).x).toBe(100)
    ed.undo() // undo the move
    expect(ed.getElement(id).x).toBe(0)
    ed.undo() // undo the add
    expect(ed.working.value.elements).toHaveLength(0)
  })

  it('discard and exit clear the history', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    ed.addTextBox({ x: 0, y: 0 })
    ed.discard()
    expect(ed.canUndo.value).toBe(false)
    expect(ed.working.value.elements).toHaveLength(0)
    ed.exit()
    expect(ed.canUndo.value).toBe(false)
    expect(ed.editMode.value).toBe(false)
  })
})

describe('useNetworkMapEditor baselineDivergedFrom', () => {
  it('is false against a fresh map identical to the entry baseline', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    expect(ed.baselineDivergedFrom(baseMap())).toBe(false)
  })

  it('is true when the fresh map differs from the entry baseline', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    const changed = baseMap()
    changed.rawContent = { width: 999 }
    expect(ed.baselineDivergedFrom(changed)).toBe(true)
  })

  it('is false when nothing was captured (no baseline)', () => {
    const ed = useNetworkMapEditor()
    expect(ed.baselineDivergedFrom(baseMap())).toBe(false)
  })
})

describe('useNetworkMapEditor applyLayoutPositions', () => {
  function mapWithElement() {
    return {
      id: 1,
      rawContent: {},
      background: null,
      elements: [{ id: 'e-1', type: 'object', x: 37, y: 91, raw: { posX: 37, posY: 91 } }],
      links: [],
    }
  }

  it('writes positions into the element and its raw payload', () => {
    const ed = useNetworkMapEditor()
    ed.enter(mapWithElement())
    ed.applyLayoutPositions({ 'e-1': { x: 80, y: 80 } })
    const el = ed.working.value.elements[0]
    expect([el.x, el.y]).toEqual([80, 80])
    expect([el.raw.posX, el.raw.posY]).toEqual([80, 80])
  })

  it('keeps the working copy identity for layout runs (no canvas rebuild)', () => {
    const ed = useNetworkMapEditor()
    ed.enter(mapWithElement())
    const before = ed.working.value
    ed.applyLayoutPositions({ 'e-1': { x: 80, y: 80 } })
    expect(ed.working.value).toBe(before)
  })

  it('reassigns the working copy when a rebuild is requested', () => {
    const ed = useNetworkMapEditor()
    ed.enter(mapWithElement())
    const before = ed.working.value
    ed.applyLayoutPositions({ 'e-1': { x: 80, y: 80 } }, true)
    expect(ed.working.value).not.toBe(before)
    expect(ed.working.value.elements).not.toBe(before.elements)
    expect(ed.working.value.elements[0].x).toBe(80)
  })

  it('ignores elements with no entry in the position map', () => {
    const ed = useNetworkMapEditor()
    ed.enter(mapWithElement())
    ed.applyLayoutPositions({ 'e-999': { x: 0, y: 0 } }, true)
    expect(ed.working.value.elements[0].x).toBe(37)
  })
})

describe('useNetworkMapEditor updateMapSettings', () => {
  it('keeps the derived flags bitmask in step with rawContent', () => {
    const ed = useNetworkMapEditor()
    ed.enter({ ...baseMap(), flags: 0 })
    ed.updateMapSettings({ flags: { showStatusFrame: true, showLinkDirection: true } })
    expect(ed.working.value.flags).toBe(0x02 | 0x40)
  })

  it('accepts the raw integer wire form too', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    ed.updateMapSettings({ flags: 0x05 })
    expect(ed.working.value.flags).toBe(0x05)
  })

  it('resolves flags to 0 when the patch clears every bit', () => {
    const ed = useNetworkMapEditor()
    ed.enter({ ...baseMap(), flags: 0xff })
    ed.updateMapSettings({ flags: { showStatusIcon: false, showStatusFrame: false } })
    expect(ed.working.value.flags).toBe(0)
  })

  it('still refreshes the derived background object', () => {
    const ed = useNetworkMapEditor()
    ed.enter(baseMap())
    ed.updateMapSettings({ backgroundColor: '#ff0000' })
    expect(ed.working.value.background).toEqual({ type: 'color', color: '#ff0000' })
  })
})

describe('useNetworkMapEditor object element geometry', () => {
  it('applies a geometry patch to an object element (floor-plan resize)', () => {
    const ed = useNetworkMapEditor()
    const el = {
      id: 'e-1',
      type: 'object',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      raw: { id: 1, type: 1, posX: 0, posY: 0, width: 100, height: 100 },
    }
    ed.enter({ ...baseMap(), elements: [el] })
    ed.updateElement('e-1', { x: 60, y: 40, width: 120, height: 80 })

    const next = ed.working.value.elements[0]
    expect(next).toMatchObject({ x: 60, y: 40, width: 120, height: 80 })
    // raw is what gets serialized back to the server.
    expect(next.raw).toMatchObject({ posX: 60, posY: 40, width: 120, height: 80 })
  })
})
