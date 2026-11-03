<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useObjectsByIds, useObject } from '@/queries/useObjectQueries'
import { useWidgetEditor } from './editorContext'
import FormField from '@/components/common/FormField.vue'

const { form } = useWidgetEditor()

const DASHBOARD_PERSPECTIVES = [{ id: 'dashboards', label: 'Dashboards', rootId: 7 }]

if (!Array.isArray(form.dashboardObjects)) form.dashboardObjects = []

const { objectsById } = useObjectsByIds(computed(() => form.dashboardObjects))

function nameFor(id) {
  return objectsById.value.get(id)?.name ?? `Object #${id}`
}

// The legacy config has no name for contextObjectId; resolved for display only.
const { data: contextObject } = useObject(computed(() => form.contextObjectId))
const contextObjectName = computed(() => contextObject.value?.name ?? '')

const pickerVisible = ref(false)

function onPicked(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes]
  const existing = new Set(form.dashboardObjects)
  for (const node of list) {
    if (!existing.has(node.id)) form.dashboardObjects.push(node.id)
  }
  pickerVisible.value = false
}

function removeDashboard(id) {
  form.dashboardObjects = form.dashboardObjects.filter((d) => d !== id)
}
</script>

<template>
  <FormField class="wpd-field wpd-field--column" label="Embedded dashboards" group>
    <div class="edc-list">
      <div v-if="!form.dashboardObjects.length" class="edc-empty">No dashboards selected.</div>
      <div v-for="id in form.dashboardObjects" :key="id" class="edc-chip">
        <span>{{ nameFor(id) }}</span>
        <button class="edc-chip-remove" @click="removeDashboard(id)">
          <i class="pi pi-times" />
        </button>
      </div>
    </div>
    <Button
      label="Add Dashboard"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      @click="pickerVisible = true"
    />
  </FormField>

  <FormField class="wpd-field" label="Rotation interval (s)" v-slot="{ id }">
    <InputNumber
      :input-id="id"
      id="wpd-display-interval"
      v-model="form.displayInterval"
      :min="0"
      size="small"
      class="wpd-input"
    />
  </FormField>
  <small class="wpd-hint">0 disables rotation; only the first dashboard is shown.</small>

  <ObjectSelectorField
    label="Context object"
    placeholder="Not set"
    :object-id="form.contextObjectId"
    :object-name="contextObjectName"
    @update:object-id="(v) => (form.contextObjectId = v)"
  />

  <ObjectPickerDialog
    v-model:visible="pickerVisible"
    title="Select Dashboard"
    :perspectives="DASHBOARD_PERSPECTIVES"
    :multi-select="true"
    :selectable="(node) => node.class === 'Dashboard'"
    @select="onPicked"
  />
</template>

<style scoped>
.edc-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
}

.edc-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.edc-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 5px;
  background: var(--p-surface-card);
  font-size: 0.8125rem;
}

.edc-chip-remove {
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
  padding: 0.125rem;
}

.edc-chip-remove:hover {
  color: var(--p-red-500, #ef4444);
}
</style>
