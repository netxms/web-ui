<script setup>
import Button from 'primevue/button'
import { useConnectionStore } from '@/stores/connectionStore'

const connectionStore = useConnectionStore()
</script>

<template>
  <div class="server-alert-overlay">
    <div class="server-alert-content">
      <h2>{{ connectionStore.serverAlert?.message }}</h2>
      <div v-if="connectionStore.serverAlert?.actions?.length" class="server-alert-actions">
        <Button
          v-for="action in connectionStore.serverAlert.actions"
          :key="action.label"
          :label="action.label"
          @click="action.handler"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.server-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--p-surface-ground) 92%, transparent);
  backdrop-filter: blur(4px);
}

.server-alert-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;
  max-width: 480px;
  padding: 2rem;
  background: var(--p-surface-overlay);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.5rem);
  box-shadow: 0 8px 32px color-mix(in srgb, #000 20%, transparent);
}

.server-alert-content h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.server-alert-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
