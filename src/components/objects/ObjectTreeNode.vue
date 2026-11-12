<script setup>
import { computed } from 'vue'
import { Ban, Wrench } from 'lucide-vue-next'
import ActionOverflowButton from '@/components/actions/ActionOverflowButton.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { getClassIconColor, getStatusInfo } from '@/utils/objectUtils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useNavTarget } from '@/composables/useNavTarget'
import { handleTreeRowKeydown } from '@/utils/treeKeyboard'
import { handleTreeRowDblClick } from '@/utils/treeExpand'
import { anchorEventAt } from '@/utils/menuAnchor'
import { rangeRowClass } from '@/composables/useTreeMultiSelect'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  selectedPath: { type: String, default: null },
  /** Set<string>; takes precedence over selectedPath. */
  selectedPaths: { type: Object, default: null },
  /** @type {import('vue').PropType<{ first: string, last: string }|null>} */
  rangeEdges: { type: Object, default: null },
  /** The row whose context menu is open. */
  menuPath: { type: String, default: null },
  parentPath: { type: String, default: '' },
  expandedIds: { type: Object, required: true },
  /**
   * Opt-in: pickers leave it unset, since Ctrl already means multi-select there.
   * @type {import('vue').PropType<(node: object) => object>}
   */
  targetFor: { type: Function, default: null },
  /** Set by a host tree that decides the tab stop itself; otherwise the local rule applies. */
  tabStopPath: { type: String, default: undefined },
  /** Added to `aria-level` when the host draws its own root row above depth 0. */
  levelOffset: { type: Number, default: 0 },
  /** Extra left indent (rem) on top of the per-depth step. */
  indentOffset: { type: Number, default: 0 },
  /** Height (rem) of the rows stuck above depth 0; `null` for a tree whose rows do not stick. */
  stickyOffset: { type: Number, default: null },
  /** `(node) => boolean`; a row it refuses has no overflow button */
  hasMenu: { type: Function, default: null },
  /** `(node) => boolean`; the host tree handles the drag events */
  canDrag: { type: Function, default: null },
  /** The row a drag would drop onto. */
  dropPath: { type: String, default: null },
})

const emit = defineEmits(['select', 'contextmenu', 'toggle'])

const sidebarStore = useSidebarStore()
const showAlias = computed(() => sidebarStore.showAliases && !!props.node.alias)

const nodePath = computed(() =>
  props.parentPath ? `${props.parentPath}-${props.node.id}` : String(props.node.id),
)
const expanded = computed(() => props.expandedIds.has(nodePath.value))
const isSelected = computed(() =>
  props.selectedPaths
    ? props.selectedPaths.has(nodePath.value)
    : props.selectedPath === nodePath.value,
)
const rangeClass = computed(() => rangeRowClass(nodePath.value, props.rangeEdges, isSelected.value))
const isUnmanaged = computed(() => props.node.status === 6)
const isInMaintenance = computed(() => props.node.isInMaintenanceMode ?? false)
const nodeIconColor = computed(() =>
  isUnmanaged.value ? 'var(--p-surface-400)' : getClassIconColor(props.node.class),
)
const statusInfo = computed(() => getStatusInfo(props.node.status))
const showStatusDot = computed(() => {
  const s = props.node.status
  return !isSelected.value && s !== 0 && s !== 6 && s !== 7
})

const hasChildren = computed(() => props.node.children?.length > 0)

// Overflow button plus row padding; must match the row styles.
const ROW_HEIGHT_REM = 2

/** Left edges (rem), one per ancestor, under that ancestor's chevron. */
const guideOffsets = computed(() => {
  const guides = props.indentOffset > 0 ? [0.625] : []
  for (let d = 0; d < props.depth; d++) guides.push(d + 0.625 + props.indentOffset)
  return guides
})

const rowStyle = computed(() => {
  const style = { paddingLeft: `${props.depth + 0.25 + props.indentOffset}rem` }
  if (props.stickyOffset != null) {
    const top = `${props.stickyOffset + props.depth * ROW_HEIGHT_REM}rem`
    style.top = top
    // Keyboard focus and scroll-into-view must not park a row under its own stuck ancestors.
    style.scrollMarginTop = top
    // Shallower rows paint over deeper ones, so a subtree ending slides under its parent.
    style.zIndex = Math.max(1, 50 - props.depth)
  }
  return style
})

function toggle(event) {
  event.stopPropagation()
  emit('toggle', nodePath.value)
}

const { navBindings } = useNavTarget()
const rowBindings = computed(() => navBindings(props.targetFor?.(props.node) ?? null, handleClick))

// ARIA flat tree pattern (`aria-level`, no `role="group"`): a row is never a DOM ancestor
// of its children.

// Explicit, so the name does not absorb the status dot and the overflow button.
const ariaLabel = computed(() =>
  showAlias.value ? `${props.node.name} (${props.node.alias})` : props.node.name,
)

const ariaLevel = computed(() => props.depth + 1 + props.levelOffset)

const hasSelection = computed(() =>
  props.selectedPaths ? props.selectedPaths.size > 0 : props.selectedPath != null,
)

// Only one row of a range may own the tab stop: the open object when there is one.
const isLead = computed(() =>
  props.selectedPath == null ? isSelected.value : props.selectedPath === nodePath.value,
)

// Roving tabindex; with nothing selected the roots are tab stops.
const rowTabIndex = computed(() => {
  if (props.tabStopPath !== undefined) return props.tabStopPath === nodePath.value ? 0 : -1
  if (isLead.value) return 0
  return hasSelection.value || props.depth > 0 ? -1 : 0
})

