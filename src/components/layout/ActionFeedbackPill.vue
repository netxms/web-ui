<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

// Transient confirmation for an action with no visible result of its own (`notifyAction`). One
// pill at a time: a new message replaces the current one and restarts the timer.
defineOptions({ name: 'ActionFeedbackPill' })

const VISIBLE_MS = 2200

const message = ref(null)
const icon = ref(null)
let hideTimer = null

function onAction(event) {
  message.value = event.detail?.message ?? null
  icon.value = event.detail?.icon ?? null
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    message.value = null
  }, VISIBLE_MS)
}

onMounted(() => window.addEventListener('app:action', onAction))
onUnmounted(() => {
  window.removeEventListener('app:action', onAction)
  clearTimeout(hideTimer)
})
</script>

<template>
  <Transition name="action-pill">
    <div v-if="message" class="action-pill" role="status" aria-live="polite">
      <i v-if="icon" :class="icon" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.action-pill {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(90vw, 28rem);
  padding: 0.4rem 0.875rem;
  background: var(--p-surface-overlay);
  border: 1px solid var(--p-surface-border);
  border-radius: 999px;
  box-shadow: 0 4px 16px color-mix(in srgb, #000 15%, transparent);
  font-size: 0.8125rem;
  color: var(--p-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.action-pill i {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.action-pill-enter-active,
.action-pill-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.action-pill-enter-from,
.action-pill-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}
</style>
