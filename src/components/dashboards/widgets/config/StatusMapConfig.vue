<script setup>
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
</template>
