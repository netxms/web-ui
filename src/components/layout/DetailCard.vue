<script setup>
defineProps({
  title: {
    type: String,
    default: null,
  },
  wide: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="detail-card" :class="{ 'detail-card--wide': wide }">
    <div v-if="title" class="detail-card-header">
      <span class="detail-card-title">{{ title }}</span>
    </div>
    <div class="detail-card-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.detail-card {
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-lg, 0.5rem);
  align-self: start;
  width: 100%;
}

.detail-card--wide {
  grid-column: 1 / -1;
}

.detail-card-header {
  display: flex;
  align-items: center;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-card-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
}

.detail-card-body {
  padding: 0 1rem 0.25rem;
}
</style>
