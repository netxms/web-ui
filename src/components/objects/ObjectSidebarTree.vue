<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import ProgressSpinner from 'primevue/progressspinner'
import ObjectTreeNode from './ObjectTreeNode.vue'
import ObjectIcon from './ObjectIcon.vue'
import ActionOverflowButton from '@/components/actions/ActionOverflowButton.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import { useStuckRowMarker } from '@/composables/useStuckRowMarker'
import { useTreeMultiSelect, rangeRowClass } from '@/composables/useTreeMultiSelect'
import { handleTreeRowKeydown } from '@/utils/treeKeyboard'
import { handleTreeRowDblClick } from '@/utils/treeExpand'
import { anchorEventAt } from '@/utils/menuAnchor'
import { getClassIconColor, getStatusInfo } from '@/utils/objectUtils'
import LoadingState from '@/components/common/LoadingState.vue'

const props = defineProps({
  /**
   * An array because one `role="tree"` may hold several trees and a range may span them.
   * `fallbackClass` stands in for the root's class while it loads; a root's own
   * `loading`/`error` covers a subtree fetched separately (a 403 there affects that branch only).
   * @type {import('vue').PropType<Array<{
   *   object: object|null, label: string, fallbackClass: string,
   *   nodes: Array<object>, emptyText?: string,
   *   loading?: boolean, error?: object|null
   * }>>}
   */
  roots: { type: Array, required: true },
  expandedIds: { type: Object, required: true },
  selectedPath: { type: String, default: null },
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  /** `(node) => RouteLocationRaw` */
  targetFor: { type: Function, default: null },
  rootTargetFor: { type: Function, default: null },
  /** `(path) => object|null` */
  resolvePath: { type: Function, required: true },
  /** `(object) => boolean`; a row it refuses has no overflow button and ignores right-click */
  hasMenu: { type: Function, default: null },
  /** `(object) => boolean`; with `canDrop`, the rows it accepts can be dragged */
  canDrag: { type: Function, default: null },
  /**
   * `({ rows, target, targetPath, copy }) => boolean`, rows being `{ object, path }`; `copy` is
   * Ctrl (Cmd) held. A drop it accepts is emitted as `drop` with the same argument.
   */
  canDrop: { type: Function, default: null },
})

/** Matches ObjectTreeNode; the stuck rows below stack under it. */
const ROOT_ROW_HEIGHT_REM = 2

const ROOT_CHILD_INDENT_REM = 0.5

const emit = defineEmits(['select', 'contextmenu', 'toggle', 'selection-change', 'retry', 'drop'])

const containerRef = ref(null)
const { navBindings } = useNavTarget()
useStuckRowMarker(containerRef)

// Shift+click anchor: `selectedPath` can lag a click by a navigation when derived from the route.
const lastClickedPath = ref(null)

const menuPath = ref(null)

const multiSelect = useTreeMultiSelect({
  containerRef,
  anchorFallback: () => lastClickedPath.value ?? props.selectedPath,
  onChange: (paths) => {
    emit('selection-change', paths ? paths.map(props.resolvePath).filter(Boolean) : [])
  },
})

function onSelect(node, path, event) {
  if (event?.shiftKey && path) {
    multiSelect.extendTo(path)
    return
  }
  multiSelect.reset()
  lastClickedPath.value = path
  emit('select', node, path, event)
}

// Inside a range the menu acts on the whole range; outside, it collapses it. Either way no row
// opens: selecting one navigates.
function onContextMenu(event, node, path) {
  if (props.hasMenu && !props.hasMenu(node)) return
  const range = multiSelect.selectedPaths.value
  if (range && !range.has(path)) multiSelect.reset()
  const stillRanged = multiSelect.selectedPaths.value
  const paths = stillRanged ? [...stillRanged] : [path]
  const selection = stillRanged ? paths.map(props.resolvePath).filter(Boolean) : undefined
  menuPath.value = path
  emit('contextmenu', event, node, { selection, path, paths })
}

// A collapsed row opens after the pointer rests on it this long during a drag.
const DRAG_EXPAND_DELAY_MS = 700
// Within this distance of the tree's top or bottom edge, a drag scrolls it.
const DRAG_SCROLL_EDGE_PX = 32
const DRAG_SCROLL_STEP_PX = 12

