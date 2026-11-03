<script setup>
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'

defineProps({
  modelValue: {
    type: Object,
    default: () => ({ text: '', tokens: [] }),
  },
  placeholder: {
    type: String,
    default: 'Filter...',
  },
  debounce: {
    type: Number,
    default: 150,
  },
  filterDefs: {
    type: Array,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue'])

function onUpdate(val) {
  emit('update:modelValue', val)
}
</script>

<template>
  <div class="sidebar-filter">
    <SmartFilterInput
      :model-value="modelValue"
      :filter-defs="filterDefs"
      :placeholder="placeholder"
      :debounce="debounce"
      size="small"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<style scoped>
.sidebar-filter {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}
</style>
