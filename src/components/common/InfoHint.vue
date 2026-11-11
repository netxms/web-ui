<script setup>
import Tooltip from 'primevue/tooltip'

/** A muted info icon beside a figure or control; its tooltip says where the value comes from. */
defineProps({
  text: { type: String, required: true },
  /** What the hint is about, for screen readers ("Facility power") */
  label: { type: String, default: '' },
})

const vTooltip = Tooltip
</script>

<template>
  <i
    v-tooltip.top="text"
    class="pi pi-info-circle info-hint"
    tabindex="0"
    role="img"
    :aria-label="label ? `About ${label}: ${text}` : text"
  />
</template>

<style scoped>
.info-hint {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  cursor: help;
  border-radius: 50%;
}

.info-hint:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
</style>
