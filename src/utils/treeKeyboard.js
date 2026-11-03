import { focusWithRing } from '@/utils/focusRing'

/**
 * Keyboard movement for ARIA tree rows. Rows are found through the DOM because the tree is split
 * across a recursive component and its host view; activation is left to `useNavTarget`.
 */

export function visibleTreeRows(element) {
  const tree = element.closest('[role="tree"]')
  return tree ? [...tree.querySelectorAll('[role="treeitem"]')] : []
}

function moveFocus(element, delta) {
  const rows = visibleTreeRows(element)
  focusWithRing(rows[rows.indexOf(element) + delta])
}

/** Reads `aria-level` off the DOM so it holds however the wrapper elements nest. */
function focusParentRow(element, level) {
  const rows = visibleTreeRows(element)
  for (let i = rows.indexOf(element) - 1; i >= 0; i--) {
    if (Number(rows[i].getAttribute('aria-level')) < level) {
      focusWithRing(rows[i])
      return
    }
  }
}

/**
 * Focus moves without changing the selection: selecting a row navigates to it.
 *
 * @param {KeyboardEvent} event
 * @param {object} row
 * @param {number} row.level
 * @param {boolean} row.hasChildren
 * @param {boolean} row.expanded
 * @param {() => void} row.toggle
 */
export function handleTreeRowKeydown(event, { level, hasChildren, expanded, toggle }) {
  const element = event.currentTarget
  // A keypress inside a nested control (the overflow button) belongs to that control.
  if (event.target !== element) return

  switch (event.key) {
    case 'ArrowDown':
      moveFocus(element, 1)
      break
    case 'ArrowUp':
      moveFocus(element, -1)
      break
    case 'ArrowRight':
      if (hasChildren && !expanded) toggle()
      else if (hasChildren) moveFocus(element, 1)
      else return
      break
    case 'ArrowLeft':
      if (hasChildren && expanded) toggle()
      else if (level > 1) focusParentRow(element, level)
      else return
      break
    case 'Home':
      focusWithRing(visibleTreeRows(element)[0])
      break
    case 'End':
      focusWithRing(visibleTreeRows(element).at(-1))
      break
    default:
      return
  }
  event.preventDefault()
}
