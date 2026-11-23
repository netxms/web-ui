<script setup>
import StatusIcon from '@/components/common/StatusIcon.vue'

defineOptions({ name: 'EventLabel' })

// An event as the legacy client draws one: its template's severity icon, then the name.
defineProps({
  name: { type: String, required: true },
  /** The template's severity; the Unknown icon without one. */
  severity: { type: [Number, String], default: undefined },
})
</script>

<template>
  <span class="event-label">
    <StatusIcon :status="severity" size="0.875rem" />
    <span class="event-label__name">{{ name }}</span>
  </span>
</template>

<style scoped>
.event-label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  max-width: 100%;
}

.event-label__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
