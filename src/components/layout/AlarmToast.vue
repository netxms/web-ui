<script setup>
import Toast from 'primevue/toast'
import router from '@/router'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { alarmTarget } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'
import { useAlarmNotifications } from '@/composables/useAlarmNotifications'
import { severityConfig, severityLabels } from '@/utils/alarmDisplay'
import { ALARM_TOAST_GROUP } from '@/composables/useAlarmFeed'

// Its own Toast group, so the position preference moves alarm notifications without every
// other toast.

const { position } = useAlarmNotifications()
const { navBindings } = useNavTarget()

function severityKey(message) {
  return message.alarmSeverity in severityConfig ? message.alarmSeverity : 'normal'
}

function severityOf(message) {
  return severityConfig[severityKey(message)]
}

function severityLabel(message) {
  return severityLabels[message.alarmSeverity] ?? ''
}

/** The summary toast has no id, so it opens the alarm list. */
function targetOf(message) {
  return alarmTarget(message.alarmId)
}

// navBindings handles the new-tab gestures and calls this only for a plain left click.
function open(message, closeCallback) {
  closeCallback()
  router.push(targetOf(message))
}
</script>

<template>
  <!-- Keyed on the corner: PrimeVue writes `false` for unused insets and Vue only clears an
       inline style on null, so the old corner's inset would stay and stretch the container
       across the window, swallowing clicks. -->
  <Toast
    :key="position"
    :group="ALARM_TOAST_GROUP"
    :position="position"
    class="alarm-toast"
    :pt="{ message: { class: 'alarm-toast-message' } }"
  >
    <template #container="{ message, closeCallback }">
      <div
        class="alarm-toast-card"
        :style="{
          '--alarm-color': severityOf(message).color,
          '--alarm-text': severityOf(message).textColor,
          '--alarm-life': `${message.life}ms`,
        }"
        v-bind="navBindings(targetOf(message), () => open(message, closeCallback))"
      >
        <div class="alarm-toast-body">
          <StatusIcon class="alarm-toast-icon" :status="severityKey(message)" size="1.125rem" />
          <div class="alarm-toast-text">
            <span class="alarm-toast-title">
              <!-- Colour alone is not a label. -->
              <span v-if="!message.isSummary" class="alarm-toast-severity">
                {{ severityLabel(message) }}
              </span>
              <span class="alarm-toast-source">{{ message.summary }}</span>
            </span>
            <span v-if="message.detail" class="alarm-toast-sub">{{ message.detail }}</span>
          </div>
          <button
            type="button"
            class="alarm-toast-close"
            aria-label="Dismiss notification"
            @click.stop="closeCallback"
            @keydown.stop
          >
            <i class="pi pi-times" />
          </button>
        </div>
        <div class="alarm-toast-progress-track">
          <div class="alarm-toast-progress-fill" />
        </div>
      </div>
    </template>
  </Toast>
</template>

<style scoped>
/* Sized on the container (PrimeVue's 25rem, inset 20px) so the card fills it to the inset. */
.alarm-toast {
  width: 320px;
}

/* Matches ReconnectingToast. Square: a radius would taper the accent bar and progress fill. */
.alarm-toast-card {
  position: relative;
  width: 100%;
  background: var(--p-surface-overlay);
  border: 1px solid var(--p-surface-border);
  border-radius: 0;
  box-shadow: 0 4px 16px color-mix(in srgb, #000 15%, transparent);
  cursor: pointer;
}

/* Drawn inside the left edge rather than as a border, which CSS would mitre at the corners.
   Pinned to the padding box, where the progress fill ends too, so the two meet square. */
.alarm-toast-card::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: 3px;
  background: var(--alarm-color);
}

.alarm-toast-card:hover {
  background: var(--p-surface-hover, var(--p-content-hover-background));
}

.alarm-toast-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.alarm-toast-body {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem 0.75rem 1.125rem;
}

.alarm-toast-icon {
  margin-top: 0.05rem;
}

.alarm-toast-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.alarm-toast-title {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
  min-width: 0;
}

/* Small caps rather than a chip, which competed with the accent bar and the icon. */
.alarm-toast-severity {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  /* The level's text color, not the fill: lemon on a white card is ~1.5:1. */
  color: var(--alarm-text);
  flex-shrink: 0;
}

.alarm-toast-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-toast-sub {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.alarm-toast-close {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  cursor: pointer;
}

.alarm-toast-close:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.alarm-toast-close:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.alarm-toast-progress-track {
  height: 3px;
  background: var(--p-surface-border);
}

/* Pure CSS off the message's `life`, so there is no second timer to drift. It cannot pause on
   hover: PrimeVue's own dismissal does not either (ToastMessage's `onMouseEnter` prop is never
   forwarded by Toast). */
.alarm-toast-progress-fill {
  height: 100%;
  width: 100%;
  background: var(--alarm-color);
  animation: alarm-toast-life var(--alarm-life, 6000ms) linear forwards;
}

@keyframes alarm-toast-life {
  to {
    width: 0%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .alarm-toast-progress-fill {
    animation: none;
  }
}
</style>

<style>
/* Unscoped: the wrapper is PrimeVue's element in a portal, and its theme background, border
   and padding must come off. */
.alarm-toast-message {
  background: none;
  border: 0;
  box-shadow: none;
  padding: 0;
  margin: 0 0 0.75rem;
  backdrop-filter: none;
}
</style>
