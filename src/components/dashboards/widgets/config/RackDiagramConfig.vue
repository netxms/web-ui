<script setup>
import SelectButton from 'primevue/selectbutton'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'
import FormField from '@/components/common/FormField.vue'

const { form } = useWidgetEditor()

const VIEW_OPTIONS = [
  { label: 'Full', value: 0 },
  { label: 'Front', value: 1 },
  { label: 'Rear', value: 2 },
]
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Rack"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <FormField class="wpd-field" label="Display mode" v-slot="{ id }">
    <SelectButton
      :input-id="id"
      v-model="form.view"
      :options="VIEW_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
    />
  </FormField>
  <small class="wpd-hint">"Rear" falls back to the full front+back view (not yet supported).</small>
</template>
