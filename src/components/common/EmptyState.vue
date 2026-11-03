<script setup>
/**
 * "No data yet, but the feature works" (not for unbuilt features: UnderConstructionOverlay /
 * notifyNotImplemented). A CTA in `#actions` that navigates must be a real anchor (AppLink or
 * `Button as="a"`).
 */
defineProps({
  /** Full PrimeIcons class, e.g. 'pi pi-chart-bar'. */
  icon: { type: String, default: '' },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
})
</script>

<template>
  <div class="empty-state">
    <i v-if="icon" :class="[icon, 'empty-icon']" />
    <h3 v-if="title" class="empty-title">{{ title }}</h3>
    <p v-if="message" class="empty-message">{{ message }}</p>
    <div v-if="$slots.default" class="empty-body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="empty-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 3rem 2rem;
  text-align: center;
  gap: 0.75rem;
}

.empty-icon {
  font-size: 2.5rem;
  color: var(--p-text-muted-color);
  opacity: 0.5;
}

.empty-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.empty-message {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  max-width: 380px;
  line-height: 1.5;
}

.empty-body {
  width: 100%;
  max-width: 420px;
  margin-top: 0.25rem;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
