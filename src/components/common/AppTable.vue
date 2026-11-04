<script setup>
/**
 * @typedef {Object} TableColumn
 * @property {string} id - Also keys the persisted column widths.
 * @property {string} field - Row property shown; also the default sort key.
 * @property {string} label
 * @property {boolean} [sortable=false]
 * @property {string} [sortField] - Defaults to `field`.
 * @property {number} [width=150] - Pixels. Ignored when `fitColumns` is true.
 * @property {boolean} [reorderable=true] - With the table's `reorderable` on, `false` pins the
 *   column (e.g. a trailing actions column): it cannot be dragged or dropped next to.
 */

import { ref, computed, getCurrentInstance, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import Paginator from 'primevue/paginator'
import Checkbox from 'primevue/checkbox'
import Tooltip from 'primevue/tooltip'
import { ChevronsDownUp } from 'lucide-vue-next'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import AppTableRow from '@/components/common/AppTableRow.vue'
import { useRowSelection } from '@/composables/useRowSelection'
import { mayStealFocus } from '@/composables/useRegionFocus'
import { useWorkingState } from '@/composables/useWorkingState'
import { tables } from '@/utils/appStorage'
import LoadingState from '@/components/common/LoadingState.vue'

/**
 * Replaces PrimeVue DataTable for large lists, where DataTable's overhead becomes a bottleneck.
 *
 * @slot cell {col: TableColumn, row: Object} - Falls back to `row[col.field] ?? '--'`.
 * @slot empty - Shown when rows is empty and loading is false. Default: "No data".
 * @event retry - The Retry button in the error state was clicked.
 */
defineOptions({ name: 'AppTable' })

const props = defineProps({
  /** @type {TableColumn[]} */
  columns: { type: Array, required: true },
  /** @type {Object[]} Each row needs a unique `id`. */
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  /** Must match a column's `field` or `sortField`. */
  sortField: { type: String, default: null },
  /** `1` ascending, `-1` descending. */
  sortOrder: { type: Number, default: 1 },
  striped: { type: Boolean, default: false },
  columnBorders: { type: Boolean, default: false },
  /** Disables drag-to-resize. */
  fitColumns: { type: Boolean, default: false },
  /** Fill the container width but keep drag-to-resize: a drag adjusts the right neighbor. */
  resizeFit: { type: Boolean, default: false },
  /** `'small'` or `'normal'`. */
  size: { type: String, default: 'small' },
  /** @type {((row: Object) => string | Object | Array) | null} */
  rowClass: { type: Function, default: null },
  /** Initial page size; `null` disables pagination. */
  pageSize: { type: Number, default: null },
  /** @type {number[]} */
  pageSizeOptions: { type: Array, default: () => [25, 50, 100, 200] },
  /**
   * Remembers page size and column widths, and restores sort, page, open rows and scroll on
   * remount (`useWorkingState`). Omit to disable.
   */
  storageKey: { type: String, default: null },
  /**
   * What the rows belong to when that is not the route's object; page, open rows and scroll
   * are restored only for the same owner.
   */
  ownerId: { type: [String, Number], default: null },
  expandable: { type: Boolean, default: false },
  /** Simplified paginator: no rows-per-page dropdown, no page links. */
  compact: { type: Boolean, default: false },
  /**
   * Fill the container but allow growing past it (horizontal scroll). A filler column absorbs
   * spare space; with `resizeFit` the columns stretch instead, so widths act as minimums.
   */
  autoWidth: { type: Boolean, default: false },
  /**
   * Route a row navigates to; enables ctrl/middle-click "open in new tab".
   * @type {import('vue').PropType<(row: object) => object>}
   */
  targetFor: { type: Function, default: null },
  /**
   * Checkbox selection with select-all and shift-ranges. Ctrl/cmd- and shift-click on a row
   * select too, except ctrl/cmd on a `targetFor` row opens a new tab. The parent owns the Set.
   */
  selectable: { type: Boolean, default: false },
  /** @type {Set} Only read when `selectable`. */
  selectedIds: { type: Set, default: () => new Set() },
  /**
   * Unselectable rows get no checkbox and are skipped by select-all and shift-ranges.
   * @type {import('vue').PropType<(row: object) => boolean>}
   */
  rowSelectable: { type: Function, default: null },
  /**
   * Drag a header to move its column. The table only emits `column-move`; the parent keeps the
   * order (a `defineTableColumnStore` store) and passes `columns` back.
   */
  reorderable: { type: Boolean, default: false },
})

/**
 * @event row-click {Object} row
 * @event row-contextmenu {{ event: MouseEvent, row: Object }}
 * @event row-mouseenter {Object} row - Also when the row takes focus.
 * @event row-mouseleave {Object} row - Also when the row loses focus.
 * @event selection-change {Set} - The next set of selected row ids.
 * @event column-move {{ id: string, targetId: string, after: boolean }}
 * @event column-resize {Record<string, number>} - Widths changed by a resize drag, by column id.
 * @event page-size-change {number}
 */
const emit = defineEmits([
  'row-click',
  'row-contextmenu',
  'row-mouseenter',
  'row-mouseleave',
  'selection-change',
  'retry',
  'column-move',
  'column-resize',
  'page-size-change',
])

const expandedRows = ref(new Set())

/** Empty trailing column that takes the spare width `autoWidth` leaves unstretched columns. */
const hasFiller = computed(() => props.autoWidth && !props.resizeFit)

const totalColumns = computed(
  () =>
    props.columns.length +
    (props.selectable ? 1 : 0) +
    (props.expandable ? 1 : 0) +
    (hasFiller.value ? 1 : 0),
)

// Ctrl/cmd- or shift-click on a selectable row selects instead of activating. With a
// `targetFor`, ctrl/cmd never gets here: navBindings opens a new tab first.
function onRowClick(row, index, event) {
  if (props.selectable && (event?.ctrlKey || event?.metaKey || event?.shiftKey)) {
    if (canSelectRow(row)) toggleRowSelection(event, row, index)
    return
  }
  if (props.expandable) {
    if (expandedRows.value.has(row.id)) expandedRows.value.delete(row.id)
    else expandedRows.value.add(row.id)
  }
  emit('row-click', row)
}

function expandRow(id) {
  if (props.expandable) expandedRows.value.add(id)
}

/**
 * Opens rows in display order, stopping at `limit`.
 * @param {Iterable} ids
 * @param {number} [limit]
 * @returns {number} how many are open now, counting rows that already were
 */
function expandRows(ids, limit = Infinity) {
  if (!props.expandable) return 0
  const wanted = new Set(ids)
  let opened = 0
  for (const row of sortedRows.value) {
    if (opened >= limit) break
    if (!wanted.has(row.id)) continue
    expandedRows.value.add(row.id)
    opened++
  }
  return opened
}

function collapseAll() {
  expandedRows.value.clear()
}

defineExpose({ expandRow, expandRows, collapseAll, revealRow })

// Local registration, so specs mounting a table need not provide the directive.
const vTooltip = Tooltip

// Named so each row gets the same listener on every render (see AppTableRow).
function emitRowContextmenu(payload) {
  emit('row-contextmenu', payload)
}
function emitRowMouseenter(row) {
  emit('row-mouseenter', row)
}
function emitRowMouseleave(row) {
  emit('row-mouseleave', row)
}

// Read once: vnode.props is not reactive.
const hasRowClickListener = !!getCurrentInstance()?.vnode.props?.onRowClick

const rowsClickable = computed(
  () => props.expandable || props.targetFor != null || hasRowClickListener,
)

const sortKeys = ref(props.sortField ? [{ field: props.sortField, order: props.sortOrder }] : [])

function onHeaderClick(event, col) {
  if (!col.sortable) return
  const field = col.sortField ?? col.field
  const idx = sortKeys.value.findIndex((k) => k.field === field)

  if (event.shiftKey) {
    if (idx === -1) {
      sortKeys.value = [...sortKeys.value, { field, order: 1 }]
    } else if (sortKeys.value[idx].order === 1) {
      sortKeys.value = sortKeys.value.map((k, i) => (i === idx ? { ...k, order: -1 } : k))
    } else {
      sortKeys.value = sortKeys.value.filter((_, i) => i !== idx)
    }
  } else {
    if (idx === -1 || sortKeys.value.length > 1) {
      sortKeys.value = [{ field, order: 1 }]
    } else if (sortKeys.value[0].order === 1) {
      sortKeys.value = [{ field, order: -1 }]
    } else {
      sortKeys.value = []
    }
  }
}

function compareValues(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  return a < b ? -1 : a > b ? 1 : 0
}

const sortedRows = computed(() => {
  if (!sortKeys.value.length) return props.rows
  return [...props.rows].sort((a, b) => {
    for (const { field, order } of sortKeys.value) {
      const r = compareValues(a[field], b[field]) * order
      if (r !== 0) return r
    }
    return 0
  })
})

function isSortedBy(col) {
  const field = col.sortField ?? col.field
  return sortKeys.value.some((k) => k.field === field)
}

// Only the first sort key reports a direction: aria-sort cannot express sort priority.
function ariaSortFor(col) {
  if (!col.sortable) return undefined
  const field = col.sortField ?? col.field
  if (sortKeys.value[0]?.field !== field) return 'none'
  return sortKeys.value[0].order === -1 ? 'descending' : 'ascending'
}
function sortKeyFor(col) {
  const field = col.sortField ?? col.field
  return sortKeys.value.find((k) => k.field === field) ?? null
}
function sortPriority(col) {
  if (sortKeys.value.length <= 1) return null
  const field = col.sortField ?? col.field
  const i = sortKeys.value.findIndex((k) => k.field === field)
  return i === -1 ? null : i + 1
}

const first = ref(0)
const internalPageSize = ref(
  (() => {
    if (props.storageKey) {
      const saved = Number(tables.get(`${props.storageKey}.pageSize`))
      if (saved && props.pageSizeOptions.includes(saved)) return saved
    }
    return props.pageSize
  })(),
)

// Clamp rather than reset, so a background refetch does not bump the user back to page 0.
watch(
  () => props.rows.length,
  (length) => {
    if (!internalPageSize.value || first.value < length) return
    first.value =
      Math.max(0, Math.ceil(length / internalPageSize.value) - 1) * internalPageSize.value
  },
)

function onPaginatorRowsChange(newSize) {
  if (newSize !== internalPageSize.value) first.value = 0
  internalPageSize.value = newSize
  if (props.storageKey) tables.set(`${props.storageKey}.pageSize`, newSize)
  emit('page-size-change', newSize)
}

// Gated on internalPageSize, not the prop: a stored size can exist for a table without the
// prop, and slicing by a size the paginator is not showing would hide rows.
const pagedRows = computed(() => {
  if (!internalPageSize.value) return sortedRows.value
  return sortedRows.value.slice(first.value, first.value + internalPageSize.value)
})

const anyPagedRowExpanded = computed(
  () => props.expandable && pagedRows.value.some((row) => expandedRows.value.has(row.id)),
)

// Scoped to the current page; the selection survives paging because the parent owns the Set.

const {
  isSelected: isRowSelected,
  toggle: toggleRowSelection,
  onKeydown: onCheckboxKeydown,
  toggleAll: toggleAllSelection,
  allSelected,
  someSelected,
  onTableMouseDown,
} = useRowSelection({
  rows: pagedRows,
  selectedIds: () => props.selectedIds,
  onChange: (next) => emit('selection-change', next),
  isSelectable: (row) => props.rowSelectable?.(row) ?? true,
})

function canSelectRow(row) {
  return props.rowSelectable?.(row) ?? true
}

// Roving tabindex: one tab stop for the whole table, arrow keys move between rows.

const focusedRowIndex = ref(0)
const tbodyRef = ref(null)

// A page change or a shrinking filter must not leave the tab stop past the end.
watch(
  () => pagedRows.value.length,
  (length) => {
    if (focusedRowIndex.value >= length) focusedRowIndex.value = Math.max(0, length - 1)
  },
)

/** Also reported as hovered, so keyboard users get the row-hover affordance. */
function onRowFocus(index, row) {
  focusedRowIndex.value = index
  emit('row-mouseenter', row)
}

function onRowKeydown(event, index) {
  let next
  if (event.key === 'ArrowDown') next = index + 1
  else if (event.key === 'ArrowUp') next = index - 1
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = pagedRows.value.length - 1
  else return

  if (next < 0 || next >= pagedRows.value.length) return
  event.preventDefault()
  focusedRowIndex.value = next
  // The tabindex swap has to land in the DOM before the row can take focus.
  nextTick(() => tbodyRef.value?.querySelector('tr[tabindex="0"]')?.focus())
}

/** Matches the `app-table-reveal` animation. */
const REVEAL_FLASH_MS = 1600

const wrapRef = ref(null)

const revealedRowId = ref(null)
let revealTimer = null

onBeforeUnmount(() => clearTimeout(revealTimer))

/**
 * Switches to the row's page, scrolls it into view, gives it the tab stop and flashes it.
 * Focus moves only when it is fair to take it (not out of a filter or an open dialog).
 *
 * @returns {boolean} false when no row has that id
 */
function revealRow(id) {
  const index = sortedRows.value.findIndex((row) => row.id === id)
  if (index === -1) return false

  const size = internalPageSize.value
  if (size) first.value = Math.floor(index / size) * size
  const pageIndex = size ? index - first.value : index
  focusedRowIndex.value = pageIndex

  revealedRowId.value = id
  clearTimeout(revealTimer)
  revealTimer = setTimeout(() => (revealedRowId.value = null), REVEAL_FLASH_MS)

  // The page switch and the tabindex swap have to land in the DOM first.
  nextTick(() => {
    const tr = dataRowElements()[pageIndex]
    if (!tr) return
    scrollRowIntoView(tr)
    if (rowsClickable.value && mayStealFocus()) tr.focus({ preventScroll: true })
  })
  return true
}

function dataRowElements() {
  const rows = tbodyRef.value?.children ?? []
  return Array.from(rows).filter((tr) => !tr.classList.contains('app-table__expansion-row'))
}

// Scrolls the wrapper directly: scrollIntoView would also move every scrollable ancestor.
function scrollRowIntoView(tr) {
  const wrap = wrapRef.value
  if (!wrap) return
  const wrapRect = wrap.getBoundingClientRect()
  const rowRect = tr.getBoundingClientRect()
  const headerHeight = wrap.querySelector('thead')?.offsetHeight ?? 0
  const visibleTop = wrapRect.top + headerHeight
  if (rowRect.top >= visibleTop && rowRect.bottom <= wrapRect.bottom) return
  const viewportCenter = visibleTop + (wrapRect.bottom - visibleTop) / 2
  wrap.scrollTop += rowRect.top + rowRect.height / 2 - viewportCenter
}

// Working state: the sort follows the user to the next object; page, open rows, tab stop and
// scroll belong to this object's rows.

/** Every open row may fetch, so the restore is bounded. */
const RESTORED_EXPANSION_LIMIT = 20

// Applied once rows exist: an uncached table mounts with a loading row first.
let pendingScrollTop = 0

function restoreScroll(top) {
  pendingScrollTop = top
  // Only a reset to another object finds the element already there.
  if (!top && wrapRef.value) wrapRef.value.scrollTop = 0
}

function applyPendingScroll() {
  if (!pendingScrollTop || !wrapRef.value) return
  if (props.loading || props.error || !pagedRows.value.length) return
  wrapRef.value.scrollTop = pendingScrollTop
  pendingScrollTop = 0
}

if (props.storageKey) {
  useWorkingState(
    `table:${props.storageKey}`,
    {
      view: { sortKeys },
      object: {
        first,
        focusedRowIndex,
        expandedRows: {
          get: () => expandedRows.value,
          set: (ids) => (expandedRows.value = new Set([...ids].slice(0, RESTORED_EXPANSION_LIMIT))),
        },
        scrollTop: { get: () => wrapRef.value?.scrollTop ?? 0, set: restoreScroll },
      },
    },
    props.ownerId != null ? { objectKey: () => props.ownerId } : {},
  )
  onMounted(applyPendingScroll)
  watch([() => pagedRows.value.length, () => props.loading], applyPendingScroll, {
    flush: 'post',
  })
}

const MIN_COL_WIDTH = 40
const colWidthsById = ref({})

// Screen-dependent, so kept in this browser (`tables`); a corrupt entry must not reach the
// <colgroup>.
const savedWidths = (() => {
  if (!props.storageKey) return {}
  const stored = tables.get(`${props.storageKey}.widths`) ?? {}
  return Object.fromEntries(
    Object.entries(stored).filter(([, w]) => Number.isFinite(w) && w >= MIN_COL_WIDTH),
  )
})()

// Seed widths for new columns only, keeping dragged ones. A watchEffect here would depend on
// its own output and restyle the <colgroup> on every drag frame.
watch(
  () => props.columns,
  (columns) => {
    const next = {}
    for (const col of columns) {
      next[col.id] = colWidthsById.value[col.id] ?? savedWidths[col.id] ?? col.width ?? 150
    }
    colWidthsById.value = next
  },
  { immediate: true },
)

const colWidths = computed(() => props.columns.map((c) => colWidthsById.value[c.id] ?? 150))

// The checkbox and expander columns count too: resizeFit columns share what they leave.
const tableMinWidth = computed(() => {
  if (!props.autoWidth) return null
  const total = colWidths.value.reduce((s, w) => s + w, 0)
  const fixedCols = (props.selectable ? 1 : 0) + (props.expandable ? 1 : 0)
  return fixedCols ? `calc(${total}px + ${fixedCols * 2.5}rem)` : total + 'px'
})

// Pixel widths as percentage strings for resizeFit mode.
const colStyleList = computed(() => {
  if (!props.resizeFit) return colWidths.value.map((w) => w + 'px')
  const total = colWidths.value.reduce((s, w) => s + w, 0)
  return colWidths.value.map(
    (w) => (total > 0 ? (w / total) * 100 : 100 / props.columns.length) + '%',
  )
})

/**
 * Swallows the click that ends a resize drag: some browsers send it to the element under the
 * cursor despite pointer capture. Dropped on the next task, so a drag without a click does not
 * eat the next real click.
 */
function swallowNextClick() {
  const swallow = (event) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
}

/** Reported once per drag, not per frame: a parent that stores widths writes on each event. */
function emitResize(colIds) {
  const widths = {}
  for (const id of colIds) widths[id] = Math.round(colWidthsById.value[id])
  if (props.storageKey) {
    Object.assign(savedWidths, widths)
    tables.set(`${props.storageKey}.widths`, savedWidths)
  }
  emit('column-resize', widths)
}

function onResizeStart(event, colId) {
  event.preventDefault()
  const handle = event.currentTarget
  handle.setPointerCapture(event.pointerId)
  const startX = event.clientX
  const startWidth = colWidthsById.value[colId] ?? 150

  function onMove(e) {
    colWidthsById.value[colId] = Math.max(MIN_COL_WIDTH, startWidth + (e.clientX - startX))
  }
  function onUp() {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    swallowNextClick()
    emitResize([colId])
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

// resizeFit resize: adjusts dragged column and steals/returns pixels from/to right neighbor.
function onResizeFitStart(event, colIndex) {
  event.preventDefault()
  const handle = event.currentTarget
  handle.setPointerCapture(event.pointerId)
  const nextIndex = colIndex + 1
  if (nextIndex >= props.columns.length) return

  const colId = props.columns[colIndex].id
  const nextColId = props.columns[nextIndex].id
  const startX = event.clientX
  const startCurrent = colWidthsById.value[colId] ?? 150
  const startNext = colWidthsById.value[nextColId] ?? 150

  // Scale converts screen pixels -> internal units so visual change matches cursor movement.
  const total = colWidths.value.reduce((s, w) => s + w, 0)
  const containerWidth = event.currentTarget.closest('table').offsetWidth
  const scale = total / containerWidth

  function onMove(e) {
    const delta = (e.clientX - startX) * scale
    const newCurrent = Math.max(MIN_COL_WIDTH, startCurrent + delta)
    const actualDelta = newCurrent - startCurrent
    const newNext = Math.max(MIN_COL_WIDTH, startNext - actualDelta)
    colWidthsById.value[colId] = newCurrent
    colWidthsById.value[nextColId] = newNext
  }
  function onUp() {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    swallowNextClick()
    emitResize([colId, nextColId])
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

// A header becomes a drag only after a few pixels of movement, so a click still sorts.

const DRAG_THRESHOLD = 5
const AUTOSCROLL_EDGE = 40
const AUTOSCROLL_STEP = 12

const headerRowRef = ref(null)
const draggingColId = ref(null)
/** @type {import('vue').Ref<{ id: string, after: boolean } | null>} */
const dropTarget = ref(null)

let dragPointerX = 0
let autoScrollFrame = 0
/** Ends the drag in progress, if any: listeners off, nothing emitted. */
let cancelDrag = null

onBeforeUnmount(() => cancelDrag?.())

function canReorder(col) {
  return props.reorderable && col.reorderable !== false
}

/** Where a drop at clientX `x` would land, or null when the column would stay put. */
function dropTargetAt(x, dragId) {
  const ths = [...(headerRowRef.value?.querySelectorAll('th[data-reorder-id]') ?? [])]
  if (!ths.length) return null
  let target = { id: ths.at(-1).dataset.reorderId, after: true }
  for (const th of ths) {
    const { left, right } = th.getBoundingClientRect()
    if (x < right) {
      target = { id: th.dataset.reorderId, after: x > (left + right) / 2 }
      break
    }
  }
  const ids = ths.map((th) => th.dataset.reorderId)
  const from = ids.indexOf(dragId)
  const to = ids.indexOf(target.id)
  if (to === from || (to === from - 1 && target.after) || (to === from + 1 && !target.after)) {
    return null
  }
  return target
}

function autoScroll() {
  autoScrollFrame = 0
  const wrap = wrapRef.value
  if (!wrap || !draggingColId.value) return
  const { left, right } = wrap.getBoundingClientRect()
  let step = 0
  if (dragPointerX < left + AUTOSCROLL_EDGE) step = -AUTOSCROLL_STEP
  else if (dragPointerX > right - AUTOSCROLL_EDGE) step = AUTOSCROLL_STEP
  if (!step) return
  const before = wrap.scrollLeft
  wrap.scrollLeft += step
  if (wrap.scrollLeft === before) return
  dropTarget.value = dropTargetAt(dragPointerX, draggingColId.value)
  autoScrollFrame = requestAnimationFrame(autoScroll)
}

function onHeaderPointerDown(event, col) {
  if (!canReorder(col) || event.button !== 0) return
  if (event.target.closest?.('.col-resize-handle')) return
  const startX = event.clientX

  function onMove(e) {
    if (!draggingColId.value) {
      if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return
      draggingColId.value = col.id
    }
    dragPointerX = e.clientX
    dropTarget.value = dropTargetAt(dragPointerX, col.id)
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll)
  }

  function end() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', end)
    cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = 0
    cancelDrag = null
    const dragged = draggingColId.value != null
    draggingColId.value = null
    dropTarget.value = null
    // The click that ends a drag must not sort the column it was dropped on.
    if (dragged) swallowNextClick()
  }

  function onUp() {
    const target = draggingColId.value != null ? dropTarget.value : null
    end()
    if (target) emit('column-move', { id: col.id, targetId: target.id, after: target.after })
  }

  cancelDrag?.()
  cancelDrag = end
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', end)
}
</script>

<template>
  <!-- mousedown only suppresses text selection during a shift/ctrl-click row selection. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div class="app-table-outer" @mousedown="selectable && onTableMouseDown($event)">
    <div
      ref="wrapRef"
      class="app-table-wrap"
      :class="{
        'app-table-wrap--fit': fitColumns,
        'app-table-wrap--resize-fit': resizeFit && !autoWidth,
      }"
    >
      <table
        class="app-table"
        :class="[
          `app-table--${size}`,
          {
            'app-table--reordering': draggingColId != null,
            'app-table--striped': striped,
            'app-table--column-borders': columnBorders,
            'app-table--fit': fitColumns,
            'app-table--resize-fit': resizeFit,
            'app-table--expandable': expandable,
            'app-table--clickable-rows': rowsClickable,
            'app-table--auto-width': autoWidth,
          },
        ]"
        :style="autoWidth ? { minWidth: tableMinWidth } : {}"
      >
        <colgroup v-if="!fitColumns">
          <col v-if="selectable" style="width: 2.5rem" />
          <col v-if="expandable" style="width: 2.5rem" />
          <col v-for="(col, i) in columns" :key="col.id" :style="{ width: colStyleList[i] }" />
          <col v-if="hasFiller" />
        </colgroup>
        <thead>
          <tr ref="headerRowRef">
            <!-- The wrapper is the control; the inert Checkbox is hidden from assistive technology
                 so the cell is not announced twice. -->
            <th v-if="selectable" class="app-table__checkbox-th">
              <div
                class="app-table__checkbox-wrap"
                role="checkbox"
                tabindex="0"
                :aria-checked="someSelected ? 'mixed' : allSelected"
                aria-label="Select all rows on this page"
                @click.stop="toggleAllSelection()"
                @keydown.enter.prevent="toggleAllSelection()"
                @keydown.space.prevent="toggleAllSelection()"
              >
                <Checkbox
                  :model-value="allSelected"
                  :indeterminate="someSelected"
                  :binary="true"
                  :tabindex="-1"
                  aria-hidden="true"
                  style="pointer-events: none"
                />
              </div>
            </th>
            <!-- Screen-reader-only name (an empty <th> reads as "blank"); holds "collapse
                 all" while a row on the page is open. -->
            <th v-if="expandable" class="app-table__expander-th">
              <button
                v-if="anyPagedRowExpanded"
                v-tooltip.bottom="'Collapse all'"
                type="button"
                class="app-table__collapse-all"
                aria-label="Collapse all rows"
                @click.stop="collapseAll"
              >
                <ChevronsDownUp :size="14" aria-hidden="true" />
              </button>
              <span v-else class="sr-only">Expand</span>
            </th>
            <th
              v-for="(col, colIdx) in columns"
              :key="col.id"
              scope="col"
              :aria-sort="ariaSortFor(col)"
              :data-reorder-id="canReorder(col) ? col.id : undefined"
              :class="{
                'app-table__th--sortable': col.sortable,
                'app-table__th--sorted': isSortedBy(col),
                'app-table__th--dragging': draggingColId === col.id,
                'app-table__th--drop-before': dropTarget?.id === col.id && !dropTarget.after,
                'app-table__th--drop-after': dropTarget?.id === col.id && dropTarget.after,
              }"
              @pointerdown="onHeaderPointerDown($event, col)"
              @click="onHeaderClick($event, col)"
              @keydown.enter.prevent="onHeaderClick($event, col)"
              @keydown.space.prevent="onHeaderClick($event, col)"
              :tabindex="col.sortable ? 0 : undefined"
            >
              <span class="app-table__th-label">{{ col.label }}</span>
              <span v-if="col.sortable" class="app-table__sort-icon">
                <i
                  v-if="!isSortedBy(col)"
                  class="pi pi-sort-alt app-table__sort-glyph app-table__sort-glyph--idle"
                />
                <template v-else>
                  <i
                    class="pi pi-arrow-up app-table__sort-glyph"
                    :class="{ 'app-table__sort-glyph--desc': sortKeyFor(col)?.order === -1 }"
                  />
                  <span v-if="sortPriority(col)" class="app-table__sort-priority">{{
                    sortPriority(col)
                  }}</span>
                </template>
              </span>
              <div
                v-if="!fitColumns"
                class="col-resize-handle"
                @pointerdown="
                  resizeFit ? onResizeFitStart($event, colIdx) : onResizeStart($event, col.id)
                "
                @click.stop
              />
            </th>
            <th v-if="hasFiller" class="app-table__th--filler" />
          </tr>
        </thead>
        <tbody ref="tbodyRef">
          <tr v-if="loading">
            <td :colspan="totalColumns" class="app-table__state-cell">
              <LoadingState />
            </td>
          </tr>
          <tr v-else-if="error">
            <td :colspan="totalColumns" class="app-table__state-cell" aria-live="assertive">
              <QueryErrorState :error="error" @retry="emit('retry')" />
            </td>
          </tr>
          <tr v-else-if="!sortedRows.length">
            <td :colspan="totalColumns" class="app-table__state-cell" aria-live="polite">
              <slot name="empty">No data</slot>
            </td>
          </tr>
          <template v-else>
            <!-- Props are booleans, the row or stable functions, so unchanged rows skip re-render.
                 Forwarded slots must not mention `row` or `rowIdx` (even `cell.row`), or every row
                 re-renders; hence the "--" fallback lives in AppTableRow. -->
            <AppTableRow
              v-for="(row, rowIdx) in pagedRows"
              :key="row.id ?? row"
              :row="row"
              :index="rowIdx"
              :columns="columns"
              :row-class="rowClass"
              :target-for="targetFor"
              :clickable="rowsClickable"
              :tab-stop="rowIdx === focusedRowIndex"
              :selectable="selectable"
              :can-select="canSelectRow(row)"
              :selected="selectable && isRowSelected(row)"
              :expandable="expandable"
              :expanded="expandable && expandedRows.has(row.id)"
              :revealed="revealedRowId != null && row.id === revealedRowId"
              :filler="hasFiller"
              :total-columns="totalColumns"
              @activate="onRowClick"
              @toggle-select="toggleRowSelection"
              @select-keydown="onCheckboxKeydown"
              @row-keydown="onRowKeydown"
              @row-focus="onRowFocus"
              @row-contextmenu="emitRowContextmenu"
              @row-mouseenter="emitRowMouseenter"
              @row-mouseleave="emitRowMouseleave"
            >
              <template #cell="cell">
                <slot name="cell" v-bind="cell" />
              </template>
              <template #expansion="expansion">
                <slot name="expansion" v-bind="expansion" />
              </template>
            </AppTableRow>
          </template>
        </tbody>
      </table>
    </div>
    <Paginator
      v-if="internalPageSize"
      v-model:first="first"
      :rows="internalPageSize"
      :rows-per-page-options="compact ? [] : pageSizeOptions"
      :template="compact ? 'PrevPageLink CurrentPageReport NextPageLink' : undefined"
      :current-page-report-template="compact ? '{first}-{last} of {totalRecords}' : undefined"
      :total-records="sortedRows.length"
      :always-show="false"
      class="app-table-paginator"
      :class="{ 'app-table-paginator--compact': compact }"
      @update:rows="onPaginatorRowsChange"
    />
  </div>
