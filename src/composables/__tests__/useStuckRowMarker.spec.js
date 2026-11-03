import { describe, it, expect, afterEach } from 'vitest'
import { findLastStuckRow } from '@/composables/useStuckRowMarker'

/** Rows report the given sticky `top` and on-screen offset. */
function buildTree(rows, { scrollTop = 100 } = {}) {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => ({ top: 50 })
  Object.defineProperty(container, 'scrollTop', { value: scrollTop })
  for (const { top, offset, expanded = true } of rows) {
    const row = document.createElement('div')
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-expanded', String(expanded))
    row.style.top = `${top}px`
    row.getBoundingClientRect = () => ({ top: 50 + offset })
    container.appendChild(row)
  }
  document.body.appendChild(container)
  return container
}

describe('findLastStuckRow', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns the lowest row pinned at its sticky offset', () => {
    const tree = buildTree([
      { top: 0, offset: 0 },
      { top: 32, offset: 32 },
      { top: 64, offset: 90 },
    ])
    expect(findLastStuckRow(tree)).toBe(tree.children[1])
  })

  it('ignores collapsed and leaf rows passing through their offset', () => {
    const tree = buildTree([
      { top: 0, offset: 0 },
      { top: 32, offset: 32, expanded: false },
    ])
    expect(findLastStuckRow(tree)).toBe(tree.children[0])
  })

  it('ignores a row being pushed out above its offset', () => {
    const tree = buildTree([
      { top: 0, offset: 0 },
      { top: 32, offset: 20 },
    ])
    expect(findLastStuckRow(tree)).toBe(tree.children[0])
  })

  it('marks nothing while the tree is scrolled to the top', () => {
    const tree = buildTree([{ top: 0, offset: 0 }], { scrollTop: 0 })
    expect(findLastStuckRow(tree)).toBeNull()
  })
})