/** The rows being dragged, `{ object, path }` each; null when no drag started in this tree. */
const dragRows = ref(null)
const dropPath = ref(null)
let expandTimer = null
let expandPath = null

const rowOf = (event) => event.target.closest?.('.tree-node-row[data-path]') ?? null

function dropOf(event, row) {
  const targetPath = row?.dataset.path
  const target = targetPath ? props.resolvePath(targetPath) : null
  if (!target) return null
  return { rows: dragRows.value, target, targetPath, copy: event.ctrlKey || event.metaKey }
}

function scheduleExpand(row) {
  const path = row?.getAttribute('aria-expanded') === 'false' ? row.dataset.path : null
  if (path === expandPath) return
  clearTimeout(expandTimer)
  expandPath = path
  if (!path) return
  expandTimer = setTimeout(() => {
    expandPath = null
    if (!props.expandedIds.has(path)) emit('toggle', path)
  }, DRAG_EXPAND_DELAY_MS)
}

function endDrag() {
  dragRows.value = null
  dropPath.value = null
  scheduleExpand(null)
}

// Inside a range the whole range moves, as the menu acts on it; outside, only the row.
function onDragStart(event) {
  if (!props.canDrag || !props.canDrop) return
  const path = rowOf(event)?.dataset.path
  const range = multiSelect.selectedPaths.value
  const paths = path && range?.has(path) ? [...range] : [path]
  const rows = path ? paths.map((p) => ({ object: props.resolvePath(p), path: p })) : []
  if (!rows.length || !rows.every((row) => row.object && props.canDrag(row.object))) {
    event.preventDefault()
    return
  }
  dragRows.value = rows
  // A drag that starts on an icon image would otherwise carry the image's URL.
  event.dataTransfer.clearData()
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData('text/plain', rows.map((row) => row.object.name).join('\n'))
}

// On dragenter as well: a drop target is the row whose dragenter was cancelled, and the highlight
// should not wait for the first dragover.
function onDragHover(event) {
  if (!dragRows.value) return
  const el = containerRef.value
  const { top, bottom } = el.getBoundingClientRect()
  if (event.clientY < top + DRAG_SCROLL_EDGE_PX) el.scrollTop -= DRAG_SCROLL_STEP_PX
  else if (event.clientY > bottom - DRAG_SCROLL_EDGE_PX) el.scrollTop += DRAG_SCROLL_STEP_PX

  const row = rowOf(event)
  scheduleExpand(row)
  const drop = dropOf(event, row)
  if (!drop || !props.canDrop(drop)) {
    dropPath.value = null
    return
  }
  event.preventDefault()
  event.dataTransfer.dropEffect = drop.copy ? 'copy' : 'move'
  dropPath.value = drop.targetPath
}

// By position: Chrome has sent drag events without a relatedTarget.
function onDragLeave(event) {
  if (!dragRows.value) return
  const { left, right, top, bottom } = containerRef.value.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  if (x <= left || x >= right || y <= top || y >= bottom) {
    dropPath.value = null
    scheduleExpand(null)
  }
}

function onDrop(event) {
  if (!dragRows.value) return
  event.preventDefault()
  const drop = dropOf(event, rowOf(event))
  endDrag()
  if (drop && props.canDrop(drop)) emit('drop', drop)
}

onUnmounted(() => clearTimeout(expandTimer))

// Views also select programmatically (e.g. moving to the neighbour after a delete), which
// never goes through onSelect.
watch(
  () => props.selectedPath,
  () => multiSelect.reset(),
)

function isRowSelected(path) {
  const range = multiSelect.selectedPaths.value
  return range ? range.has(path) : props.selectedPath === path
}

function rootRangeClass(path) {
  return rangeRowClass(path, multiSelect.rangeEdges.value, isRowSelected(path))
}

function rootPath(root) {
  return String(root.object?.id)
}

function isNodePathRendered(nodes, ids) {
  let level = nodes
  let prefix = ''
  for (const [index, id] of ids.entries()) {
    const node = level?.find((candidate) => String(candidate.id) === id)
    if (!node) return false
    prefix = prefix ? `${prefix}-${id}` : id
    if (index === ids.length - 1) return true
    if (!props.expandedIds.has(prefix)) return false
    level = node.children
  }
  return false
}

