<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import { useTabOverflow } from '@/composables/useTabOverflow'
import { anchorEventAt } from '@/utils/menuAnchor'

const props = defineProps({
  /**
   * All available views (flat array). `closable: false` marks a tab that comes and goes with
   * the object; `lockable: false` one that can be closed but not locked (the chart tab). A
   * nonzero `badge` shows beside the label.
   * @type {Array<{ id: string, label: string, icon?: string, closable?: boolean,
   *   lockable?: boolean, badge?: number }>}
   */
  views: {
    type: Array,
    required: true,
  },
  visibleViewIds: {
    type: Array,
    default: () => [],
  },
  activeView: {
    type: String,
    default: null,
  },
  /** @type {Array<{ id: string, label: string, icon: string, status: string, closeTitle?: string }>} */
  toolTabs: {
    type: Array,
    default: () => [],
  },
  activeToolTab: {
    type: String,
    default: null,
  },
  /** Also enables locking: a bar whose tabs cannot be closed has nothing to lock. */
  allowAddRemove: {
    type: Boolean,
    default: true,
  },
  lockedViewIds: {
    type: Array,
    default: () => [],
  },
  /** Tabs held at the front by the host: they cannot be dragged, nor another dropped on them. */
  pinnedViewIds: {
    type: Array,
    default: () => [],
  },
  /** How many more views the [+] button can add; shown on the button. */
  addableCount: {
    type: Number,
    default: 0,
  },
  /**
   * Enables ctrl/middle-click "open in new tab"; without it the bar only emits `select`.
   * @type {import('vue').PropType<(viewId: string) => object>}
   */
  targetFor: {
    type: Function,
    default: null,
  },
  /** @type {import('vue').PropType<(toolId: string) => object>} */
  toolTargetFor: {
    type: Function,
    default: null,
  },
})

const emit = defineEmits([
  'select',
  'close',
  'add',
  'refresh',
  'reorder',
  'select-tool-tab',
  'close-tool-tab',
  'toggle-lock',
])

const tabViews = computed(() => {
  return props.visibleViewIds.map((id) => props.views.find((v) => v.id === id)).filter(Boolean)
})

const { navBindings } = useNavTarget()

function tabBindings(viewId) {
  return navBindings(props.targetFor?.(viewId) ?? null, () => emit('select', viewId))
}

function handleCloseTab(event, viewId) {
  event.stopPropagation()
  emit('close', viewId)
}

function toolTabBindings(executionId) {
  return navBindings(props.toolTargetFor?.(executionId) ?? null, () =>
    emit('select-tool-tab', executionId),
  )
}

function handleCloseToolTab(event, executionId) {
  event.stopPropagation()
  emit('close-tool-tab', executionId)
}

// Roving tabindex: one tab stop for the whole bar (view and tool tabs), arrows move within it.
// `navBindings` alone would give every tab tabindex 0.

const tabBarRef = ref(null)
const focusedTabKey = ref(null)

function toolKey(executionId) {
  return `tool:${executionId}`
}

/** Tab keys in DOM order — view tabs first, then tool tabs. */
const tabSequence = computed(() => [
  ...tabViews.value.map((view) => view.id),
  ...props.toolTabs.map((tab) => toolKey(tab.id)),
])

const rovingTabKey = computed(() => {
  const sequence = tabSequence.value
  const candidates = [
    focusedTabKey.value,
    props.activeToolTab ? toolKey(props.activeToolTab) : null,
    props.activeView,
  ]
  return candidates.find((key) => key && sequence.includes(key)) ?? sequence[0] ?? null
})

function tabIndexFor(key) {
  return key === rovingTabKey.value ? 0 : -1
}

function focusTabAt(index) {
  const key = tabSequence.value[index]
  if (!key) return
  focusedTabKey.value = key
  // The tabindex swap has to land in the DOM before the tab can take focus.
  nextTick(() => tabBarRef.value?.querySelectorAll('.view-tab')[index]?.focus())
}

