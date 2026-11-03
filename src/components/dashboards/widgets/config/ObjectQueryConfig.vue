<script setup>
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'
import FormField from '@/components/common/FormField.vue'

const { form } = useWidgetEditor()

if (!Array.isArray(form.properties)) form.properties = []

function addProperty() {
  form.properties.push({ name: '', displayName: '' })
}

function removeProperty(index) {
  form.properties.splice(index, 1)
}
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    placeholder="Not set (all objects)"
    v-model:object-id="form.rootObjectId"
    v-model:object-name="form.rootObjectName"
  />

  <FormField class="wpd-field wpd-field--column" label="Query script" group>
    <NxslScriptEditor
      id="wpd-oq-script"
      v-model="form.query"
      hint-key="object-query"
      :show-compile="true"
      :rows="6"
    />
  </FormField>

  <FormField class="wpd-field wpd-field--column" label="Columns" group>
    <div class="oqc-props">
      <div v-if="!form.properties.length" class="oqc-props-empty">
        No columns defined — all script-returned fields are shown as dynamic columns.
      </div>
      <div v-for="(prop, i) in form.properties" :key="i" class="oqc-prop-row">
        <InputText
          v-model="prop.name"
          placeholder="field name"
          size="small"
          class="oqc-prop-name"
        />
        <InputText
          v-model="prop.displayName"
          placeholder="column header (optional)"
          size="small"
          class="oqc-prop-display"
        />
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          @click="removeProperty(i)"
          aria-label="Remove property"
        />
      </div>
    </div>
    <Button
      label="Add Column"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      @click="addProperty"
    />
  </FormField>

  <FormField class="wpd-field" label="Refresh rate (s)" v-slot="{ id }">
    <InputNumber
      :input-id="id"
      id="wpd-oq-refresh"
      v-model="form.refreshRate"
      :min="5"
      size="small"
      class="wpd-input"
    />
  </FormField>

  <FormField class="wpd-field" label="Record limit (0 = unlimited)" v-slot="{ id }">
    <InputNumber
      :input-id="id"
      id="wpd-oq-limit"
      v-model="form.recordLimit"
      :min="0"
      size="small"
      class="wpd-input"
    />
  </FormField>
</template>

<style scoped>
.oqc-props {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
}

.oqc-props-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.oqc-prop-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.oqc-prop-name {
  width: 40%;
}

.oqc-prop-display {
  flex: 1;
  min-width: 0;
}
</style>