function isPathRendered(path) {
  if (!path) return false
  return props.roots.some((root) => {
    if (path === rootPath(root)) return true
    if (!props.expandedIds.has(rootPath(root)) || root.loading || root.error) return false
    return isNodePathRendered(root.nodes, path.split('-'))
  })
}

// The single tab stop must sit on a rendered row, or Tab skips the whole tree when the
// selected row is collapsed away. The first root row is always rendered.
const tabStopPath = computed(() => {
  if (isPathRendered(props.selectedPath)) return props.selectedPath
  return props.roots.length ? rootPath(props.roots[0]) : null
})

function rootBindings(root) {
  return navBindings(
    root.object && props.rootTargetFor ? props.rootTargetFor(root.object) : null,
    (event) => {
      if (root.object) onSelect(root.object, rootPath(root), event)
    },
  )
}

function onRootKeydown(event, root) {
  const path = rootPath(root)
  handleTreeRowKeydown(event, {
    level: 1,
    hasChildren: true,
    expanded: props.expandedIds.has(path),
    toggle: () => emit('toggle', path),
  })
}

function onRootDblClick(event, root) {
  handleTreeRowDblClick(event, {
    hasChildren: true,
    toggle: () => emit('toggle', rootPath(root)),
  })
}

function onRootOverflowClick(event, root) {
  if (!root.object) return
  onContextMenu(anchorEventAt(event.currentTarget, event), root.object, rootPath(root))
}

function rootIconObject(root) {
  return root.object ?? { class: root.fallbackClass }
}
function rootColor(root) {
  return getClassIconColor(root.object?.class ?? root.fallbackClass)
}
function rootStatus(root) {
  return getStatusInfo(root.object?.status ?? 0)
}
function rootShowsStatusDot(root) {
  const status = root.object?.status
  return status != null && status !== 0 && status !== 6 && status !== 7
}

const isEmpty = computed(() =>
  props.roots.every((root) => !root.nodes?.length && !root.loading && !root.error),
)

const emptyText = computed(() => props.roots.find((root) => root.emptyText)?.emptyText ?? null)

defineExpose({
  reset: multiSelect.reset,
  /** The host owns the menu, so it reports when the menu closes. */
  clearMenuRow: () => {
    menuPath.value = null
  },
  focus: () => containerRef.value?.focus({ preventScroll: true }),
  containerRef,
})
</script>