</template>

<style scoped>
.app-table-outer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.app-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
}

.app-table-paginator {
  flex-shrink: 0;
  border-top: 1px solid var(--p-content-border-color);
}

.app-table-paginator--compact :deep(.p-paginator) {
  padding-block: 0.25rem;
  gap: 0.125rem;
}

.app-table-paginator--compact :deep(.p-paginator-nav-button),
.app-table-paginator--compact :deep(.p-paginator-page) {
  width: 1.75rem;
  height: 1.75rem;
  min-width: 1.75rem;
}

.app-table-wrap--fit,
.app-table-wrap--resize-fit {
  overflow-x: hidden;
}

.app-table {
  width: max-content;
  border-collapse: collapse;
  table-layout: fixed;
}

.app-table--fit,
.app-table--resize-fit,
.app-table--auto-width {
  width: 100%;
}

.app-table--small {
  font-size: 0.8125rem;
}

.app-table--normal {
  font-size: 0.875rem;
}

.app-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--p-datatable-header-cell-background, var(--p-surface-100));
  border-bottom: 2px solid var(--p-content-border-color);
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  user-select: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.app-table--small thead th {
  padding: 0.25rem 0.5rem;
}

.app-table--normal thead th {
  padding: 0.375rem 0.75rem;
}

.app-table__th--sortable {
  cursor: pointer;
}

