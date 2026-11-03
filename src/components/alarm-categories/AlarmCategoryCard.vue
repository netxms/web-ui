<script setup>
import Button from 'primevue/button'

defineProps({
  category: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'delete'])
</script>

<template>
  <div class="alarm-category-card">
    <div class="card-header">
      <span class="category-name">{{ category.name }}</span>
      <div class="card-actions">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          text
          size="small"
          severity="secondary"
          @click="emit('edit', category)"
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          text
          size="small"
          severity="danger"
          @click="emit('delete', category)"
        />
      </div>
    </div>

    <div class="card-body">
      <p v-if="category.description" class="category-description">{{ category.description }}</p>
      <p v-else class="category-description no-description">No description</p>
    </div>
  </div>
</template>

<style scoped>
.alarm-category-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.alarm-category-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.5rem 0.625rem 0.875rem;
}

.category-name {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.card-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.card-body {
  border-top: 1px solid var(--p-surface-border);
  padding: 0.625rem 0.875rem;
}

.category-description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.no-description {
  font-style: italic;
}
</style>
