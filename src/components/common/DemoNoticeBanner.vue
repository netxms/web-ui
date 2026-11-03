<script setup>
defineProps({
  message: {
    type: String,
    default: 'Some functions in this view are for demonstration purposes only.',
  },
})
</script>

<template>
  <div class="demo-banner">
    <i class="pi pi-exclamation-triangle demo-banner-icon" />
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.demo-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  flex-shrink: 0;
  font-size: 1rem;
  color: var(--p-text-muted-color);
  background: color-mix(in srgb, var(--p-amber-500) 10%, var(--p-surface-card));
  border-top: 1px solid color-mix(in srgb, var(--p-amber-500) 35%, var(--p-surface-border));
}

.demo-banner-icon {
  font-size: 1rem;
  color: var(--p-amber-500);
}
</style>
