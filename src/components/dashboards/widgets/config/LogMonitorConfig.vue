<script setup>
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

// Both legacy configs (syslog and SNMP trap monitors) carry an object id and nothing else.
const { form } = useWidgetEditor()
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    placeholder="Not set (all objects)"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />
  <small class="wpd-hint">
    Records from this object and everything below it. Leave unset to watch the whole system.
  </small>
</template>
