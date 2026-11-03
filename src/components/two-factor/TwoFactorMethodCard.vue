<script setup>
import Button from 'primevue/button'

defineProps({
  method: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'delete'])

const DRIVER_STYLES = {
  TOTP: { label: 'TOTP', class: 'driver-totp' },
  Message: { label: 'Message', class: 'driver-message' },
}

function driverStyle(driver) {
  return DRIVER_STYLES[driver] ?? { label: driver, class: 'driver-other' }
}
</script>

<template>
  <div class="method-card">
    <div class="card-header">
      <span class="driver-chip" :class="driverStyle(method.driver).class">
        {{ driverStyle(method.driver).label }}
      </span>
      <span class="status-badge" :class="method.isValid ? 'status-valid' : 'status-invalid'">
        <i :class="method.isValid ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" />
        {{ method.isValid ? 'Valid' : 'Invalid' }}
      </span>
    </div>

    <div class="card-body">
      <p class="method-name">{{ method.name }}</p>
      <p v-if="method.description" class="method-description">{{ method.description }}</p>
      <p v-else class="method-description method-description--empty">No description</p>
    </div>

    <div class="card-footer">
      <Button
        label="Edit"
        icon="pi pi-pencil"
        text
        size="small"
        severity="secondary"
        @click="emit('edit', method)"
      />
      <Button
        label="Delete"
        icon="pi pi-trash"
        text
        size="small"
        severity="danger"
        @click="emit('delete', method)"
      />
    </div>
  </div>
</template>

<style scoped>
.method-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.method-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem 0;
}

.driver-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.driver-totp {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.driver-message {
  background: var(--p-purple-100);
  color: var(--p-purple-700);
}

.driver-other {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-valid {
  color: var(--p-green-600);
}

.status-invalid {
  color: var(--p-orange-600);
}

.card-body {
  flex: 1;
  padding: 0.625rem 0.875rem 0.5rem;
}

.method-name {
  margin: 0 0 0.25rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.method-description {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.method-description--empty {
  font-style: italic;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}
</style>
