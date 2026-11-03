<script setup>
import ObjectPickerDialog from './ObjectPickerDialog.vue'

defineProps({
  visible: { type: Boolean, required: true },
})

const emit = defineEmits(['update:visible', 'select'])

const CONTAINER_PERSPECTIVES = [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }]

function isContainer(node) {
  return node.class === 'Container' || node.class === 'Collector'
}

const displayFilter = isContainer
</script>

<template>
  <ObjectPickerDialog
    :visible="visible"
    title="Select Container"
    :perspectives="CONTAINER_PERSPECTIVES"
    :selectable="isContainer"
    :display-filter="displayFilter"
    multi-select
    @update:visible="emit('update:visible', $event)"
    @select="emit('select', $event)"
  />
</template>
