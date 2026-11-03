<script setup>
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const MAP_PERSPECTIVES = [{ id: 'network-maps', label: 'Network Maps', rootId: 6 }]
</script>

<template>
  <ObjectSelectorField
    label="Network map"
    picker-title="Select Network Map"
    :perspectives="MAP_PERSPECTIVES"
    v-model:object-id="form.mapId"
    v-model:object-name="form.mapName"
  />
</template>
