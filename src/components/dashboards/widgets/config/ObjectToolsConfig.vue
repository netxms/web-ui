<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useObjectTools } from '@/queries/useObjectToolQueries'
import { useWidgetEditor } from './editorContext'
import FormField from '@/components/common/FormField.vue'

const { form } = useWidgetEditor()

if (!Array.isArray(form.tools)) form.tools = []

const { data: toolDefs } = useObjectTools()
const toolOptions = computed(() => toolDefs.value ?? [])

function addTool() {
  form.tools.push({ objectId: 0, toolId: 0, name: '' })
}

function removeTool(index) {
  form.tools.splice(index, 1)
}

function onToolSelected(row, toolId) {
  row.toolId = toolId
  if (!row.name) row.name = toolOptions.value.find((t) => t.id === toolId)?.name ?? ''
}
</script>

<template>
  <FormField class="wpd-field wpd-field--column" label="Buttons" group>
    <div class="otc-list">
      <div v-if="!form.tools.length" class="otc-empty">No buttons configured.</div>
      <div v-for="(row, i) in form.tools" :key="i" class="otc-row">
        <InputText v-model="row.name" placeholder="Button label" size="small" class="otc-name" />
        <ObjectSelectorField
          allow-context
          label=""
          placeholder="Target object"
          :object-id="row.objectId"
          @update:object-id="(v) => (row.objectId = v)"
        />
        <Select
          :model-value="row.toolId"
          :options="toolOptions"
          option-label="name"
          option-value="id"
          placeholder="Tool..."
          size="small"
          class="otc-tool-select"
          @update:model-value="(v) => onToolSelected(row, v)"
        />
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          @click="removeTool(i)"
          aria-label="Remove tool"
        />
      </div>
    </div>
    <Button
      label="Add Button"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      @click="addTool"
    />
  </FormField>

  <FormField class="wpd-field" label="Columns" v-slot="{ id }">
    <InputNumber
      :input-id="id"
      id="wpd-ot-columns"
      v-model="form.numColumns"
      :min="1"
      :max="8"
      size="small"
      class="wpd-input"
    />
  </FormField>
</template>

<style scoped>
.otc-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.otc-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.otc-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
}

.otc-row :deep(.wpd-field) {
  border: none;
  padding: 0;
  flex: 1;
  min-width: 0;
}

.otc-name {
  width: 30%;
  flex-shrink: 0;
}

.otc-tool-select {
  width: 30%;
  flex-shrink: 0;
}
</style>
