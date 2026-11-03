<script setup>
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="placeholder-section">
    <div class="placeholder-icon">
      <i class="pi pi-wrench" />
    </div>
    <p class="placeholder-title">{{ sectionLabel }}</p>
    <p class="placeholder-text">This section is not yet implemented.</p>
  </div>
</template>

<style scoped>
.placeholder-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  opacity: 0.4;
}

.placeholder-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  color: var(--p-text-color);
}

.placeholder-text {
  font-size: 0.8125rem;
  margin: 0;
}
</style>
