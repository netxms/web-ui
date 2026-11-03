<script setup>
import MultiSelect from 'primevue/multiselect'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const SEVERITY_OPTIONS = [
  { label: 'Normal', value: 0 },
  { label: 'Warning', value: 1 },
  { label: 'Minor', value: 2 },
  { label: 'Major', value: 3 },
  { label: 'Critical', value: 4 },
]

const ALARM_STATE_OPTIONS = [
  { label: 'Outstanding', value: 0 },
  { label: 'Acknowledged', value: 1 },
  { label: 'Resolved', value: 2 },
  { label: 'Terminated', value: 3 },
]
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    placeholder="Not set (all objects)"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-severities">Severity filter</label>
    <MultiSelect
      id="wpd-severities"
      v-model="form.severities"
      :options="SEVERITY_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="All severities"
      display="chip"
      class="wpd-input"
    />
    <small class="wpd-hint">Leave empty to show all severities.</small>
  </div>

  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-states">State filter</label>
    <MultiSelect
      id="wpd-states"
      v-model="form.alarmStates"
      :options="ALARM_STATE_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="All states"
      display="chip"
      class="wpd-input"
    />
    <small class="wpd-hint">Leave empty to show all alarm states.</small>
  </div>
</template>
