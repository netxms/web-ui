<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import DrilldownPickerDialog from '@/components/objects/DrilldownPickerDialog.vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const pickerVisible = ref(false)

const ids = computed(() => props.draft.dashboards ?? [])
const { objectsById } = useObjectsByIds(ids)

const items = computed(() =>
  ids.value.map((id) => {
    const obj = objectsById.value.get(id)
    return { id, name: obj?.name ?? null, class: obj?.class ?? null }
  }),
)

function iconForClass(cls) {
  if (cls === 'NetworkMap') return 'pi pi-map'
  if (cls === 'Dashboard') return 'pi pi-th-large'
  return 'pi pi-sitemap'
}

function onSelect(node) {
  if (ids.value.includes(node.id)) return
  props.draft.dashboards = [...ids.value, node.id]
}

function remove(id) {
  props.draft.dashboards = ids.value.filter((x) => x !== id)
}
</script>

<template>
  <div class="dm-section">
    <div class="dm-header">
      <span class="dm-title">
        Associated Dashboards &amp; Maps
        <span class="dm-count">({{ ids.length }})</span>
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

    <div class="dm-list">
      <div v-if="items.length === 0" class="dm-empty">No dashboards or maps associated.</div>
      <div v-for="item in items" :key="item.id" class="dm-row">
        <i :class="iconForClass(item.class)" class="dm-row-icon" />
        <span class="dm-row-name">{{ item.name ?? `Object #${item.id}` }}</span>
        <Button
          :aria-label="`Remove ${item.name}`"
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="danger"
          class="dm-row-remove"
          @click="remove(item.id)"
        />
      </div>
    </div>

    <DrilldownPickerDialog v-model:visible="pickerVisible" @select="onSelect" />
  </div>
</template>

<style scoped>
.dm-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius);
  background: var(--p-surface-card);
  padding: 1rem;
}

.dm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dm-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.dm-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.dm-list {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
}

.dm-empty {
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.dm-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.875rem;
}

.dm-row:last-child {
  border-bottom: none;
}

.dm-row-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
}

.dm-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-row-remove {
  flex-shrink: 0;
  width: 1.5rem !important;
  height: 1.5rem !important;
}
</style>
