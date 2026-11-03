<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
})

defineEmits(['action'])
</script>

<template>
  <div class="sidebar-header">
    <span class="sidebar-header-title">{{ title }}</span>
    <div class="sidebar-header-actions">
      <slot name="actions"> </slot>
    </div>
  </div>
</template>

<style scoped>
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.sidebar-header-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
