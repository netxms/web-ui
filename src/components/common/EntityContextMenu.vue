<script setup>
import { ref } from 'vue'
import ContextMenu from 'primevue/contextmenu'
import { menuAnchorEvent } from '@/utils/menuAnchor'

defineProps({
  items: {
    type: Array,
    required: true,
  },
})

const menu = ref()
const contextData = ref(null)

// `event` may be a keyboard click on an overflow button, which has no coordinates; see
// `menuAnchorEvent`.
function show(event, rowData) {
  contextData.value = rowData
  menu.value.show(menuAnchorEvent(event))
}

defineExpose({ show, contextData })
</script>

<template>
  <ContextMenu ref="menu" :model="items" />
</template>
