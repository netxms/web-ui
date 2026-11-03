<script setup>
/**
 * Catches render/lifecycle errors in its slot and shows a recoverable panel: Vue would otherwise
 * tear the whole tree down to a blank page. Reporting happens in `app.config.errorHandler`.
 */
import { ref, watch, onErrorCaptured } from 'vue'
import Button from 'primevue/button'
import { useRouter } from 'vue-router'

const props = defineProps({
  /** Changing it clears the error; pass the route path so navigating away resets the boundary. */
  resetKey: { type: [String, Number], default: null },
})

const router = useRouter()
const error = ref(null)

onErrorCaptured((err) => {
  error.value = err
  return false
})

watch(
  () => props.resetKey,
  () => {
    error.value = null
  },
)

function reload() {
  window.location.reload()
}

function goHome() {
  error.value = null
  router.push('/home')
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <i class="pi pi-exclamation-triangle error-boundary-icon" />
    <h2 class="error-boundary-title">Something went wrong</h2>
    <p class="error-boundary-message">
      This view failed to render. The rest of the console is still usable.
    </p>
    <pre v-if="error.message" class="error-boundary-detail">{{ error.message }}</pre>
    <div class="error-boundary-actions">
      <Button label="Reload" icon="pi pi-refresh" size="small" @click="reload" />
      <Button
        label="Go to Home"
        icon="pi pi-home"
        size="small"
        severity="secondary"
        text
        @click="goHome"
      />
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  text-align: center;
}

.error-boundary-icon {
  font-size: 2rem;
  color: var(--p-red-500);
}

.error-boundary-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.error-boundary-message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.error-boundary-detail {
  margin: 0;
  max-width: 40rem;
  max-height: 10rem;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  background: var(--p-surface-ground);
  color: var(--p-text-muted-color);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-boundary-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