/** Arrows move focus without switching views: activating a view refetches it. */
function onTabKeydown(event, key) {
  const sequence = tabSequence.value
  const index = sequence.indexOf(key)
  if (index === -1) return

  if (event.key === 'Delete' || event.key === 'Backspace') {
    closeTabAt(event, index)
    return
  }

  // Some browsers also fire `contextmenu` for these keys; it lands on the same anchor.
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    if (!canLock(key)) return
    event.preventDefault()
    openTabMenu(anchorEventAt(event.currentTarget, event), key, true)
    return
  }

  // Keep Up/Down from scrolling the page out from under the focused tab.
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    return
  }

  let next
  if (event.key === 'ArrowRight') next = (index + 1) % sequence.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + sequence.length) % sequence.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = sequence.length - 1
  else return

  event.preventDefault()
  focusTabAt(next)
}

function closeTabAt(event, index) {
  const key = tabSequence.value[index]
  const toolId = key.startsWith('tool:') ? key.slice('tool:'.length) : null
  if (!toolId && !props.allowAddRemove) return
  if (!toolId && tabByKey.value.get(key)?.closable === false) return
  if (!toolId && isLocked(key)) return

  event.preventDefault()
  if (toolId) emit('close-tool-tab', toolId)
  else emit('close', key)

  // Keep the tab stop on the row: the tab that slid into this slot, or the new last one.
  nextTick(() => focusTabAt(Math.min(index, tabSequence.value.length - 1)))
}

// The tab menu only holds lock/close, so tabs that cannot lock open none.

const LOCKED_HINT = 'Locked. Right-click to unlock.'

/** Tool tabs and derived tabs (chart, context views) do not lock. */
function canLock(viewId) {
  if (!props.allowAddRemove) return false
  const view = tabViews.value.find((v) => v.id === viewId)
  return !!view && view.closable !== false && view.lockable !== false
}

function isLocked(viewId) {
  return canLock(viewId) && props.lockedViewIds.includes(viewId)
}

const tabMenuRef = ref(null)

const tabMenuItems = computed(() => {
  const viewId = tabMenuRef.value?.contextData
  if (!viewId) return []
  const locked = isLocked(viewId)
  return [
    {
      label: locked ? 'Unlock tab' : 'Lock tab',
      icon: locked ? 'pi pi-lock-open' : 'pi pi-lock',
      command: () => emit('toggle-lock', viewId),
    },
    {
      label: 'Close',
      icon: 'pi pi-times',
      disabled: locked,
      command: () => emit('close', viewId),
    },
  ]
})

/** Where focus goes back to when a menu opened from the keyboard closes. */
let menuReturnIndex = null

function openTabMenu(event, viewId, fromKeyboard) {
  menuReturnIndex = fromKeyboard ? tabSequence.value.indexOf(viewId) : null
  tabMenuRef.value?.show(event, viewId)
}

/** A keyboard-fired `contextmenu` (button !== 2) has no useful position: anchor under the tab. */
function onTabContextMenu(event, viewId) {
  if (!canLock(viewId)) return
  if (event.button === 2) openTabMenu(event, viewId, false)
  else openTabMenu(anchorEventAt(event.currentTarget, event), viewId, true)
}

/** The menu does not return focus on close; skip if an outside click already moved it. */
function onTabMenuHide() {
  const index = menuReturnIndex
  menuReturnIndex = null
  if (index === null || index === -1) return
  const focused = document.activeElement
  if (focused && focused !== document.body && !focused.closest('.p-contextmenu')) return
  nextTick(() => focusTabAt(Math.min(index, tabSequence.value.length - 1)))
}

const scrollRef = ref(null)
const activeTabKey = computed(() =>
  props.activeToolTab ? toolKey(props.activeToolTab) : props.activeView,
)
const { canScrollLeft, canScrollRight, hiddenKeys, activeSide, scrollKeyIntoView } = useTabOverflow(
  scrollRef,
  tabSequence,
  activeTabKey,
)

const tabByKey = computed(() => {
  const byKey = new Map()
  for (const view of tabViews.value) byKey.set(view.id, view)
  for (const tab of props.toolTabs) byKey.set(toolKey(tab.id), tab)
  return byKey
})

const overflowMenuRef = ref(null)

const overflowMenuItems = computed(() => {
  const items = []
  hiddenKeys.value.forEach((key, index) => {
    // Hidden keys arrive in tab order, so tool tabs are already grouped at the end.
    const isTool = key.startsWith('tool:')
    if (isTool && index > 0 && !hiddenKeys.value[index - 1].startsWith('tool:')) {
      items.push({ separator: true })
    }
    const tab = tabByKey.value.get(key)
    items.push({
      label: tab?.label ?? key,
      icon: tab?.icon,
      command: () => activateTabKey(key),
    })
  })
  return items
})

