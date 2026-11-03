<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getSectionLabel } from '../configSections'

const route = useRoute()
const sectionLabel = computed(() => getSectionLabel(route.params.sectionId))
</script>

<template>
  <div class="coming-soon">
    <div class="coming-soon-content">
      <i class="pi pi-box coming-soon-icon" />
      <h3 class="coming-soon-title">{{ sectionLabel }}</h3>
      <p class="coming-soon-text">This configuration section is not yet implemented.</p>
    </div>
  </div>
</template>

<style scoped>
.coming-soon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  padding: 3rem;
}

.coming-soon-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--p-text-muted-color);
}

.coming-soon-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.coming-soon-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.5rem;
}

.coming-soon-text {
  font-size: 0.875rem;
  max-width: 400px;
  margin: 0;
  line-height: 1.5;
}
</style>
