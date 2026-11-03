<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const pickerVisible = ref(false)

const ids = computed(() => props.draft.trustedObjects ?? [])
const { objectsById } = useObjectsByIds(ids)

const items = computed(() =>
  ids.value.map((id) => {
    const obj = objectsById.value.get(id)
    return { id, name: obj?.name ?? null, class: obj?.class ?? null }
  }),
)

const CLASS_LABELS = {
  Node: 'Node',
  Container: 'Container',
  Cluster: 'Cluster',
  Rack: 'Rack',
  ServiceRoot: 'Root',
  TemplateRoot: 'Root',
  AssetRoot: 'Root',
  NetworkMapRoot: 'Root',
  DashboardRoot: 'Root',
  BusinessServiceRoot: 'Root',
  Network: 'Network',
  Subnet: 'Subnet',
  NetworkMap: 'Map',
  Dashboard: 'Dashboard',
  Template: 'Template',
  MobileDevice: 'Device',
  Sensor: 'Sensor',
  AccessPoint: 'AP',
  Chassis: 'Chassis',
}

function classBadgeLabel(cls) {
  return CLASS_LABELS[cls] ?? cls ?? '?'
}

function onSelect(node) {
  if (ids.value.includes(node.id)) return
  if (node.id === props.object.id) return
  props.draft.trustedObjects = [...ids.value, node.id]
}

function remove(id) {
  props.draft.trustedObjects = ids.value.filter((x) => x !== id)
}
</script>

<template>
  <div class="to-section">
    <div class="to-header">
      <span class="to-title">
        Trusted Objects
        <span class="to-count">({{ ids.length }})</span>
      </span>
      <Button
        label="Add..."
        icon="pi pi-plus"
        size="small"
        outlined
        severity="secondary"
        @click="pickerVisible = true"
      />
    </div>

    <div class="to-list">
      <div v-if="items.length === 0" class="to-empty">No trusted objects.</div>
      <div v-for="item in items" :key="item.id" class="to-row">
        <span class="class-badge">{{ classBadgeLabel(item.class) }}</span>
        <span class="to-row-name">{{ item.name ?? `Object #${item.id}` }}</span>
        <Button
          :aria-label="`Remove ${item.name}`"
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="danger"
          class="to-row-remove"
          @click="remove(item.id)"
        />
      </div>
    </div>

    <AllObjectsPickerDialog
      v-model:visible="pickerVisible"
      title="Select Trusted Object"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
.to-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius);
  background: var(--p-surface-card);
  padding: 1rem;
}

.to-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.to-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.to-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.to-list {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
}

.to-empty {
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.to-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.875rem;
}

.to-row:last-child {
  border-bottom: none;
}

.to-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.to-row-remove {
  flex-shrink: 0;
  width: 1.5rem !important;
  height: 1.5rem !important;
}

.class-badge {
  font-size: 0.6875rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-weight: 600;
  flex-shrink: 0;
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

html.app-dark .class-badge {
  background: var(--p-surface-700);
  color: var(--p-text-muted-color);
}
</style>