function activateTabKey(key) {
  scrollKeyIntoView(key)
  if (key.startsWith('tool:')) emit('select-tool-tab', key.slice('tool:'.length))
  else emit('select', key)
}

// Views are also activated from outside the bar (routing, the [+] menu, closing a tab).
watch(activeTabKey, (key) => scrollKeyIntoView(key), { flush: 'post' })
onMounted(() => nextTick(() => scrollKeyIntoView(activeTabKey.value)))

const activeTab = computed(() => tabByKey.value.get(activeTabKey.value) ?? null)

const draggedId = ref(null)
const dropTargetId = ref(null)

function onDragStart(event, viewId) {
  if (props.pinnedViewIds.includes(viewId)) {
    event.preventDefault()
    return
  }
  draggedId.value = viewId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', viewId)
  event.currentTarget.classList.add('dragging')
}

function onDragOver(event, viewId) {
  if (draggedId.value === null || draggedId.value === viewId) return
  if (props.pinnedViewIds.includes(viewId)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTargetId.value = viewId
}

function onDragLeave(event, viewId) {
  if (dropTargetId.value === viewId) {
    dropTargetId.value = null
  }
}

function onDrop(event, viewId) {
  event.preventDefault()
  if (draggedId.value === null || draggedId.value === viewId) return
  if (props.pinnedViewIds.includes(viewId)) return

  const ids = [...props.visibleViewIds]
  const fromIndex = ids.indexOf(draggedId.value)
  const toIndex = ids.indexOf(viewId)
  if (fromIndex === -1 || toIndex === -1) return

  ids.splice(fromIndex, 1)
  ids.splice(toIndex, 0, draggedId.value)
  emit('reorder', ids)
  resetDrag()
}

function onDragEnd(event) {
  event.currentTarget.classList.remove('dragging')
  resetDrag()
}

function resetDrag() {
  draggedId.value = null
  dropTargetId.value = null
}
</script>

<template>
  <div ref="tabBarRef" class="view-tab-bar" data-tour="view-tabs">
    <div class="view-tab-strip">
      <!-- One scroll container for both tablists so they share a scroll position.
           `tabindex="-1"`: browsers otherwise give scroll containers a focus stop of their own. -->
      <div
        ref="scrollRef"
        class="view-tab-scroll"
        :class="{ 'can-scroll-left': canScrollLeft, 'can-scroll-right': canScrollRight }"
        tabindex="-1"
      >
        <div
          class="view-tab-bar-tabs"
          role="tablist"
          aria-label="Views"
          aria-orientation="horizontal"
          tabindex="-1"
        >
          <!-- Focusable via the roving `:tabindex`, which the rule cannot evaluate. -->
          <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
          <div
            v-for="view in tabViews"
            :key="view.id"
            class="view-tab"
            :class="{
              active: view.id === activeView,
              'drop-target': view.id === dropTargetId,
            }"
            :data-tab-key="view.id"
            :draggable="pinnedViewIds.includes(view.id) ? 'false' : 'true'"
            role="tab"
            :aria-selected="view.id === activeView"
            v-bind="tabBindings(view.id)"
            :tabindex="tabIndexFor(view.id)"
            @focus="focusedTabKey = view.id"
            @keydown="onTabKeydown($event, view.id)"
            @contextmenu="onTabContextMenu($event, view.id)"
            @dragstart="onDragStart($event, view.id)"
            @dragover="onDragOver($event, view.id)"
            @dragleave="onDragLeave($event, view.id)"
            @drop="onDrop($event, view.id)"
            @dragend="onDragEnd"
          >
            <i v-if="view.icon" :class="view.icon" class="view-tab-icon" />
            <span class="view-tab-label">{{ view.label }}</span>
            <Badge v-if="view.badge" :value="view.badge" severity="warn" class="view-tab-badge" />
            <span
              v-if="isLocked(view.id)"
              v-tooltip.bottom="LOCKED_HINT"
              class="view-tab-lock"
              role="img"
              aria-label="Locked"
            >
              <i class="pi pi-lock" />
            </span>
            <button
              v-else-if="allowAddRemove && view.closable !== false"
              class="view-tab-close"
              title="Remove from tabs (Delete)"
              aria-hidden="true"
              tabindex="-1"
              @click="handleCloseTab($event, view.id)"
            >
              <i class="pi pi-times" />
            </button>
          </div>

          <div v-if="tabViews.length === 0" class="view-tab-empty">
            {{
              allowAddRemove ? 'No views selected. Click [+] to add views.' : 'No views available.'
            }}
          </div>
        </div>

        <template v-if="toolTabs.length > 0">
          <div class="view-tab-divider" />
          <div
            class="view-tab-bar-tools"
            role="tablist"
            aria-label="Tool results and terminals"
            aria-orientation="horizontal"
            tabindex="-1"
          >
            <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
            <div
              v-for="tab in toolTabs"
              :key="tab.id"
              class="view-tab tool-tab"
              :class="{
                active: tab.id === activeToolTab,
                'tool-running': tab.status === 'running' || tab.status === 'pending',
                'tool-error': tab.status === 'error',
              }"
              :data-tab-key="toolKey(tab.id)"
              role="tab"
              :aria-selected="tab.id === activeToolTab"
              v-bind="toolTabBindings(tab.id)"
              :tabindex="tabIndexFor(toolKey(tab.id))"
              @focus="focusedTabKey = toolKey(tab.id)"
              @keydown="onTabKeydown($event, toolKey(tab.id))"
            >
              <i :class="tab.icon" class="view-tab-icon" />
              <i
                v-if="tab.status === 'running' || tab.status === 'pending'"
                class="pi pi-spin pi-spinner view-tab-status-icon"
              />
              <i
                v-else-if="tab.status === 'error'"
                class="pi pi-exclamation-circle view-tab-status-icon tool-error-icon"
              />
              <span class="view-tab-label">{{ tab.label }}</span>
              <button
                class="view-tab-close"
                :title="tab.closeTitle ?? 'Close tool result (Delete)'"
                aria-hidden="true"
                tabindex="-1"
                @click="handleCloseToolTab($event, tab.id)"
              >
                <i class="pi pi-times" />
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Pointer-only: keyboard focus already scrolls the strip. -->
      <button
        v-if="activeSide && activeTab"
        v-tooltip.bottom="`Scroll to ${activeTab.label}`"
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="view-tab-active-edge"
        :class="`view-tab-active-edge-${activeSide}`"
        @click="scrollKeyIntoView(activeTabKey)"
      >
        <i :class="activeSide === 'left' ? 'pi pi-chevron-left' : 'pi pi-chevron-right'" />
        <i v-if="activeTab.icon" :class="activeTab.icon" />
      </button>
    </div>

    <div class="view-tab-actions-divider" />

    <div class="view-tab-bar-actions">
      <Button
        v-if="hiddenKeys.length > 0"
        v-tooltip.bottom="'Tabs out of view'"
        class="view-tab-overflow"
        :aria-label="`Tabs out of view (${hiddenKeys.length})`"
        icon="pi pi-chevron-down"
        text
        severity="secondary"
        size="small"
        @click="overflowMenuRef?.toggle($event)"
      />
      <Menu ref="overflowMenuRef" :model="overflowMenuItems" popup />
      <EntityContextMenu
        v-if="allowAddRemove"
        ref="tabMenuRef"
        :items="tabMenuItems"
        @hide="onTabMenuHide"
      />
      <Button
        v-if="allowAddRemove"
        v-tooltip.bottom="'Manage views'"
        :aria-label="addableCount > 0 ? `Manage views (${addableCount} more)` : 'Manage views'"
        icon="pi pi-plus"
        :label="addableCount > 0 ? `${addableCount} more` : undefined"
        text
        severity="secondary"
        size="small"
        @click="emit('add', $event)"
      />
      <Button
        v-tooltip.bottom="'Refresh'"
        aria-label="Refresh"
        icon="pi pi-refresh"
        text
        severity="secondary"
        size="small"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.view-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  min-height: 2.5rem;

  /* A variable because the dark value is not a token flip. */
  --view-tab-bg: var(--p-surface-100);
}

