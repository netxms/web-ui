<script setup>
import InputNumber from 'primevue/inputnumber'
import FormField from '@/components/common/FormField.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import GaugeZoneFields from './shared/GaugeZoneFields.vue'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <!-- Legacy calls the empty selection "<dashboard>". -->
  <ObjectSelectorField
    label="Object"
    placeholder="Dashboard (default)"
    allow-context
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <FormField class="wpd-field wpd-field--column" label="Script" group>
    <NxslScriptEditor
      id="wpd-sg-script"
      v-model="form.script"
      hint-key="dashboard-script"
      show-compile
      :rows="6"
    />
    <small class="wpd-hint">
      The server runs the saved script, so changes take effect after the dashboard is saved.
    </small>
  </FormField>

  <GaugeZoneFields />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-refresh-sg">Refresh rate (seconds)</label>
    <InputNumber
      input-id="wpd-refresh-sg"
      v-model="form.refreshRate"
      :min="5"
      :max="3600"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
</template>
