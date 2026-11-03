<script setup>
defineProps({
  isFetching: { type: Boolean, default: false },
})
</script>

<template>
  <Transition name="refetch-fade">
    <div v-if="isFetching" class="refetch-indicator">
      <i class="pi pi-spin pi-spinner" />
      <span>Refreshing...</span>
    </div>
  </Transition>
</template>

<style scoped>
.refetch-indicator {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--p-surface-overlay);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm);
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  z-index: 10;
  pointer-events: none;
}

.refetch-fade-enter-active,
.refetch-fade-leave-active {
  transition: opacity 0.2s ease;
}

.refetch-fade-enter-from,
.refetch-fade-leave-to {
  opacity: 0;
}
</style>
