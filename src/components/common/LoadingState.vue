<script setup>
/**
 * First-load placeholder. Not for background refreshes (`RefetchIndicator`); prefer a
 * content-shaped `<Skeleton>` where the layout is known. `aria-live="polite"`: a load starting
 * is not worth interrupting the screen reader.
 */
defineProps({
  /** Overrides the default wording when the caller can say what is loading. */
  message: { type: String, default: 'Loading…' },
  /** Inline row, for table cells and narrow panels. */
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="loading-state" :class="{ 'loading-state--compact': compact }" aria-live="polite">
    <i class="pi pi-spin pi-spinner" aria-hidden="true" />
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.loading-state--compact {
  justify-content: flex-start;
  padding: 0.5rem 0;
  font-size: 0.8125rem;
}
</style>
