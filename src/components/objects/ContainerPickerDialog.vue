<script setup>
import ObjectPickerDialog from './ObjectPickerDialog.vue'
import { CONTAINER_PARENT_CLASSES, canBindChild } from '@/utils/objectCreationRules'

const props = defineProps({
  visible: { type: Boolean, required: true },
  title: { type: String, default: 'Select Container' },
  /** Objects to be bound: a target must take every one of them. */
  objects: { type: Array, default: () => [] },
  /** Containers not offered, such as the ones a move starts from. */
  excludeIds: { type: Array, default: () => [] },
  multiSelect: { type: Boolean, default: true },
  confirmDisabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'select'])

const CONTAINER_PERSPECTIVES = [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }]

function isTarget(node) {
  return (
    CONTAINER_PARENT_CLASSES.has(node.class) &&
    !props.excludeIds.includes(node.id) &&
    props.objects.every((o) => o.id !== node.id && canBindChild(o.class, node.class))
  )
}
</script>

<template>
  <ObjectPickerDialog
    :visible="visible"
    :title="title"
    :perspectives="CONTAINER_PERSPECTIVES"
    :selectable="isTarget"
    :display-filter="isTarget"
    :multi-select="multiSelect"
    :confirm-disabled="confirmDisabled"
    show-perspective-root
    @update:visible="emit('update:visible', $event)"
    @select="emit('select', $event)"
  >
    <template v-if="$slots.default" #intro>
      <slot />
    </template>
  </ObjectPickerDialog>
</template>
