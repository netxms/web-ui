<script setup>
import { computed, ref } from 'vue'
import Popover from 'primevue/popover'
import Checkbox from 'primevue/checkbox'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'

const props = defineProps({
  /**
   * @type {{ [groupId: string]: { label: string, views: Array<{ id: string, label: string, icon?: string }> } }}
   */
  groups: {
    type: Object,
    required: true,
  },
  visibleViewIds: {
    type: Array,
    default: () => [],
  },
  lockedViewIds: {
    type: Array,
    default: () => [],
  },
  activeView: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['toggle', 'select'])

const LOCKED_HINT = 'Locked. Right-click to unlock.'

const popover = ref(null)
const menuRef = ref(null)
const filter = ref('')

const filteredGroups = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  const result = []
  for (const [id, group] of Object.entries(props.groups)) {
    const views = needle
      ? group.views.filter((view) => view.label.toLowerCase().includes(needle))
      : group.views
    if (views.length > 0) result.push({ id, label: group.label, views })
  }
  return result
})

// The popover sizes to its content, so filtering would narrow it under the pointer. The
// unfiltered width is held while it is open.
const menuWidth = ref(null)

function onShow() {
  menuWidth.value = Math.ceil(menuRef.value?.getBoundingClientRect().width ?? 0) || null
}

function onHide() {
  menuWidth.value = null
}

function show(event) {
  filter.value = ''
  popover.value?.show(event)
}

function hide() {
  popover.value?.hide()
}

function isViewVisible(viewId) {
  return props.visibleViewIds.includes(viewId)
}

// A lock on a hidden view would leave its checkbox stuck off.
function isViewLocked(viewId) {
  return props.lockedViewIds.includes(viewId) && isViewVisible(viewId)
}

function handleViewClick(viewId) {
  if (!isViewVisible(viewId)) {
    emit('toggle', viewId)
  }
  emit('select', viewId)
  hide()
}

/** Enter in the filter does what clicking the first match's label does. */
function openFirstMatch() {
  const first = filteredGroups.value[0]?.views[0]
  if (first) handleViewClick(first.id)
}

defineExpose({ show, hide })
</script>

<template>
  <Popover ref="popover" class="view-add-menu-popover" @show="onShow" @hide="onHide">
    <div
      ref="menuRef"
      class="view-add-menu"
      :style="menuWidth ? { width: `${menuWidth}px` } : null"
    >
      <div class="view-add-menu-header">
        <span>Manage Views</span>
      </div>
      <div class="view-add-menu-filter">
        <!-- `autofocus` is what the popover focuses when it opens. -->
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="filter"
            autofocus
            data-filter-input
            placeholder="Filter views..."
            aria-label="Filter views"
            size="small"
            class="view-add-menu-filter-input"
            @keydown.enter.prevent="openFirstMatch"
          />
        </IconField>
      </div>
      <div class="view-add-menu-content">
        <div v-for="group in filteredGroups" :key="group.id" class="view-add-menu-group">
          <div class="view-add-menu-group-label">{{ group.label }}</div>
          <div class="view-add-menu-group-items">
            <div
              v-for="view in group.views"
              :key="view.id"
              class="view-add-menu-item"
              :class="{
                active: view.id === activeView,
                visible: isViewVisible(view.id),
              }"
            >
              <Checkbox
                :model-value="isViewVisible(view.id)"
                :binary="true"
                :input-id="`add-view-${view.id}`"
                :disabled="isViewLocked(view.id)"
                class="view-add-menu-checkbox"
                @update:model-value="emit('toggle', view.id)"
              />
              <button
                type="button"
                class="view-add-menu-item-content"
                @click="handleViewClick(view.id)"
              >
                <i v-if="view.icon" :class="view.icon" class="view-add-menu-item-icon" />
                <span class="view-add-menu-item-label">{{ view.label }}</span>
              </button>
              <span
                v-if="isViewLocked(view.id)"
                v-tooltip.bottom="LOCKED_HINT"
                class="view-add-menu-item-lock"
                role="img"
                aria-label="Locked"
              >
                <i class="pi pi-lock" />
              </span>
            </div>
          </div>
        </div>
        <div v-if="filteredGroups.length === 0" class="view-add-menu-empty">No views match</div>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.view-add-menu {
  display: flex;
  flex-direction: column;
  min-width: 14rem;
  max-height: 24rem;
}

.view-add-menu-header {
  padding: 0.625rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-overlay);
}

.view-add-menu-filter {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.view-add-menu-filter-input {
  width: 100%;
}

.view-add-menu-content {
  padding: 0.25rem 0;
  min-height: 0;
  overflow-y: auto;
}

.view-add-menu-empty {
  padding: 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.view-add-menu-group {
  padding: 0.25rem 0;
}

.view-add-menu-group:not(:last-child) {
  border-bottom: 1px solid var(--p-surface-100);
}

.view-add-menu-group-label {
  padding: 0.375rem 0.75rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.view-add-menu-group-items {
  display: flex;
  flex-direction: column;
}

.view-add-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.view-add-menu-item:hover {
  background: var(--p-surface-hover);
}

.view-add-menu-item.active {
  background: var(--p-primary-50);
}

.view-add-menu-item.active .view-add-menu-item-label {
  font-weight: 600;
  color: var(--p-primary-color);
}

.view-add-menu-item:not(.visible) .view-add-menu-item-content {
  opacity: 0.6;
}

.view-add-menu-checkbox {
  flex-shrink: 0;
}

.view-add-menu-item-content {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.view-add-menu-item-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.view-add-menu-item-label {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-add-menu-item-lock {
  display: flex;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.view-add-menu-item-lock i {
  font-size: 0.75rem;
}
</style>
