import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRowSelection } from '@/composables/useRowSelection'

// The caller owns the Set and feeds each reported selection straight back in.
function setup({ rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], ...options } = {}) {
  const rowsRef = ref(rows)
  const selectedIds = ref(new Set())
  const onChange = vi.fn((next) => {
    selectedIds.value = next
  })
  const api = useRowSelection({
    rows: rowsRef,
    selectedIds,
    onChange,
    ...options,
  })
  return { api, rowsRef, selectedIds, onChange }
}

const click = (extra = {}) => ({ stopPropagation: vi.fn(), preventDefault: vi.fn(), ...extra })

describe('useRowSelection', () => {
  it('toggles a row on and off', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[1], 1)
    expect([...selectedIds.value]).toEqual([2])

    api.toggle(click(), rowsRef.value[1], 1)
    expect([...selectedIds.value]).toEqual([])
  })

  it('never mutates the Set it was given', () => {
    const { api, rowsRef, selectedIds } = setup()
    const before = selectedIds.value

    api.toggle(click(), rowsRef.value[0], 0)

    expect(before.size).toBe(0)
    expect(selectedIds.value).not.toBe(before)
  })

  it('stops propagation so a row-click handler does not also fire', () => {
    const { api, rowsRef } = setup()
    const event = click()

    api.toggle(event, rowsRef.value[0], 0)

    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('shift-click selects the range from the last clicked row', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    expect([...selectedIds.value].sort()).toEqual([1, 2, 3])
  })

  it('shift-click extends backwards too', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[3], 3)
    api.toggle(click({ shiftKey: true }), rowsRef.value[1], 1)

    expect([...selectedIds.value].sort()).toEqual([2, 3, 4])
  })

  it('shift-click replaces the selection rather than adding to it', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    api.toggle(click(), rowsRef.value[1], 1)
    api.toggle(click({ shiftKey: true }), rowsRef.value[3], 3)

    // Anchored on row 2 (the last plain click), so row 1 drops out.
    expect([...selectedIds.value].sort()).toEqual([2, 3, 4])
  })

  it('shift-click with no anchor behaves as a plain toggle', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    expect([...selectedIds.value]).toEqual([3])
  })

  // Within one tick the size watcher sees 0 -> 0, so this must hold without a flush.
  it('drops the anchor as soon as the selection empties', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    api.toggle(click(), rowsRef.value[0], 0)

    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    expect([...selectedIds.value]).toEqual([3])
  })

  it('drops the anchor on clear()', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    api.clear()

    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    expect([...selectedIds.value]).toEqual([3])
  })

  it('drops the anchor when the parent empties the selection itself', async () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    await nextTick()
    selectedIds.value = new Set()
    await nextTick()

    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    expect([...selectedIds.value]).toEqual([3])
  })

  it('falls back to a plain toggle once the anchor row has left the list', async () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[0], 0)
    rowsRef.value = [{ id: 5 }, { id: 6 }, { id: 7 }]
    await nextTick()

    api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

    // The rows moving on leaves the selection alone.
    expect([...selectedIds.value].sort()).toEqual([1, 7])
  })

  it('keeps the anchor when a refresh reorders the rows under it', async () => {
    const { api, rowsRef, selectedIds } = setup()

    api.toggle(click(), rowsRef.value[1], 1)
    rowsRef.value = [{ id: 9 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    await nextTick()

    api.toggle(click({ shiftKey: true }), rowsRef.value[4], 4)

    expect([...selectedIds.value]).toEqual([2, 3, 4])
  })

  describe('extendTo (keyboard range)', () => {
    it('starts the range at the origin when there is no anchor', () => {
      const { api, rowsRef, selectedIds } = setup()

      api.extendTo(rowsRef.value[1], rowsRef.value[2])

      expect([...selectedIds.value]).toEqual([2, 3])
    })

    it('keeps the anchor as the range grows and shrinks', () => {
      const { api, rowsRef, selectedIds } = setup()

      api.extendTo(rowsRef.value[1], rowsRef.value[2])
      api.extendTo(rowsRef.value[2], rowsRef.value[3])
      expect([...selectedIds.value]).toEqual([2, 3, 4])

      api.extendTo(rowsRef.value[3], rowsRef.value[2])
      expect([...selectedIds.value]).toEqual([2, 3])
    })

    it('continues from a row selected before it', () => {
      const { api, rowsRef, selectedIds } = setup()

      api.toggle(click(), rowsRef.value[0], 0)
      api.extendTo(rowsRef.value[0], rowsRef.value[1])

      expect([...selectedIds.value]).toEqual([1, 2])
    })

    it('starts over at the origin after dropAnchor', () => {
      const { api, rowsRef, selectedIds } = setup()

      api.toggle(click(), rowsRef.value[0], 0)
      api.dropAnchor()
      api.extendTo(rowsRef.value[2], rowsRef.value[3])

      expect([...selectedIds.value]).toEqual([3, 4])
    })

    it('skips rows that cannot be selected', () => {
      const { api, rowsRef, selectedIds } = setup({ isSelectable: (row) => row.id !== 2 })

      api.extendTo(rowsRef.value[0], rowsRef.value[2])

      expect([...selectedIds.value]).toEqual([1, 3])
    })
  })

  it('toggles on Enter and Space only', () => {
    const { api, rowsRef, selectedIds } = setup()

    api.onKeydown(click({ key: 'a' }), rowsRef.value[0], 0)
    expect(selectedIds.value.size).toBe(0)

    api.onKeydown(click({ key: ' ' }), rowsRef.value[0], 0)
    expect([...selectedIds.value]).toEqual([1])

    api.onKeydown(click({ key: 'Enter' }), rowsRef.value[1], 1)
    expect([...selectedIds.value].sort()).toEqual([1, 2])
  })

  it('reports all/some selected and toggles all', () => {
    const { api, rowsRef, selectedIds } = setup()

    expect(api.allSelected.value).toBe(false)
    expect(api.someSelected.value).toBe(false)

    api.toggle(click(), rowsRef.value[0], 0)
    expect(api.someSelected.value).toBe(true)
    expect(api.allSelected.value).toBe(false)

    api.toggleAll()
    expect(api.allSelected.value).toBe(true)
    expect(api.someSelected.value).toBe(false)
    expect(selectedIds.value.size).toBe(4)

    api.toggleAll()
    expect(selectedIds.value.size).toBe(0)
  })

  it('reports nothing selected for an empty row list', () => {
    const { api } = setup({ rows: [] })

    expect(api.allSelected.value).toBe(false)
    expect(api.someSelected.value).toBe(false)
  })

  it('honours a custom id accessor', () => {
    const { api, rowsRef, selectedIds } = setup({
      rows: [{ guid: 'a' }, { guid: 'b' }],
      idOf: (row) => row.guid,
    })

    api.toggle(click(), rowsRef.value[1], 1)

    expect([...selectedIds.value]).toEqual(['b'])
  })

  describe('unselectable rows', () => {
    const options = { isSelectable: (row) => row.id !== 2 }

    it('cannot be toggled', () => {
      const { api, rowsRef, onChange } = setup(options)

      api.toggle(click(), rowsRef.value[1], 1)

      expect(onChange).not.toHaveBeenCalled()
    })

    it('are skipped by a shift-range', () => {
      const { api, rowsRef, selectedIds } = setup(options)

      api.toggle(click(), rowsRef.value[0], 0)
      api.toggle(click({ shiftKey: true }), rowsRef.value[2], 2)

      expect([...selectedIds.value].sort()).toEqual([1, 3])
    })

    it('are excluded from select-all and from allSelected', () => {
      const { api, selectedIds } = setup(options)

      api.toggleAll()

      expect([...selectedIds.value].sort()).toEqual([1, 3, 4])
      expect(api.allSelected.value).toBe(true)
    })
  })

  it('suppresses text selection only for modifier clicks', () => {
    const { api } = setup()

    const plain = click()
    api.onTableMouseDown(plain)
    expect(plain.preventDefault).not.toHaveBeenCalled()

    const shifted = click({ shiftKey: true })
    api.onTableMouseDown(shifted)
    expect(shifted.preventDefault).toHaveBeenCalled()
  })
})