html.app-dark .view-tab-bar {
  --view-tab-bg: var(--p-surface-800);
}

.view-tab-strip {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  position: relative;
}

/* `overflow-y: hidden` matters: one pixel of vertical overflow makes the wheel scroll that
   pixel instead of sideways. The 1px baseline nudge lives here, not on `.view-tab`, because
   on the child it creates exactly that overflow. */
.view-tab-scroll {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
  top: 1px;
}

.view-tab-scroll::-webkit-scrollbar {
  display: none;
}

/* The scrollbar is hidden, so a soft edge is the only cue that the row continues. */
.view-tab-scroll.can-scroll-left {
  mask-image: linear-gradient(to right, transparent 0, black 2.5rem);
}

.view-tab-scroll.can-scroll-right {
  mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent 100%);
}

.view-tab-scroll.can-scroll-left.can-scroll-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 2.5rem,
    black calc(100% - 2.5rem),
    transparent 100%
  );
}

/* Outside the scroller so its mask does not fade the pill too. */
.view-tab-active-edge {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.375rem;
  padding: 0 0.5rem;
  border: none;
  border-radius: 999px;
  background: var(--p-button-primary-background);
  color: var(--p-button-primary-color);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  cursor: pointer;
  transform: translateY(-50%);
}

.view-tab-active-edge-left {
  left: 0.125rem;
}

