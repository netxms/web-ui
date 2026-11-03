/**
 * A double click on the chevron has already toggled twice; acting on it again would leave the
 * branch opposite to what the user sees.
 */
const ROW_CONTROLS = '.tree-toggle, .tree-overflow-btn'

/**
 * @param {MouseEvent} event
 * @param {object} row
 * @param {boolean} row.hasChildren
 * @param {() => void} row.toggle
 */
export function handleTreeRowDblClick(event, { hasChildren, toggle }) {
  if (!hasChildren) return
  if (event.target?.closest?.(ROW_CONTROLS)) return
  toggle()
}
