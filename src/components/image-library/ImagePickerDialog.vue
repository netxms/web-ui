<script setup>
import Dialog from 'primevue/dialog'
import ImagePickerContent from './ImagePickerContent.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Only images with width <= W and height <= H are shown. */
  sizeFilter: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'select'])

function onSelect(id) {
  emit('select', id)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Image"
    :modal="true"
    :closable="true"
    :style="{ width: '540px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <ImagePickerContent :size-filter="props.sizeFilter" @select="onSelect" />
  </Dialog>
</template>
