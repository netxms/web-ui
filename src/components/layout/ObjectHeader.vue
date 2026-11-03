<script setup>
import Button from 'primevue/button'
import { ref, computed } from 'vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { anchorEventAt } from '@/utils/menuAnchor'
import { getStatusInfo } from '@/utils/objectUtils'

const props = defineProps({
  object: {
    type: Object,
    default: null,
  },
  /** Resolved items flagged `primary`; an entry with `items` opens a dropdown. */
  actions: {
    type: Array,
    default: () => [],
  },
  toolsMenuItems: {
    type: Array,
    default: () => [],
  },
})

const actionsMenu = ref(null)
const promotedMenu = ref(null)
const promotedMenuItems = ref([])

const statusInfo = computed(() => {
  if (props.object?.status == null) return null
  return getStatusInfo(props.object.status)
})

const statusLabel = computed(() => {
  return props.object?.statusText ?? statusInfo.value?.label ?? ''
})

const isInMaintenance = computed(() => props.object?.isInMaintenanceMode ?? false)

// PrimeVue ContextMenu positions from pointer coordinates, so anchor it to the button.
function showBelow(menuRef, event) {
  menuRef.value?.show(anchorEventAt(event.currentTarget, event))
}

function handleActionClick(action, event) {
  if (action.disabled) return
  if (action.items?.length) {
    promotedMenuItems.value = action.items
    showBelow(promotedMenu, event)
    return
  }
  action.command?.({ originalEvent: event, item: action })
}

function showActionsMenu(event) {
  showBelow(actionsMenu, event)
}
</script>

<template>
  <div v-if="object" class="object-header">
    <div class="object-header-info">
      <ObjectIcon
        v-if="object.class"
        :object="object"
        :size="16"
        :inactive="object.status === 6"
        class="object-header-icon"
      />
      <span class="object-header-name">{{ object.name }}</span>
      <span
        v-if="statusInfo"
        class="object-header-status"
        :style="{ background: statusInfo.bgColor, color: statusInfo.textColor }"
      >
        {{ statusLabel }}
      </span>
      <span
        v-if="isInMaintenance"
        v-tooltip.bottom="'Object is in maintenance mode'"
        class="object-header-maintenance"
      >
        <i class="pi pi-wrench" />
        Maintenance
      </span>
    </div>

    <div class="object-header-actions">
      <Button
        v-for="action in actions"
        :key="action.id"
        v-tooltip.bottom="action.label"
        :icon="action.icon"
        :disabled="action.disabled"
        :aria-haspopup="action.items?.length ? 'true' : undefined"
        :aria-label="action.label"
        text
        severity="secondary"
        size="small"
        @click="handleActionClick(action, $event)"
      />
      <ActionContextMenu ref="promotedMenu" :items="promotedMenuItems" />

      <Button
        v-if="toolsMenuItems.length > 0"
        label="Actions"
        icon="pi pi-chevron-down"
        icon-pos="right"
        text
        severity="secondary"
        size="small"
        class="object-header-actions-button"
        aria-haspopup="true"
        @click="showActionsMenu"
      />
      <ActionContextMenu ref="actionsMenu" :items="toolsMenuItems" />
    </div>
  </div>
  <div v-else class="object-header object-header-empty">
    <span class="object-header-placeholder">Select an object to view details</span>
  </div>
</template>

<style scoped>
.object-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  min-height: 2.75rem;
}

.object-header-empty {
  justify-content: center;
}

.object-header-placeholder {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.object-header-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.object-header-icon {
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.object-header-name {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.object-header-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.object-header-maintenance {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
  background: var(--p-orange-100);
  color: var(--p-orange-700);
}

.object-header-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}

.object-header-actions-button {
  margin-left: 0.25rem;
  font-size: 0.8125rem;
}

.object-header-actions-button :deep(.p-button-icon) {
  font-size: 0.6875rem;
}
</style>
