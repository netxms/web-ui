<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: null,
  },
})
</script>

<template>
  <div class="section-header">
    <div class="section-header-info">
      <i v-if="icon" :class="icon" class="section-header-icon" />
      <span class="section-header-title">{{ title }}</span>
    </div>
    <div class="section-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  min-height: 2.75rem;
}

.section-header-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.section-header-icon {
  font-size: 1rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.section-header-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
