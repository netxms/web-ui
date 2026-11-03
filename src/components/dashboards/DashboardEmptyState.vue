<script setup>
import { getAddableTypeGroups } from './widgetRegistry'

const emit = defineEmits(['add'])

const addableTypes = getAddableTypeGroups().flatMap((g) => g.types)
</script>

<template>
  <div class="dashboard-empty-state">
    <div class="empty-icon">
      <i class="pi pi-th-large" />
    </div>
    <h3 class="empty-title">This dashboard is empty</h3>
    <p class="empty-subtitle">Pick a widget below to add your first element</p>
    <div class="empty-widget-grid">
      <button
        v-for="t in addableTypes"
        :key="t.key"
        type="button"
        class="empty-widget-btn"
        @click="emit('add', t.key)"
      >
        <i :class="t.icon" />
        <span>{{ t.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 2rem;
  text-align: center;
  overflow-y: auto;
}

.empty-icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  color: var(--p-primary-color);
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0;
}

.empty-subtitle {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin: 0 0 1.25rem;
}

.empty-widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
  max-width: 680px;
  width: 100%;
}

.empty-widget-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 0.8125rem;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.1s;
}

.empty-widget-btn i {
  font-size: 1rem;
  color: var(--p-primary-color);
  flex-shrink: 0;
}

.empty-widget-btn:hover {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-surface-card));
  transform: translateY(-1px);
}
</style>
