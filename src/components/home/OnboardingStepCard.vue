<script setup>
import Button from 'primevue/button'
import { useNavTarget } from '@/composables/useNavTarget'

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  completed: { type: Boolean, default: false },
  skipped: { type: Boolean, default: false },
  actionLabel: { type: String, default: 'Go' },
  /** From a routeTargets builder, never a bare path string. */
  actionTarget: { type: [Object, String], required: true },
  actionIcon: { type: String, default: null },
  /** When this step has a walkthrough waiting on the destination view. */
  tour: { type: String, default: null },
})

const emit = defineEmits(['start-tour', 'skip', 'unskip'])

const { linkBindings } = useNavTarget()
</script>

<template>
  <div class="onboarding-step" :class="{ completed, skipped }">
    <!-- Action buttons do not fit beside the text at this card width, so they get their own
         row. -->
    <div class="step-header">
      <i v-if="completed" class="pi pi-check-circle step-icon step-icon-done" />
      <i v-else-if="skipped" class="pi pi-minus-circle step-icon step-icon-skipped" />
      <i v-else class="pi pi-circle step-icon step-icon-pending" />

      <h4 class="step-title">{{ title }}</h4>

      <span v-if="completed" class="step-done-label">Done</span>
      <Button
        v-else-if="skipped"
        label="Undo"
        size="small"
        text
        severity="secondary"
        @click="emit('unskip')"
      />
      <Button
        v-else
        v-tooltip.bottom="'Hide this step'"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        aria-label="Skip this step"
        class="step-skip-btn"
        @click="emit('skip')"
      />
    </div>

    <p class="step-description">{{ description }}</p>

    <div v-if="!completed && !skipped" class="step-actions">
      <Button
        v-if="tour"
        v-tooltip.bottom="'Take me there and point it out'"
        label="Show me"
        icon="pi pi-sparkles"
        size="small"
        text
        @click="emit('start-tour')"
      />
      <Button
        as="a"
        :label="actionLabel"
        :icon="actionIcon"
        size="small"
        outlined
        v-bind="linkBindings(actionTarget)"
      />
    </div>
  </div>
</template>

<style scoped>
.onboarding-step {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.875rem 1rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-left: 3px solid var(--p-primary-color);
  border-radius: 8px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* A deliberately skipped step does not light up as pending on hover. */
.onboarding-step:hover:not(.completed, .skipped) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.onboarding-step.completed {
  border-left-color: var(--p-green-500, #22c55e);
  opacity: 0.65;
}

.onboarding-step.skipped {
  border-left-color: var(--p-surface-border);
  opacity: 0.5;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-icon {
  flex-shrink: 0;
  font-size: 1.125rem;
}

.step-icon-done {
  color: var(--p-green-500, #22c55e);
}

.step-icon-pending {
  color: var(--p-surface-border);
}

.step-icon-skipped {
  color: var(--p-text-muted-color);
}

/* min-width:0 lets a long title wrap instead of widening the row. */
.step-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.925rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.step-description {
  margin: 0;
  padding-inline-start: calc(1.125rem + 0.5rem);
  padding-right: 1.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.45;
}

/* Pins the row to the card's bottom, so buttons line up across a grid row. */
.step-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: auto;
  padding-top: 0.5rem;
}

/* Hidden until hover so the cards don't read as close buttons; focus keeps it visible. */
.step-skip-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.onboarding-step:hover .step-skip-btn,
.step-skip-btn:focus-visible {
  opacity: 1;
}

.step-done-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-green-500, #22c55e);
  white-space: nowrap;
}
</style>
