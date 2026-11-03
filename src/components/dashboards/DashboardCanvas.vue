<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import Button from 'primevue/button'
import DashboardWidget from './DashboardWidget.vue'
import DashboardEmptyState from './DashboardEmptyState.vue'
import WidgetPropertiesDialog from './WidgetPropertiesDialog.vue'
import {
  widgetsToLayout,
  mergeLayout,
  computeRowTracks,
  hasContentSizedRows,
} from '@/utils/dashboardUtils'
import { createWidget, updateWidgetConfig } from '@/utils/dashboardAdapters'
import { getTypeDef } from '@/utils/dashboardElements'
import { getAddableTypeGroups } from './widgetRegistry'
import { provideEmbedGuard } from './widgets/embeddedDashboardContext'
import { provideDashboardContext, useDashboardContext } from '@/composables/useDashboardContext'

const ADDABLE_TYPE_GROUPS = getAddableTypeGroups()

const props = defineProps({
  dashboard: { type: Object, required: true },
  editMode: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  /** Legacy "context" object; null inherits the enclosing dashboard's. */
  contextObjectId: { type: Number, default: null },
})

// Lets nested Embedded Dashboard widgets detect a self-reference or cycle.
provideEmbedGuard(props.dashboard?.id ?? null)

// Read before providing: `inject` sees only the parent's provides, so an embedded canvas
// without its own context gets the parent's.
const parentContext = useDashboardContext()
provideDashboardContext({
  dashboardId: () => props.dashboard?.id ?? null,
  contextObjectId: () => props.contextObjectId ?? parentContext.contextObjectId.value,
})

const emit = defineEmits([
  'save',
  'discard',
  'refresh',
  'update:editMode',
  'open-properties',
  'open-tools-panel',
])

const localLayout = ref([])
const localWidgets = ref([])

watch(
  () => props.dashboard,
  (dash) => {
    if (!dash) return
    localWidgets.value = dash.widgets.map((w) => ({ ...w }))
    localLayout.value = widgetsToLayout(localWidgets.value)
  },
  { immediate: true },
)

function onLayoutUpdated(newLayout) {
  localWidgets.value = mergeLayout(localWidgets.value, newLayout)
  localLayout.value = newLayout
}

const showAddPanel = ref(false)

function addWidget(type) {
  const maxY = localWidgets.value.reduce((acc, w) => Math.max(acc, w.y + w.h), 0)
  const widget = createWidget(type, maxY)
  localWidgets.value = [...localWidgets.value, widget]
  localLayout.value = widgetsToLayout(localWidgets.value)
  showAddPanel.value = false
}

function addWidgetFromEmptyState(type) {
  if (!props.editMode) emit('update:editMode', true)
  addWidget(type)
}

function removeWidget(widgetId) {
  localWidgets.value = localWidgets.value.filter((w) => String(w.id) !== String(widgetId))
  localLayout.value = widgetsToLayout(localWidgets.value)
}

const editingWidgetId = ref(null)

const editingWidget = computed(() =>
  editingWidgetId.value
    ? (localWidgets.value.find((w) => String(w.id) === String(editingWidgetId.value)) ?? null)
    : null,
)

function openWidgetSettings(widgetId) {
  editingWidgetId.value = widgetId
}

/** A widget's own controls changed its config while editing (see useWidgetEditing). */
function handleWidgetConfigPatch(widgetId, patch) {
  localWidgets.value = localWidgets.value.map((w) =>
    String(w.id) === String(widgetId)
      ? updateWidgetConfig(w, { config: { ...w.config, ...patch } })
      : w,
  )
}

function handleWidgetConfigSave(payload) {
  localWidgets.value = localWidgets.value.map((w) =>
    String(w.id) === String(editingWidgetId.value) ? updateWidgetConfig(w, payload) : w,
  )
  editingWidgetId.value = null
}

function handleSave() {
  emit('save', localWidgets.value)
}

function handleDiscard() {
  localWidgets.value = props.dashboard.widgets.map((w) => ({ ...w }))
  localLayout.value = widgetsToLayout(localWidgets.value)
  emit('discard')
}

const cols = computed(() => props.dashboard?.cols ?? 12)

