import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleTreeRowKeydown, visibleTreeRows } from '@/utils/treeKeyboard'

/**
 * Builds a real tree in the DOM, since the helper locates sibling rows by querying the
 * enclosing `[role="tree"]` rather than by taking them as arguments.
 *
 * @param {number[]} levels - aria-level of each row, in document order
 */
function buildTree(levels) {
  const tree = document.createElement('div')
  tree.setAttribute('role', 'tree')
  const rows = levels.map((level) => {
    const row = document.createElement('div')
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(level))
    row.tabIndex = -1
    tree.append(row)
    return row
  })
  document.body.append(tree)
  return rows
}

/** keydown on `row`, with the row as both target and currentTarget. */
function keydown(row, key) {
  const event = { key, target: row, currentTarget: row, preventDefault: vi.fn() }
  return event
}

let rows

beforeEach(() => {
  // Levels: root, child, grandchild, child, root
  rows = buildTree([1, 2, 3, 2, 1])
})

afterEach(() => {
  document.body.innerHTML = ''
})

const leaf = { level: 3, hasChildren: false, expanded: false, toggle: () => {} }

describe('visibleTreeRows', () => {
  it('returns every row of the enclosing tree in document order', () => {
    expect(visibleTreeRows(rows[2])).toEqual(rows)
  })

  it('returns nothing when the row is not inside a tree', () => {
    const orphan = document.createElement('div')
    expect(visibleTreeRows(orphan)).toEqual([])
  })
})

describe('handleTreeRowKeydown', () => {
  it('moves focus down and up between adjacent rows', () => {
    const down = keydown(rows[1], 'ArrowDown')
    handleTreeRowKeydown(down, { ...leaf, level: 2 })
    expect(document.activeElement).toBe(rows[2])
    expect(down.preventDefault).toHaveBeenCalled()

    handleTreeRowKeydown(keydown(rows[2], 'ArrowUp'), leaf)
    expect(document.activeElement).toBe(rows[1])
  })

  it('does not wrap past either end', () => {
    handleTreeRowKeydown(keydown(rows[0], 'ArrowUp'), { ...leaf, level: 1 })
    expect(document.activeElement).not.toBe(rows.at(-1))

    handleTreeRowKeydown(keydown(rows.at(-1), 'ArrowDown'), { ...leaf, level: 1 })
    expect(document.activeElement).not.toBe(rows[0])
  })

  it('jumps to the first and last rows', () => {
    handleTreeRowKeydown(keydown(rows[2], 'Home'), leaf)
    expect(document.activeElement).toBe(rows[0])

    handleTreeRowKeydown(keydown(rows[2], 'End'), leaf)
    expect(document.activeElement).toBe(rows.at(-1))
  })

  it('opens a closed branch on ArrowRight rather than moving', () => {
    const toggle = vi.fn()
    handleTreeRowKeydown(keydown(rows[1], 'ArrowRight'), {
      level: 2,
      hasChildren: true,
      expanded: false,
      toggle,
    })

    expect(toggle).toHaveBeenCalled()
    expect(document.activeElement).not.toBe(rows[2])
  })

  it('steps into an already-open branch on ArrowRight', () => {
    const toggle = vi.fn()
    handleTreeRowKeydown(keydown(rows[1], 'ArrowRight'), {
      level: 2,
      hasChildren: true,
      expanded: true,
      toggle,
    })

    expect(toggle).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(rows[2])
  })

  it('closes an open branch on ArrowLeft', () => {
    const toggle = vi.fn()
    handleTreeRowKeydown(keydown(rows[1], 'ArrowLeft'), {
      level: 2,
      hasChildren: true,
      expanded: true,
      toggle,
    })

    expect(toggle).toHaveBeenCalled()
  })

  it('retreats to the nearest shallower row on ArrowLeft from a leaf', () => {
    // rows[2] is level 3; its parent is rows[1] at level 2, not rows[0] at level 1.
    handleTreeRowKeydown(keydown(rows[2], 'ArrowLeft'), leaf)
    expect(document.activeElement).toBe(rows[1])
  })

  it('does nothing on ArrowLeft at the root level', () => {
    const event = keydown(rows[0], 'ArrowLeft')
    handleTreeRowKeydown(event, { level: 1, hasChildren: false, expanded: false, toggle: () => {} })

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores keys it does not handle, leaving them to navBindings', () => {
    const event = keydown(rows[1], 'Enter')
    handleTreeRowKeydown(event, leaf)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores a keypress that bubbled from a nested control', () => {
    const button = document.createElement('button')
    rows[1].append(button)
    const event = {
      key: 'ArrowDown',
      target: button,
      currentTarget: rows[1],
      preventDefault: vi.fn(),
    }
    handleTreeRowKeydown(event, leaf)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
