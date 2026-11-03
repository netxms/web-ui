<script setup>
import ObjectPickerDialog from './ObjectPickerDialog.vue'

defineProps({
  visible: { type: Boolean, required: true },
})

const emit = defineEmits(['update:visible', 'select'])

// Template root is object id 3 on every server.
const TEMPLATE_PERSPECTIVES = [{ id: 'templates', label: 'Templates', rootId: 3 }]

function isGroup(node) {
  return node.class === 'TemplateGroup' || node.class === 'TemplateRoot'
}
</script>

<template>
  <ObjectPickerDialog
    :visible="visible"
    title="Select Template Group"
    :perspectives="TEMPLATE_PERSPECTIVES"
    :selectable="isGroup"
    :display-filter="isGroup"
    show-perspective-root
    @update:visible="emit('update:visible', $event)"
    @select="emit('select', $event)"
  />
</template>