/* focus-visible so a mouse click leaves no ring; negative offset avoids clipping by the
   scroll container. */
.app-table thead th:focus-visible,
.app-table > :deep(tbody > tr:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.app-table__th--sortable:hover:not(.app-table__th--sorted) {
  background: var(--p-content-hover-background);
}

.app-table__th--sorted {
  background: color-mix(
    in srgb,
    var(--p-primary-color) 10%,
    var(--p-datatable-header-cell-background, var(--p-surface-100))
  ) !important;
  color: var(--p-primary-700, var(--p-primary-color));
}

.app-table__sort-icon {
  display: inline-block;
  width: 0.85rem;
  margin-left: 0.3rem;
  vertical-align: middle;
}

.app-table__sort-glyph {
  font-size: 0.7rem;
  display: inline-block;
  transition:
    transform 0.18s ease,
    opacity 0.18s;
}

.app-table__sort-glyph--idle {
  opacity: 0.3;
}

.app-table__sort-glyph--desc {
  transform: rotate(180deg);
}

.app-table__sort-priority {
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1;
  color: var(--p-primary-color);
  margin-left: 1px;
  vertical-align: super;
}

/* Body rows render in AppTableRow, hence :deep(). `tbody > *` keeps the specificity of
   `tbody > td`; child combinators keep the rules off tables nested in expansion rows. */

.app-table--small > :deep(tbody > * > td) {
  padding: 0.3rem 0.75rem;
}

.app-table--normal > :deep(tbody > * > td) {
  padding: 0.4rem 0.75rem;
}

.app-table > :deep(tbody > * > td) {
  border-bottom: 1px solid var(--p-content-border-color);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
}

.app-table > :deep(tbody > tr:hover > td) {
  background: var(--p-content-hover-background);
}

.app-table--clickable-rows > :deep(tbody > tr:not(.app-table__expansion-row)) {
  cursor: pointer;
}

.app-table--striped > :deep(tbody > tr:nth-child(even) > td) {
  background: var(--p-datatable-row-striped-background, var(--p-surface-100));
}

.app-table--striped > :deep(tbody > tr:nth-child(even):hover > td) {
  background: var(--p-content-hover-background);
}

.app-table__state-cell {
  padding: 1.5rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.app-table > :deep(tbody > * > td.app-table__state-cell) {
  white-space: normal;
}

.app-table__state-cell :deep(.query-error-state) {
  justify-content: center;
}

.app-table--column-borders thead th,
.app-table--column-borders > :deep(tbody > * > td) {
  border-right: 1px solid var(--p-content-border-color);
}

.app-table--column-borders thead th:last-child,
.app-table--column-borders > :deep(tbody > * > td:last-child) {
  border-right: none;
}

.col-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
}

.col-resize-handle:hover {
  background: var(--p-primary-color);
  opacity: 0.4;
}

/* Inset shadows rather than borders, so the header width does not change. */
.app-table thead th.app-table__th--drop-before {
  box-shadow: inset 3px 0 0 var(--p-primary-color);
}

.app-table thead th.app-table__th--drop-after {
  box-shadow: inset -3px 0 0 var(--p-primary-color);
}

.app-table thead th.app-table__th--dragging {
  color: var(--p-text-muted-color);
}

.app-table--reordering,
.app-table--reordering :deep(*) {
  cursor: grabbing !important;
  user-select: none;
}

/* Beats the size padding: the wrapper is absolutely positioned and fills the cell. */
.app-table thead th.app-table__checkbox-th,
.app-table > :deep(tbody > * > td.app-table__checkbox-td) {
  position: relative;
  width: 2.5rem;
  padding: 0;
  text-align: center;
}

:deep(.app-table__checkbox-wrap) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

:deep(.app-table__checkbox-wrap:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

/* Same weight as `tr:hover td` and placed after it, so selection wins. */
.app-table > :deep(tbody > tr.app-table__row--selected > td) {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.app-table > :deep(tbody > tr.app-table__row--selected:hover > td) {
  background: color-mix(in srgb, var(--p-primary-color) 16%, transparent);
}

/* Fades back to the row's normal look, so only the class needs dropping. Same length as
   REVEAL_FLASH_MS. */
.app-table > :deep(tbody > tr.app-table__row--revealed > td) {
  animation: app-table-reveal 1.6s ease-out;
}

@keyframes app-table-reveal {
  from {
    background: color-mix(in srgb, var(--p-primary-color) 28%, transparent);
  }
}

.app-table__expander-th,
:deep(.app-table__expander-td) {
  width: 2.5rem;
  text-align: center;
}

:deep(.app-table__expander-icon) {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  transition: transform 0.15s;
}

/* Overlaid rather than in flow, so it does not change the header height as it toggles. */
.app-table__collapse-all {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  padding: 0;
  border: none;
  border-radius: var(--p-content-border-radius);
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.app-table__collapse-all:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.app-table__collapse-all:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

:deep(.app-table__expansion-row > td) {
  padding: 0;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-content-border-color);
}
</style>
