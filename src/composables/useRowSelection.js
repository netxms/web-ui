/**
 * Checkbox row selection for tables, with shift-click ranges. The caller owns the Set; it is
 * never mutated here, since consumers compare Sets by identity.
 */
import { ref, toValue, computed, watch } from 'vue'

/**
 * @param {object} options
 * @param {import('vue').MaybeRefOrGetter<object[]>} options.rows - in display order (filtered
 *   and sorted): a shift-range covers this array's indices
 * @param {(row: object) => string|number} [options.idOf]
 * @param {import('vue').MaybeRefOrGetter<Set>} options.selectedIds
 * @param {(next: Set) => void} options.onChange
 * @param {(row: object) => boolean} [options.isSelectable]
 */
export function useRowSelection({
  rows,
  idOf = (row) => row.id,
  selectedIds,
  onChange,
  isSelectable = () => true,
}) {
  // By id, not position: a live list reorders under the user between the two clicks of a range.
  const anchorId = ref(null)

  const selectableRows = computed(() => toValue(rows).filter((row) => isSelectable(row)))

  function isSelected(row) {
    return toValue(selectedIds).has(idOf(row))
  }

  function indexOfId(id) {
    return toValue(rows).findIndex((row) => idOf(row) === id)
  }

  // A range replaces the selection rather than adding to it, as in the legacy client.
  function selectRange(fromId, toId) {
    const a = indexOfId(fromId)
    const b = indexOfId(toId)
    onChange(
      new Set(
        toValue(rows)
          .slice(Math.min(a, b), Math.max(a, b) + 1)
          .filter(isSelectable)
          .map(idOf),
      ),
    )
  }

  function toggle(event, row) {
    event.stopPropagation()
    if (!isSelectable(row)) return

    const key = idOf(row)

    if (event.shiftKey && anchorId.value !== null && indexOfId(anchorId.value) !== -1) {
      selectRange(anchorId.value, key)
      return
    }

    const next = new Set(toValue(selectedIds))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Not left to the size watcher: it sees only the net size within a tick, so a
    // select-then-deselect would leave a stale anchor.
    anchorId.value = next.size === 0 ? null : key
    onChange(next)
  }

  /**
   * Keyboard range: from the anchor, or from `origin` (the row the keyboard is leaving) when
   * there is none.
   */
  function extendTo(origin, row) {
    if (anchorId.value === null || indexOfId(anchorId.value) === -1) anchorId.value = idOf(origin)
    selectRange(anchorId.value, idOf(row))
  }

  function dropAnchor() {
    anchorId.value = null
  }

  function onKeydown(event, row) {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    toggle(event, row)
  }

  const allSelected = computed(() => {
    const list = selectableRows.value
    if (!list.length) return false
    const current = toValue(selectedIds)
    return list.every((row) => current.has(idOf(row)))
  })

  const someSelected = computed(
    () => !allSelected.value && selectableRows.value.some((row) => isSelected(row)),
  )

  function selectAll() {
    dropAnchor()
    onChange(new Set(selectableRows.value.map(idOf)))
  }

  function clear() {
    dropAnchor()
    onChange(new Set())
  }

  function toggleAll() {
    if (allSelected.value) clear()
    else selectAll()
  }

  // Suppresses the browser's text selection on shift- or ctrl-click.
  function onTableMouseDown(event) {
    if (event.shiftKey || event.ctrlKey || event.metaKey) event.preventDefault()
  }

  // Selections emptied from outside never pass through `toggle`.
  watch(
    () => toValue(selectedIds).size,
    (size) => {
      if (size === 0) dropAnchor()
    },
  )

  return {
    isSelected,
    toggle,
    extendTo,
    dropAnchor,
    onKeydown,
    toggleAll,
    selectAll,
    clear,
    allSelected,
    someSelected,
    onTableMouseDown,
  }
}
