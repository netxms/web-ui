<script setup>
import InputNumber from 'primevue/inputnumber'
import TableDciSelector from './shared/TableDciSelector.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <TableDciSelector
    object-label="Object"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
    v-model:dci-id="form.dciId"
  />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-tv-refresh">Refresh interval (s)</label>
    <InputNumber
      id="wpd-tv-refresh"
      v-model="form.refreshRate"
      :min="5"
      :max="3600"
      show-buttons
      class="wpd-input"
    />
  </div>
</template>
