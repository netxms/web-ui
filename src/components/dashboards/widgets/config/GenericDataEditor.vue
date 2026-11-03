<script setup>
import Textarea from 'primevue/textarea'

// Raw element data JSON; the dialog validates it on save and re-derives the render config.
const model = defineModel({ type: String, required: true })

defineProps({
  error: { type: String, default: null },
})
</script>

<template>
  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-raw-json">Element configuration (JSON)</label>
    <Textarea id="wpd-raw-json" v-model="model" rows="14" class="wpd-input wpd-mono" />
    <small v-if="error" class="wpd-json-error">{{ error }}</small>
    <small v-else class="wpd-hint">
      This element type has no dedicated editor yet — the raw configuration can be edited directly.
      Field names match the server's dashboard element configuration.
    </small>
  </div>
</template>

<style scoped>
.wpd-json-error {
  font-size: 0.75rem;
  color: var(--p-red-500, #ef4444);
}
</style>
