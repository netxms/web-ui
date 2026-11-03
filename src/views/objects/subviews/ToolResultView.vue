<script setup>
import { computed } from 'vue'
import ToolOutputResult from '@/components/tools/ToolOutputResult.vue'
import ToolTableResult from '@/components/tools/ToolTableResult.vue'

const props = defineProps({
  execution: {
    type: Object,
    required: true,
  },
})

// Dispatch on the response type, not the tool type.
const resultType = computed(() => props.execution.result?.type)
const isCompleted = computed(() => props.execution.status === 'completed')
const showTable = computed(() => isCompleted.value && resultType.value === 'table')
</script>

<template>
  <div class="tool-result-view">
    <ToolTableResult v-if="showTable" :execution="execution" />
    <ToolOutputResult v-else :execution="execution" />
  </div>
</template>

<style scoped>
.tool-result-view {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
