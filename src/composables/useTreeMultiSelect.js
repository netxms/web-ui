import { computed, ref } from 'vue'

/**
 * Shift+Arrow range selection for a sidebar tree: marks rows for a bulk action without
 * navigating to any of them.
 *
 * Reads row order from the DOM (`[role="treeitem"]` with `data-path`), since the tree is split
 * across a recursive component and hand-rolled root rows. Two handlers because the row's own
 * keydown moves focus mid-event: capture sees the start row, bubble sees the new end.
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.containerRef - the `role="tree"` element
 * @param {() => string|null} [options.anchorFallback] - range start for a shift+click when
 *   no row was focused (normally the selected row)
 * @param {(paths: string[]|null) => void} options.onChange - paths in screen order, or `null`
 *   when the range is dropped
 */
export function useTreeMultiSelect({ containerRef, anchorFallback, onChange }) {
  /** Null while there is no range. */
  const selectedPaths = ref(null)

  let anchorPath = null

  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End']

  function rows() {
    return [...(containerRef.value?.querySelectorAll('[role="treeitem"]') ?? [])]
  }

  function pathOf(element) {
    return element?.closest?.('[role="treeitem"]')?.dataset?.path ?? null
  }

  function reset() {
    anchorPath = null
    if (selectedPaths.value === null) return
    selectedPaths.value = null
    onChange(null)
  }

  function selectRange(fromPath, toPath) {
    const visible = rows()
    const from = visible.findIndex((row) => row.dataset.path === fromPath)
    const to = visible.findIndex((row) => row.dataset.path === toPath)
    if (from === -1 || to === -1) return

    const paths = visible
      .slice(Math.min(from, to), Math.max(from, to) + 1)
      .map((row) => row.dataset.path)
    selectedPaths.value = new Set(paths)
    onChange(paths)
  }

  function handleKeydownCapture(event) {
    if (event.key === 'Escape') {
      reset()
      return
    }
    if (!MOVE_KEYS.includes(event.key)) return

    if (!event.shiftKey) {
      reset()
      return
    }
    anchorPath ??= pathOf(document.activeElement)
  }

  function handleKeydown(event) {
    if (!event.shiftKey || !MOVE_KEYS.includes(event.key)) return
    const lead = pathOf(document.activeElement)
    if (!anchorPath || !lead) return
    selectRange(anchorPath, lead)
  }

  // Shift+click is free: only ctrl/cmd and middle click open a new tab.
  function extendTo(path) {
    anchorPath ??= anchorFallback?.() ?? null
    if (!anchorPath) {
      anchorPath = path
      return
    }
    selectRange(anchorPath, path)
  }

  // The Set was filled in screen order, so its first and last entries are the ends.
  const rangeEdges = computed(() => {
    if (!selectedPaths.value?.size) return null
    const paths = [...selectedPaths.value]
    return { first: paths[0], last: paths.at(-1) }
  })

  return { selectedPaths, rangeEdges, handleKeydownCapture, handleKeydown, extendTo, reset }
}

/**
 * Squares off internal corners so a contiguous range reads as one block.
 *
 * @param {string} path
 * @param {{ first: string, last: string }|null} edges - `rangeEdges`
 * @param {boolean} isSelected
 * @returns {string|null}
 */
export function rangeRowClass(path, edges, isSelected) {
  if (!isSelected || !edges || edges.first === edges.last) return null
  if (path === edges.first) return 'range-first'
  if (path === edges.last) return 'range-last'
  return 'range-middle'
}
