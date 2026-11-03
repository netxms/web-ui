<script setup>
import InputNumber from 'primevue/inputnumber'
import DciListEditor from './shared/DciListEditor.vue'
import GaugeZoneFields from './shared/GaugeZoneFields.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <DciListEditor />

  <GaugeZoneFields />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-refresh-g">Refresh rate (seconds)</label>
    <InputNumber
      input-id="wpd-refresh-g"
      v-model="form.refreshRate"
      :min="5"
      :max="3600"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
</template>