// Rows stretch to fill the available area.

const GRID_MARGIN = 8 // must match :margin="[8, 8]" in template
const GRID_PADDING = 8 // .grid-area padding: 0.5rem on each side
const MIN_ROW_HEIGHT = 60

const gridAreaRef = ref(null)
const gridAreaHeight = ref(0)
const gridAreaWidth = ref(0)

let resizeObserver = null

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    gridAreaHeight.value = entries[0].contentRect.height
    gridAreaWidth.value = entries[0].contentRect.width
  })
  if (gridAreaRef.value) resizeObserver.observe(gridAreaRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearTimeout(settleTimer)
})

const numRows = computed(() => {
  if (!localLayout.value.length) return 1
  return Math.max(...localLayout.value.map((item) => item.y + item.h))
})

// Fills the grid area exactly before the MIN_ROW_HEIGHT floor; null until measured.
// numRows * (rowHeight + GRID_MARGIN) = availableHeight
const fitRowHeight = computed(() => {
  const available = gridAreaHeight.value - GRID_PADDING * 2
  if (available <= 0) return null
  return Math.floor(available / numRows.value) - GRID_MARGIN
})

const rowHeight = computed(() => {
  if (props.dashboard?.scrollable) return props.dashboard?.rowHeight ?? 80
  if (fitRowHeight.value === null) return props.dashboard?.rowHeight ?? 80
  return Math.max(MIN_ROW_HEIGHT, fitRowHeight.value)
})

const widgetMap = computed(() =>
  Object.fromEntries(localWidgets.value.map((w) => [String(w.id), w])),
)

// Below this width, widgets stack in one column (view mode only; editing needs the grid).

const NARROW_BREAKPOINT = 700

const isNarrowScreen = computed(
  () => !props.editMode && gridAreaWidth.value > 0 && gridAreaWidth.value < NARROW_BREAKPOINT,
)

const narrowWidgets = computed(() => {
  const baseRowHeight = props.dashboard?.rowHeight ?? 80
  return localWidgets.value
    .filter((w) => w.raw?.layout?.showInNarrowScreenMode !== false)
    .map((w) => {
      const heightHint = w.raw?.layout?.narrowScreenHeightHint
      return {
        widget: w,
        order: w.raw?.layout?.narrowScreenOrder ?? 255,
        height: heightHint > 0 ? heightHint : w.h * baseRowHeight,
      }
    })
    .sort((a, b) => a.order - b.order)
})

// View mode renders a plain CSS grid: grid-layout-plus has one uniform rowHeight and would
// stretch non-grabbing elements such as a title label. Edit mode needs grid-layout-plus, so rows
// even out there; reflowNotice and the settle animation say that this is deliberate.
const isStaticLayout = computed(() => !props.editMode && !isNarrowScreen.value)

const isInlineWidget = (widget) => getTypeDef(widget.type).inline === true

const rowTracks = computed(() =>
  computeRowTracks(localWidgets.value, isInlineWidget, {
    scrollable: props.dashboard?.scrollable === true,
    rowHeight: props.dashboard?.rowHeight ?? 80,
  }),
)

const staticGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))`,
  gridTemplateRows: rowTracks.value.join(' '),
  gap: `${GRID_MARGIN}px`,
  // Non-scrollable boards fill the area so the 1fr rows have a definite height to share.
  height: props.dashboard?.scrollable ? undefined : '100%',
}))

function staticItemStyle(widget) {
  return {
    gridColumn: `${widget.x + 1} / span ${widget.w}`,
    gridRow: `${widget.y + 1} / span ${widget.h}`,
  }
}

// Only boards that actually reflow: when every element grabs vertical space, both engines agree.
const reflowNotice = computed(
  () => props.editMode && !isNarrowScreen.value && hasContentSizedRows(rowTracks.value),
)

// Edit mode always scrolls, or a widget grown past the fold would hide its own resize handle.
const overflowNotice = computed(
  () =>
    props.editMode &&
    !props.dashboard?.scrollable &&
    fitRowHeight.value !== null &&
    fitRowHeight.value < MIN_ROW_HEIGHT,
)

// Only on a user's mode switch, not on first render or between dashboards.
const SETTLE_MS = 200
const modeSwitching = ref(false)
let settleTimer = null

watch(
  () => props.editMode,
  (editing) => {
    // A panel left open in view mode would add widgets that cannot be saved.
    if (!editing) showAddPanel.value = false
    modeSwitching.value = true
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      modeSwitching.value = false
    }, SETTLE_MS)
  },
)
</script>

<template>
  <div class="dashboard-canvas">
    <div v-if="!embedded" class="canvas-toolbar">
      <span class="dashboard-name">{{ dashboard.name }}</span>
      <div class="toolbar-spacer" />

      <template v-if="editMode">
        <Button
          label="Add Widget"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          @click="showAddPanel = !showAddPanel"
        />
        <Button label="Save" icon="pi pi-check" size="small" @click="handleSave" />
        <Button
          label="Discard"
          icon="pi pi-times"
          size="small"
          text
          severity="secondary"
          @click="handleDiscard"
        />
      </template>
      <template v-else>
        <Button
          label="Edit"
          icon="pi pi-pencil"
          size="small"
          severity="secondary"
          @click="emit('update:editMode', true)"
        />
      </template>
      <Button
        icon="pi pi-cog"
        size="small"
        severity="secondary"
        text
        v-tooltip.bottom="'Dashboard Properties'"
        aria-label="Dashboard Properties"
        @click="emit('open-properties')"
      />
      <div class="toolbar-tool-divider" />
      <Button
        icon="pi pi-chart-line"
        size="small"
        severity="secondary"
        text
        v-tooltip.bottom="'Polls'"
        aria-label="Polls"
        @click="emit('open-tools-panel', 'polls')"
      />
      <Button
        icon="pi pi-code"
        size="small"
        severity="secondary"
        text
        v-tooltip.bottom="'Execute Script'"
        aria-label="Execute Script"
        @click="emit('open-tools-panel', 'script')"
      />
      <Button
        icon="pi pi-list"
        size="small"
        severity="secondary"
        text
        v-tooltip.bottom="'Logs'"
        aria-label="Logs"
        @click="emit('open-tools-panel', 'logs')"
      />
      <div class="toolbar-tool-divider" />
      <Button
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        v-tooltip.bottom="'Refresh'"
        aria-label="Refresh"
        @click="emit('refresh')"
      />
    </div>

    <div v-if="reflowNotice" class="reflow-notice">
      <i class="pi pi-info-circle" />
      <span>
        Rows are evenly sized while editing. The saved dashboard sizes each row to its content, so
        heights change again when you leave edit mode.
      </span>
    </div>

    <div v-if="overflowNotice" class="reflow-notice overflow-notice">
      <i class="pi pi-exclamation-triangle" />
      <span>
        This dashboard is taller than the screen, so widgets below the fold are cut off when
        viewing. Shrink them, or turn on Scrollable Content in Properties &gt; Elements.
      </span>
    </div>

    <Transition name="add-panel">
      <div v-if="showAddPanel" class="add-widget-panel">
        <div class="add-panel-header">
          <span class="add-panel-title">Add Widget</span>
          <button class="add-panel-close" @click="showAddPanel = false">
            <i class="pi pi-times" />
          </button>
        </div>
        <div v-for="group in ADDABLE_TYPE_GROUPS" :key="group.group" class="add-widget-group">
          <span class="add-group-label">{{ group.group }}</span>
          <button
            v-for="t in group.types"
            :key="t.key"
            class="add-widget-btn"
            @click="addWidget(t.key)"
          >
            <i :class="t.icon" />
            {{ t.label }}
          </button>
        </div>
      </div>
    </Transition>

    <div
      ref="gridAreaRef"
      class="grid-area"
      :class="{ 'grid-area--scrollable': dashboard.scrollable || isNarrowScreen || editMode }"
    >
      <DashboardEmptyState v-if="!localWidgets.length" @add="addWidgetFromEmptyState" />

      <div v-else-if="isNarrowScreen" class="narrow-stack">
        <div
          v-for="{ widget, height } in narrowWidgets"
          :key="widget.id"
          class="narrow-item"
          :style="{ height: height + 'px' }"
        >
          <DashboardWidget :widget="widget" :edit-mode="false" />
        </div>
      </div>

      <!-- View mode: CSS grid with per-row heights (see isStaticLayout) -->
      <div
        v-else-if="isStaticLayout"
        class="static-grid"
        :class="{ 'grid-settle': modeSwitching }"
        :style="staticGridStyle"
      >
        <div
          v-for="w in localWidgets"
          :key="w.id"
          class="static-grid-item"
          :style="staticItemStyle(w)"
        >
          <DashboardWidget :widget="w" :edit-mode="false" />
        </div>
      </div>

      <GridLayout
        v-else
        :class="{ 'grid-settle': modeSwitching }"
        v-model:layout="localLayout"
        :col-num="cols"
        :row-height="rowHeight"
        :is-draggable="editMode"
        :is-resizable="editMode"
        :margin="[8, 8]"
        :use-css-transforms="true"
        @layout-updated="onLayoutUpdated"
      >
        <GridItem
          v-for="item in localLayout"
          :key="item.i"
          :i="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :drag-allow-from="editMode ? '.drag-handle' : undefined"
        >
          <DashboardWidget
            v-if="widgetMap[item.i]"
            :widget="widgetMap[item.i]"
            :edit-mode="editMode"
            @remove="removeWidget"
            @settings="openWidgetSettings"
            @update-config="handleWidgetConfigPatch"
          />
        </GridItem>
      </GridLayout>
    </div>
  </div>

  <WidgetPropertiesDialog
    :visible="!!editingWidgetId"
    :widget="editingWidget"
    @update:visible="
      (v) => {
        if (!v) editingWidgetId = null
      }
    "
    @save="handleWidgetConfigSave"
  />
</template>

<style scoped>
.dashboard-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.dashboard-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-tool-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.125rem;
  flex-shrink: 0;
}

.add-widget-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: color-mix(in srgb, var(--p-primary-color) 5%, var(--p-surface-ground));
  flex-shrink: 0;
  max-height: 40%;
  overflow-y: auto;
}

.add-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.add-panel-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.add-widget-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.add-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 4.5rem;
  flex-shrink: 0;
  text-align: right;
  padding-right: 0.25rem;
}

.add-widget-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 5px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
  font-family: inherit;
}

.add-widget-btn:hover {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-surface-card));
  color: var(--p-primary-color);
}

.add-widget-btn i {
  font-size: 0.8125rem;
}

.add-panel-close {
  display: flex;
  align-items: center;
  padding: 0.25rem;
  border: none;
  background: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
  border-radius: 4px;
}

.add-panel-close:hover {
  color: var(--p-text-color);
  background: var(--p-surface-hover);
}

.add-panel-enter-active,
.add-panel-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.add-panel-enter-from,
.add-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.grid-area {
  flex: 1;
  overflow: hidden;
  padding: 0.5rem;
}

.grid-area--scrollable {
  overflow-y: auto;
}

.reflow-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-surface-ground));
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.reflow-notice .pi {
  font-size: 0.8125rem;
  color: var(--p-primary-color);
  flex-shrink: 0;
}

.overflow-notice {
  background: color-mix(in srgb, var(--p-yellow-500) 8%, var(--p-surface-ground));
}

.overflow-notice .pi {
  color: var(--p-yellow-600);
}

/* The incoming layout engine mounts fresh; fading it in makes the row change read as
   deliberate rather than as a flicker. */
.grid-settle {
  animation: grid-settle 200ms ease-out;
}

@keyframes grid-settle {
  from {
    opacity: 0.4;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .grid-settle {
    animation: none;
  }
}

.static-grid {
  display: grid;
  width: 100%;
}

.static-grid-item {
  /* Grid items default to min-height:auto, letting a chart push a row past its track. */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.narrow-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.narrow-item {
  flex-shrink: 0;
}

:deep(.vgl-item--placeholder) {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent) !important;
  border: 2px dashed var(--p-primary-color) !important;
  border-radius: 8px;
  z-index: 2;
}

:deep(.vgl-item) {
  touch-action: none;
}
</style>
