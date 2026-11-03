<script setup>
import ProgressSpinner from 'primevue/progressspinner'
import { FAST_ATTEMPTS, useConnectionStore } from '@/stores/connectionStore'

const connectionStore = useConnectionStore()
</script>

<template>
  <Transition name="reconnect-slide">
    <div
      v-if="connectionStore.isReconnecting"
      class="reconnect-toast"
      role="status"
      aria-live="polite"
    >
      <div class="reconnect-toast-body">
        <ProgressSpinner stroke-width="4" animation-duration="0.9s" class="reconnect-spinner" />
        <div class="reconnect-text">
          <span class="reconnect-title">Reconnecting to server…</span>
          <!-- Past the fast phase the app probes until the server answers. -->
          <span v-if="connectionStore.isSlowRetry" class="reconnect-sub">
            Server is not responding. Still trying…
          </span>
          <span v-else class="reconnect-sub">
            Attempt {{ connectionStore.attemptCount }} of {{ FAST_ATTEMPTS }}
          </span>
        </div>
      </div>
      <div class="reconnect-progress-track">
        <div
          v-if="connectionStore.isSlowRetry"
          class="reconnect-progress-fill reconnect-progress-fill--indeterminate"
        />
        <div
          v-else
          class="reconnect-progress-fill"
          :style="{
            width: `${(connectionStore.attemptCount / FAST_ATTEMPTS) * 100}%`,
          }"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.reconnect-toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 280px;
  z-index: 950;
  background: var(--p-surface-overlay);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.5rem);
  box-shadow: 0 4px 16px color-mix(in srgb, #000 15%, transparent);
  overflow: hidden;
}

.reconnect-toast-body {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}

.reconnect-spinner {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.reconnect-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.reconnect-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.reconnect-sub {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.reconnect-progress-track {
  height: 3px;
  background: var(--p-surface-border);
}

.reconnect-progress-fill {
  height: 100%;
  background: var(--p-primary-color);
  transition: width 0.3s ease;
}

.reconnect-progress-fill--indeterminate {
  width: 40%;
  transition: none;
  animation: reconnect-progress-slide 1.4s ease-in-out infinite;
}

@keyframes reconnect-progress-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.reconnect-slide-enter-active,
.reconnect-slide-leave-active {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}

.reconnect-slide-enter-from,
.reconnect-slide-leave-to {
  transform: translateY(1rem);
  opacity: 0;
}
</style>
