<script setup>
defineProps({
  message: {
    type: String,
    default: 'Coming soon',
  },
})
</script>

<template>
  <div class="uc-wrap">
    <slot />
    <div class="uc-overlay">
      <div class="uc-badge">
        <i class="pi pi-wrench uc-icon" />
        <div class="uc-text">
          <span class="uc-title">Under construction</span>
          <span class="uc-message">{{ message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uc-wrap {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.uc-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--p-surface-ground) 65%, transparent);
  backdrop-filter: blur(1.5px);
}

.uc-badge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-lg, 8px);
  background: var(--p-surface-card);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  max-width: 26rem;
}

.uc-icon {
  font-size: 1.5rem;
  color: var(--p-amber-500);
}

.uc-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.uc-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.uc-message {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
