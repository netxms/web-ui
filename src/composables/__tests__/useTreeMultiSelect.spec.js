import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { rangeRowClass, useTreeMultiSelect } from '@/composables/useTreeMultiSelect'

let container
let changes
let multiSelect

/** Rows in screen order, as the sidebar renders a flat ARIA tree. */
function buildTree(paths = ['1', '2', '2-20', '2-21', '3']) {
  container = document.createElement('div')
  container.setAttribute('role', 'tree')
  container.innerHTML = paths
    .map((path) => `<div role="treeitem" data-path="${path}" tabindex="-1">${path}</div>`)
    .join('')
  document.body.append(container)
}

const row = (path) => container.querySelector(`[data-path="${path}"]`)

/** The row's handler moves focus mid-dispatch: capture runs before the move, bubble after. */
function pressOnRow(fromPath, key, { shiftKey = false, moveTo = null } = {}) {
  const event = { key, shiftKey }
  row(fromPath).focus()
  multiSelect.handleKeydownCapture(event)
  if (moveTo) row(moveTo).focus()
  multiSelect.handleKeydown(event)
}

beforeEach(() => {
  buildTree()
  changes = []
  multiSelect = useTreeMultiSelect({
    containerRef: ref(container),
    anchorFallback: () => null,
    onChange: (paths) => changes.push(paths),
  })
})

afterEach(() => {
  container.remove()
})

describe('useTreeMultiSelect', () => {
  it('starts with no range, so the single selection shows', () => {
    expect(multiSelect.selectedPaths.value).toBe(null)
  })

  it('selects the anchor and the row focus lands on', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })

    expect([...multiSelect.selectedPaths.value]).toEqual(['2', '2-20'])
    expect(changes.at(-1)).toEqual(['2', '2-20'])
  })

  it('grows the range as the user keeps extending, keeping the anchor', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
    pressOnRow('2-20', 'ArrowDown', { shiftKey: true, moveTo: '2-21' })

    expect([...multiSelect.selectedPaths.value]).toEqual(['2', '2-20', '2-21'])
  })

  it('reports the range in screen order when extended upwards', () => {
    pressOnRow('2-21', 'ArrowUp', { shiftKey: true, moveTo: '2-20' })

    expect(changes.at(-1)).toEqual(['2-20', '2-21'])
  })

  it('extends to the end of the tree on Shift+End', () => {
    pressOnRow('2-20', 'End', { shiftKey: true, moveTo: '3' })

    expect([...multiSelect.selectedPaths.value]).toEqual(['2-20', '2-21', '3'])
  })

  it('drops the range on a plain arrow, which is a fresh start', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
    pressOnRow('2-20', 'ArrowDown', { moveTo: '2-21' })

    expect(multiSelect.selectedPaths.value).toBe(null)
    expect(changes.at(-1)).toBe(null)
  })

  it('re-anchors at the row a plain arrow left the keyboard on', () => {
    pressOnRow('1', 'ArrowDown', { shiftKey: true, moveTo: '2' })
    pressOnRow('2', 'ArrowDown', { moveTo: '2-20' })
    pressOnRow('2-20', 'ArrowDown', { shiftKey: true, moveTo: '2-21' })

    expect([...multiSelect.selectedPaths.value]).toEqual(['2-20', '2-21'])
  })

  it('drops the range on Escape', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
    multiSelect.handleKeydownCapture({ key: 'Escape' })

    expect(multiSelect.selectedPaths.value).toBe(null)
  })

  it('reports nothing when there was no range to drop', () => {
    multiSelect.handleKeydownCapture({ key: 'Escape' })

    expect(changes).toEqual([])
  })

  it('ignores keys that do not move between rows', () => {
    pressOnRow('2', 'ArrowRight', { shiftKey: true })

    expect(multiSelect.selectedPaths.value).toBe(null)
  })

  describe('shift+click', () => {
    it('extends from the row the keyboard is on', () => {
      pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
      multiSelect.extendTo('3')

      expect([...multiSelect.selectedPaths.value]).toEqual(['2', '2-20', '2-21', '3'])
    })

    it('extends from the open object when the keyboard was never in the tree', () => {
      const fromSelection = useTreeMultiSelect({
        containerRef: ref(container),
        anchorFallback: () => '2-20',
        onChange: vi.fn(),
      })

      fromSelection.extendTo('3')

      expect([...fromSelection.selectedPaths.value]).toEqual(['2-20', '2-21', '3'])
    })

    it('only anchors when there is nothing to extend from', () => {
      multiSelect.extendTo('2')

      expect(multiSelect.selectedPaths.value).toBe(null)
      expect(changes).toEqual([])
    })
  })

  describe('range edges', () => {
    it('reports nothing while there is no range', () => {
      expect(multiSelect.rangeEdges.value).toBe(null)
    })

    it('reports the two ends in screen order', () => {
      pressOnRow('2', 'End', { shiftKey: true, moveTo: '3' })

      expect(multiSelect.rangeEdges.value).toEqual({ first: '2', last: '3' })
    })

    it('squares off the corners the block shares', () => {
      const edges = { first: '2', last: '3' }

      expect(rangeRowClass('2', edges, true)).toBe('range-first')
      expect(rangeRowClass('2-20', edges, true)).toBe('range-middle')
      expect(rangeRowClass('3', edges, true)).toBe('range-last')
    })

    it('leaves rows outside the range, and a one-row range, alone', () => {
      expect(rangeRowClass('9', { first: '2', last: '3' }, false)).toBe(null)
      expect(rangeRowClass('2', { first: '2', last: '2' }, true)).toBe(null)
      expect(rangeRowClass('2', null, true)).toBe(null)
    })
  })

  it('reset drops the range', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
    multiSelect.reset()

    expect(multiSelect.selectedPaths.value).toBe(null)
    expect(changes.at(-1)).toBe(null)
  })

  it('leaves the range alone when a row it spans is gone', () => {
    pressOnRow('2', 'ArrowDown', { shiftKey: true, moveTo: '2-20' })
    row('2').remove()
    multiSelect.extendTo('3')

    expect([...multiSelect.selectedPaths.value]).toEqual(['2', '2-20'])
  })
})
