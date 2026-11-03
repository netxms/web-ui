<script setup>
import Badge from 'primevue/badge'
import { useNavTarget } from '@/composables/useNavTarget'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, required: true },
  /** From a routeTargets builder. */
  target: { type: [Object, String], required: true },
  color: { type: String, default: 'primary' },
  badge: { type: Number, default: 0 },
})

const { linkBindings } = useNavTarget()
</script>

<template>
  <a class="quick-action-card" v-bind="linkBindings(target)">
    <div class="quick-action-icon-wrap">
      <i :class="icon" class="quick-action-icon" :style="{ color: `var(--qa-color-${color})` }" />
      <Badge v-if="badge > 0" :value="badge" severity="danger" class="quick-action-badge" />
    </div>
    <span class="quick-action-title">{{ title }}</span>
  </a>
</template>

<style scoped>
.quick-action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
  font-family: inherit;
  font-size: inherit;
  text-decoration: none;

  --qa-color-blue: var(--p-blue-500, #3b82f6);
  --qa-color-red: var(--p-red-500, #ef4444);
  --qa-color-green: var(--p-emerald-500, #10b981);
  --qa-color-purple: var(--p-violet-500, #8b5cf6);
  --qa-color-orange: var(--p-orange-500, #f97316);
  --qa-color-slate: var(--p-slate-500, #64748b);
  --qa-color-primary: var(--p-primary-color);
}

/* The 500 weights are not theme-aware, so on the dark card they need one step lighter. */
html.app-dark .quick-action-card {
  --qa-color-blue: var(--p-blue-400, #60a5fa);
  --qa-color-red: var(--p-red-400, #f87171);
  --qa-color-green: var(--p-emerald-400, #34d399);
  --qa-color-purple: var(--p-violet-400, #a78bfa);
  --qa-color-orange: var(--p-orange-400, #fb923c);
  --qa-color-slate: var(--p-slate-400, #94a3b8);
}

.quick-action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: var(--p-primary-color);
}

.quick-action-card:active {
  transform: translateY(-2px);
}

.quick-action-icon-wrap {
  position: relative;
}

.quick-action-icon {
  font-size: 2.25rem;
}

.quick-action-badge {
  position: absolute;
  top: -6px;
  right: -10px;
}

.quick-action-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}
</style>
