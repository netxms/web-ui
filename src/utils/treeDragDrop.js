import { hasObjectRight } from '@/auth/objectAccessRights'

/** Index = value of the legacy client configuration hint `ObjectBrowser.DragAndDropMode`. */
const SERVER_MODES = ['enable', 'confirm', 'disable']

/** The user's choice; `server` follows the hint. */
export const DRAG_AND_DROP_PREFERENCES = ['server', ...SERVER_MODES]

/**
 * @param {string} preference - one of DRAG_AND_DROP_PREFERENCES
 * @param {string|null} hint - `ObjectBrowser.DragAndDropMode`, as the server sends it
 * @returns {'enable'|'confirm'|'disable'}
 */
export function effectiveDragAndDropMode(preference, hint) {
  if (SERVER_MODES.includes(preference)) return preference
  return SERVER_MODES[Number.parseInt(hint ?? '', 10)] ?? 'enable'
}

/**
 * What a drop onto `target` does with each dragged row, or null when it is refused: onto the row
 * itself or its own branch, into a class that cannot hold it, where it already is, without the
 * right to change either side, or (a move) out of a parent it is not bound to as a container.
 *
 * @param {object} options
 * @param {Array<{object: object, path: string}>} options.rows
 * @param {object} options.target
 * @param {string} options.targetPath
 * @param {boolean} options.copy - bind only, keeping the current parents
 * @param {(childClass: string, parentClass: string) => boolean} options.canBind
 * @param {(path: string) => object|null} options.parentOf - the object a row hangs under
 * @returns {Array<{object: object, source: object|null}>|null}
 */
export function planTreeDrop({ rows, target, targetPath, copy, canBind, parentOf }) {
  if (!target || rows.length === 0 || !hasObjectRight(target, 'MODIFY')) return null
  const branch = targetPath.split('-')
  const moves = []
  for (const { object, path } of rows) {
    if (branch.includes(String(object.id))) return null
    if (!canBind(object.class, target.class) || !hasObjectRight(object, 'MODIFY')) return null
    if (target.children?.some((child) => child.id === object.id)) return null
    const source = copy ? null : parentOf(path)
    if (!copy && !(source && canBind(object.class, source.class))) return null
    if (source?.id === target.id) return null
    moves.push({ object, source })
  }
  return moves
}

/**
 * @param {object} options
 * @param {object[]} options.objects
 * @param {object} options.target
 * @param {boolean} options.copy
 * @returns {{header: string, message: string, acceptLabel: string}}
 */
export function dropConfirmation({ objects, target, copy }) {
  const what = objects.length === 1 ? `"${objects[0].name}"` : `${objects.length} objects`
  return copy
    ? { header: 'Confirm Bind', message: `Bind ${what} to "${target.name}"?`, acceptLabel: 'Bind' }
    : { header: 'Confirm Move', message: `Move ${what} to "${target.name}"?`, acceptLabel: 'Move' }
}