.view-tab-active-edge-right {
  right: 0.125rem;
}

.view-tab-active-edge:hover {
  background: var(--p-button-primary-hover-background);
  color: var(--p-button-primary-hover-color);
}

.view-tab-active-edge i {
  font-size: 0.75rem;
}

.view-tab-active-edge .pi-chevron-left,
.view-tab-active-edge .pi-chevron-right {
  font-size: 0.625rem;
}

.view-tab-bar-tabs {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

/* Keyed tabs are reused, so this runs only when a tab joins the bar. */
@keyframes view-tab-appear {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.25rem 0.25rem 0 0;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  background: var(--view-tab-bg);
  border: 1px solid transparent;
  border-bottom: none;
  transition: all 0.15s;
  white-space: nowrap;
  /* Otherwise tabs shrink to fit and the strip never scrolls. */
  flex-shrink: 0;
  animation: view-tab-appear 0.15s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .view-tab {
    animation: none;
  }
}

.view-tab:hover {
  color: var(--p-text-color);
  background: var(--p-surface-hover);
}

/* Negative offset keeps the ring inside the scrolling strip. */
.view-tab:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.view-tab.dragging {
  opacity: 0.4;
}

.view-tab.drop-target {
  box-shadow: -2px 0 0 0 var(--p-primary-color);
}

.view-tab.active {
  color: var(--p-primary-color);
  background: var(--p-surface-card);
  border-color: var(--p-surface-border);
  font-weight: 500;
}

.view-tab-icon {
  font-size: 0.875rem;
}

.view-tab-label {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-tab-badge {
  flex-shrink: 0;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.25rem;
  font-size: 0.6875rem;
  line-height: 1.125rem;
}

.view-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
  border-radius: 0.125rem;
  opacity: 0;
  transition: all 0.15s;
}

.view-tab:hover .view-tab-close,
.view-tab:focus-visible .view-tab-close,
.view-tab.active .view-tab-close {
  opacity: 0.6;
}

.view-tab-close:hover {
  opacity: 1 !important;
  background: var(--p-surface-200);
  color: var(--p-text-color);
}

.view-tab-close i {
  font-size: 0.625rem;
}

.view-tab-lock {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

.view-tab-lock i {
  font-size: 0.625rem;
}

.view-tab-empty {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-style: italic;
  padding: 0.375rem 0.5rem;
}

.view-tab-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  flex-shrink: 0;
  margin: 0 0.25rem;
}

.view-tab-actions-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  flex-shrink: 0;
}

.view-tab-bar-tools {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.tool-tab {
  border-style: dashed;
  border-color: var(--p-surface-border);
}

.tool-tab.active {
  background: var(--p-surface-card);
  border-style: solid;
}

.tool-tab.tool-running {
  color: var(--p-text-muted-color);
}

.tool-tab.tool-error:not(.active) {
  color: var(--p-red-500);
}

.view-tab-status-icon {
  font-size: 0.6875rem;
}

.tool-error-icon {
  color: var(--p-red-500);
}

.view-tab-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}
</style>
