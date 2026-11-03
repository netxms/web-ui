<script setup>
import Checkbox from 'primevue/checkbox'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <label class="wpd-check-row" for="wpd-sc-transposed">
    <span @click.stop>
      <Checkbox input-id="wpd-sc-transposed" v-model="form.transposed" :binary="true" />
    </span>
    Horizontal bars (transposed)
  </label>
</template>