<template>
  <div
    ref="containerRef"
    class="sidebar-tree"
    role="tree"
    aria-multiselectable="true"
    tabindex="-1"
    @keydown.capture="multiSelect.handleKeydownCapture"
    @keydown="multiSelect.handleKeydown"
    @dragstart="onDragStart"
    @dragenter="onDragHover"
    @dragover="onDragHover"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @dragend="endDrag"
  >
    <div v-if="loading" class="tree-loading">
      <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
    </div>
    <QueryErrorState v-else-if="error" :error="error" class="tree-error" @retry="emit('retry')" />
    <template v-else>
      <!-- Not role="group" (flat treeitem pattern); bounds the sticky root row to its branch. -->
      <div v-for="root in roots" :key="root.object?.id ?? root.label" class="root-branch">
        <!-- Focusable via the roving :tabindex, which the rule cannot evaluate. -->
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          class="tree-node-row root-tree-node"
          :class="[
            {
              selected: isRowSelected(rootPath(root)),
              'menu-target': menuPath === rootPath(root),
              'drop-target': dropPath === rootPath(root),
            },
            rootRangeClass(rootPath(root)),
          ]"
          v-bind="rootBindings(root)"
          :data-path="rootPath(root)"
          role="treeitem"
          aria-level="1"
          :aria-selected="isRowSelected(rootPath(root))"
          :aria-expanded="expandedIds.has(rootPath(root))"
          :aria-label="root.object?.name ?? root.label"
          :tabindex="rootPath(root) === tabStopPath ? 0 : -1"
          @dblclick="onRootDblClick($event, root)"
          @keydown="onRootKeydown($event, root)"
          @contextmenu.prevent="root.object && onContextMenu($event, root.object, rootPath(root))"
        >
          <!-- Decorative: the row carries aria-expanded and handles Arrow Left/Right. -->
          <span
            :class="expandedIds.has(rootPath(root)) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
            class="tree-toggle"
            aria-hidden="true"
            @click.stop="emit('toggle', rootPath(root))"
          />
          <ObjectIcon
            :object="rootIconObject(root)"
            class="tree-node-icon"
            :size="16"
            :style="{
              color: isRowSelected(rootPath(root))
                ? 'var(--p-primary-contrast-color)'
                : rootColor(root),
            }"
          />
          <span class="tree-node-label">{{ root.object?.name ?? root.label }}</span>
          <span
            v-if="rootShowsStatusDot(root)"
            class="tree-node-status"
            :style="{
              background: rootStatus(root).color,
              '--status-color': rootStatus(root).color,
            }"
          />
          <ActionOverflowButton
            v-if="!hasMenu || (root.object && hasMenu(root.object))"
            :tabindex="rootPath(root) === tabStopPath ? 0 : -1"
            class="tree-overflow-btn"
            @click.stop="onRootOverflowClick($event, root)"
          />
        </div>
        <template v-if="expandedIds.has(rootPath(root))">
          <LoadingState v-if="root.loading" compact class="tree-branch-loading" />
          <RestrictedState
            v-else-if="root.error?.status === 403"
            compact
            class="tree-branch-indent"
          />
          <div v-else-if="root.error" class="tree-branch-error tree-branch-indent">
            <i class="pi pi-exclamation-triangle" /> {{ root.error.message }}
          </div>
          <ObjectTreeNode
            v-for="node in root.nodes"
            v-else
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-path="selectedPath"
            :selected-paths="multiSelect.selectedPaths.value"
            :range-edges="multiSelect.rangeEdges.value"
            :menu-path="menuPath"
            :parent-path="''"
            :expanded-ids="expandedIds"
            :target-for="targetFor"
            :tab-stop-path="tabStopPath"
            :level-offset="1"
            :indent-offset="ROOT_CHILD_INDENT_REM"
            :sticky-offset="ROOT_ROW_HEIGHT_REM"
            :has-menu="hasMenu"
            :can-drag="canDrop ? canDrag : null"
            :drop-path="dropPath"
            @select="onSelect"
            @contextmenu="onContextMenu"
            @toggle="(path) => emit('toggle', path)"
          />
        </template>
      </div>
      <div v-if="isEmpty && emptyText" class="tree-empty">
        <i class="pi pi-objects-column" />
        <span>{{ emptyText }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sidebar-tree {
  flex: 1;
  overflow-y: auto;
  /* No top padding: sticky rows pin to the padding edge and rows would show through above. */
  padding: 0 0.5rem 0.5rem;
  font-size: 0.8125rem;
  /* Keeps the stuck rows below the sidebar's resize handle and collapse button. */
  isolation: isolate;
}

.sidebar-tree > :first-child {
  margin-top: 0.5rem;
}

/* Programmatic focus target only (F6 pane cycling); the rows hold the tab stop. */
.sidebar-tree:focus {
  outline: none;
}

/* Match ObjectTreeNode's .tree-node-row */
.tree-node-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.tree-node-row:hover {
  background: var(--p-surface-hover);
}

.tree-node-row.selected {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.root-tree-node {
  position: sticky;
  top: 0;
  z-index: 60;
  background: var(--p-surface-card);
  font-weight: 600;
  padding: 0.25rem;
  padding-right: 0.5rem;
}

.tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  /* As in ObjectTreeNode: clickable over the row's height, its left padding and the gap to the
     icon, with the layout unchanged. */
  width: calc(0.75rem + 0.625rem);
  padding: 0 0.375rem 0 0.25rem;
  margin: -0.25rem -0.375rem -0.25rem -0.25rem;
  font-size: 0.6rem;
  flex-shrink: 0;
  cursor: pointer;
}

.tree-node-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.tree-node-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-loading {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.tree-error {
  justify-content: center;
  padding: 2rem 1rem;
}

.tree-branch-loading,
.tree-branch-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.tree-branch-error {
  color: var(--p-red-500);
}

.tree-branch-indent,
.tree-branch-loading {
  padding-left: 2rem;
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.tree-empty i {
  font-size: 1.5rem;
  opacity: 0.4;
}

:deep(.tree-overflow-btn) {
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node-row:hover :deep(.tree-overflow-btn),
.tree-node-row:focus-within :deep(.tree-overflow-btn),
.tree-node-row.selected :deep(.tree-overflow-btn) {
  opacity: 1;
}
</style>
