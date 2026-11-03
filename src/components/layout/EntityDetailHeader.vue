<script setup>
import Button from 'primevue/button'

defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: null,
  },
  backLabel: {
    type: String,
    default: 'Back',
  },
})

const emit = defineEmits(['back'])
</script>

<template>
  <div class="entity-detail-header">
    <div class="entity-detail-header-left">
      <Button
        :aria-label="backLabel"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        rounded
        size="small"
        class="back-button"
        @click="emit('back')"
      />
      <div class="entity-detail-header-info">
        <span class="entity-detail-header-title">{{ title }}</span>
        <span v-if="subtitle" class="entity-detail-header-subtitle">{{ subtitle }}</span>
      </div>
    </div>
    <div class="entity-detail-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.entity-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  min-height: 2.75rem;
}

.entity-detail-header-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.back-button {
  flex-shrink: 0;
}

.entity-detail-header-info {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.entity-detail-header-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-detail-header-subtitle {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-detail-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
