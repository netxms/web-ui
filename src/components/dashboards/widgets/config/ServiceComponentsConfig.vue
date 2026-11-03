<script setup>
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const PERSPECTIVES = [{ id: 'business-services', label: 'Business Services', rootId: 9 }]
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Business service"
    :perspectives="PERSPECTIVES"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />
</template>