function handleKeydown(event) {
  handleTreeRowKeydown(event, {
    level: ariaLevel.value,
    hasChildren: hasChildren.value,
    expanded: expanded.value,
    toggle: () => emit('toggle', nodePath.value),
  })
}

function handleClick(event) {
  emit('select', props.node, nodePath.value, event)
}

function handleDblClick(event) {
  handleTreeRowDblClick(event, {
    hasChildren: hasChildren.value,
    toggle: () => emit('toggle', nodePath.value),
  })
}

function handleContextMenu(event) {
  event.preventDefault()
  emit('contextmenu', event, props.node, nodePath.value)
}

function handleOverflowClick(event) {
  emit('contextmenu', anchorEventAt(event.currentTarget, event), props.node, nodePath.value)
}
</script>

<template>
  <div class="tree-node">
    <!-- Focusable via the roving :tabindex, which the rule cannot evaluate. -->
    <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
    <div
      class="tree-node-row"
      :class="[
        {
          selected: isSelected,
          sticky: stickyOffset != null,
          'menu-target': menuPath === nodePath,
          'drop-target': dropPath === nodePath,
        },
        rangeClass,
      ]"
      :style="rowStyle"
      v-bind="rowBindings"
      :draggable="canDrag?.(node) ? 'true' : undefined"
      :data-path="nodePath"
      role="treeitem"
      :aria-level="ariaLevel"
      :aria-selected="isSelected"
      :aria-expanded="hasChildren ? expanded : undefined"
      :aria-label="ariaLabel"
      :tabindex="rowTabIndex"
      @dblclick="handleDblClick"
      @contextmenu="handleContextMenu"
      @keydown="handleKeydown"
    >
      <span
        v-for="(left, index) in guideOffsets"
        :key="index"
        class="tree-indent-guide"
        :style="{ left: `${left}rem` }"
      />
      <!-- Decorative: the row carries aria-expanded and handles Arrow Left/Right. -->
      <span
        v-if="hasChildren"
        :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
        class="tree-toggle"
        aria-hidden="true"
        @click="toggle"
      />
      <span v-else class="tree-toggle" aria-hidden="true" />
      <span class="tree-node-icon-wrapper">
        <ObjectIcon
          :object="node"
          class="tree-node-icon"
          :size="16"
          :inactive="isUnmanaged"
          :style="{ color: isSelected ? 'var(--p-primary-contrast-color)' : nodeIconColor }"
        />
        <Ban v-if="isUnmanaged" class="tree-node-unmanaged-badge" :size="9" :stroke-width="2.5" />
        <Wrench
          v-if="isInMaintenance"
          v-tooltip.right="'In maintenance mode'"
          class="tree-node-maintenance-badge"
          :size="9"
          :stroke-width="2.5"
        />
      </span>
      <span class="tree-node-label"
        >{{ node.name
        }}<span v-if="showAlias" class="tree-node-alias"> ({{ node.alias }})</span></span
      >
      <span
        v-if="showStatusDot"
        class="tree-node-status"
        :style="{ background: statusInfo.color, '--status-color': statusInfo.color }"
      />
      <!-- Follows the row's roving tabindex rather than adding a tab stop per row. -->
      <ActionOverflowButton
        v-if="!hasMenu || hasMenu(node)"
        class="tree-overflow-btn"
        :tabindex="rowTabIndex"
        @click="handleOverflowClick"
      />
    </div>
    <template v-if="hasChildren && expanded">
      <ObjectTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        :selected-paths="selectedPaths"
        :range-edges="rangeEdges"
        :menu-path="menuPath"
        :parent-path="nodePath"
        :expanded-ids="expandedIds"
        :target-for="targetFor"
        :tab-stop-path="tabStopPath"
        :level-offset="levelOffset"
        :indent-offset="indentOffset"
        :sticky-offset="stickyOffset"
        :has-menu="hasMenu"
        :can-drag="canDrag"
        :drop-path="dropPath"
        @select="(n, p, e) => emit('select', n, p, e)"
        @contextmenu="(e, n, p) => emit('contextmenu', e, n, p)"
        @toggle="(path) => emit('toggle', path)"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-node-row {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.tree-node-row.sticky {
  position: sticky;
  background: var(--p-surface-card);
}

.tree-node-row:hover {
  background: var(--p-surface-hover);
}

.tree-node-row.selected {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  /* The 0.75rem chevron column, clickable over the row's height, its left padding and the
     gap to the icon: padding grows the box, equal negative margins keep the layout. */
  width: calc(0.75rem + 0.625rem);
  padding: 0 0.375rem 0 0.25rem;
  margin: -0.25rem -0.375rem -0.25rem -0.25rem;
  font-size: 0.5rem;
  flex-shrink: 0;
  cursor: pointer;
}

.tree-node-icon-wrapper {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.tree-node-icon {
  width: 1.2rem;
  height: 1.2rem;
  flex-shrink: 0;
}

.tree-node-unmanaged-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  color: #ffffff;
  background: var(--p-surface-400);
  border-radius: 50%;
  padding: 1px;
  box-sizing: content-box;
}

.tree-node-maintenance-badge {
  position: absolute;
  right: -3px;
  top: -3px;
  color: #ffffff;
  background: var(--p-orange-500);
  border-radius: 50%;
  padding: 1px;
  box-sizing: content-box;
}

.tree-node-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node-alias {
  color: var(--p-text-muted-color);
}

.tree-node-row.selected .tree-node-alias {
  color: var(--p-primary-contrast-color);
  opacity: 0.8;
}

.tree-indent-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--p-surface-border);
  pointer-events: none;
  z-index: -1;
}

/* The row is its own stacking context, so the guides would paint over the accent fill. */
.tree-node-row.selected .tree-indent-guide {
  display: none;
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
