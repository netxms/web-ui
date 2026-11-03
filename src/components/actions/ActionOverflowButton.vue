<script setup>
import Button from 'primevue/button'

defineEmits(['click'])
</script>

<template>
  <Button
    icon="pi pi-ellipsis-v"
    text
    rounded
    severity="secondary"
    size="small"
    class="action-overflow-btn"
    aria-label="Actions"
    @click.stop="$emit('click', $event)"
  />
</template>

<style scoped>
/* Both PrimeVue class names, to outrank `.p-button-icon-only.p-button-rounded` (injected later),
   whose `height` without a `width` turned the button into an ellipse. */
.action-overflow-btn.p-button-icon-only.p-button-rounded {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}
</style>
