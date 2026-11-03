<script setup>
// A 403 cannot be retried out of, so it renders the muted permission wording without Retry.
import { computed } from 'vue'
import Button from 'primevue/button'
import RestrictedState from '@/components/common/RestrictedState.vue'

const props = defineProps({
  error: { type: [Object, Error], default: null },
  message: { type: String, default: null },
  retrying: { type: Boolean, default: false },
  /** A `can` key naming the right this data needs, when the caller knows it. */
  right: { type: String, default: '' },
})

defineEmits(['retry'])

const forbidden = computed(() => props.error?.status === 403)
</script>

<template>
  <RestrictedState v-if="forbidden" compact :right="right" :message="message ?? undefined" />

  <div v-else class="query-error-state">
    <i class="pi pi-exclamation-triangle" />
    <span>{{ message ?? error?.message ?? 'Failed to load data' }}</span>
    <Button
      label="Retry"
      icon="pi pi-refresh"
      text
      size="small"
      :loading="retrying"
      @click="$emit('retry')"
    />
  </div>
</template>

<style scoped>
.query-error-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-red-500);
  font-size: 0.875rem;
}
</style>
