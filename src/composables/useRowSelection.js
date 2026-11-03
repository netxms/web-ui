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
  const lastClickedIndex = ref(null)

  const selectableRows = computed(() => toValue(rows).filter((row) => isSelectable(row)))

  function isSelected(row) {
    return toValue(selectedIds).has(idOf(row))
  }

  // A shift-range replaces the selection rather than adding to it, as in the legacy client.
  function toggle(event, row, index) {
    event.stopPropagation()
    if (!isSelectable(row)) return

    const list = toValue(rows)

    if (event.shiftKey && lastClickedIndex.value !== null) {
      const from = Math.min(lastClickedIndex.value, index)
      const to = Math.max(lastClickedIndex.value, index)
      onChange(
        new Set(
          list
            .slice(from, to + 1)
            .filter(isSelectable)
            .map(idOf),
        ),
      )
      return
    }

    const next = new Set(toValue(selectedIds))
    const key = idOf(row)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Not left to the size watcher: it sees only the net size within a tick, so a
    // select-then-deselect would leave a stale anchor.
    lastClickedIndex.value = next.size === 0 ? null : index
    onChange(next)
  }

  function onKeydown(event, row, index) {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    toggle(event, row, index)
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
    lastClickedIndex.value = null
    onChange(new Set(selectableRows.value.map(idOf)))
  }

  function clear() {
    lastClickedIndex.value = null
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
      if (size === 0) lastClickedIndex.value = null
    },
  )

  watch(
    () => toValue(rows),
    () => {
      lastClickedIndex.value = null
    },
  )

  return {
    isSelected,
    toggle,
    onKeydown,
    toggleAll,
    selectAll,
    clear,
    allSelected,
    someSelected,
    onTableMouseDown,
  }
}
