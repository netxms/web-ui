<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const SHAPE_OPTIONS = [
  { label: 'Circle', value: 0 },
  { label: 'Rectangle', value: 1 },
  { label: 'Rounded rectangle', value: 2 },
]

const LABEL_TYPE_OPTIONS = [
  { label: 'None', value: 0 },
  { label: 'Inside shape', value: 1 },
  { label: 'Below shape', value: 2 },
]

const INFRA_PERSPECTIVES = [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }]

const objectPickerVisible = ref(false)

function addElement(node) {
  if (!Array.isArray(form.elements)) form.elements = []
  form.elements.push({
    type: 0, // object status element
    label: node.name,
    objectId: node.id,
    dciId: 0,
    drillDownObjectId: 0,
  })
  objectPickerVisible.value = false
}

function removeElement(index) {
  form.elements.splice(index, 1)
}
</script>

<template>
  <div class="wpd-field wpd-field--column">
    <div class="si-config-header">
      <span class="wpd-label">Objects</span>
      <Button
        label="Add Object"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        @click="objectPickerVisible = true"
      />
    </div>
    <div v-if="!form.elements?.length" class="wpd-hint">No objects configured.</div>
    <div v-else class="si-config-list">
      <div v-for="(element, i) in form.elements" :key="i" class="si-config-row">
        <span class="si-config-object">#{{ element.objectId }}</span>
        <InputText
          v-model="element.label"
          size="small"
          placeholder="Label"
          class="si-config-label"
        />
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          @click="removeElement(i)"
          aria-label="Remove element"
        />
      </div>
    </div>
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-si-cols">Columns</label>
    <InputNumber
      input-id="wpd-si-cols"
      v-model="form.numColumns"
      :min="1"
      :max="8"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-si-shape">Shape</label>
    <Select
      id="wpd-si-shape"
      v-model="form.shape"
      :options="SHAPE_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-si-labeltype">Labels</label>
    <Select
      id="wpd-si-labeltype"
      v-model="form.labelType"
      :options="LABEL_TYPE_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <label class="wpd-check-row" for="wpd-si-fullrange">
    <span @click.stop>
      <Checkbox input-id="wpd-si-fullrange" v-model="form.fullColorRange" :binary="true" />
    </span>
    Full status color range (otherwise green / red only)
  </label>

  <ObjectPickerDialog
    v-model:visible="objectPickerVisible"
    title="Select Object"
    :perspectives="INFRA_PERSPECTIVES"
    @select="addElement"
  />
</template>

<style scoped>
.si-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.si-config-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.si-config-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.si-config-object {
  width: 4rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
}

.si-config-label {
  flex: 1;
  min-width: 0;
}
</style>
