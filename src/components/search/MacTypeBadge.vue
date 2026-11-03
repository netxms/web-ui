<script setup>
import { computed } from 'vue'
import { MAC_TYPE_SEVERITY } from '@/utils/macSearch'

const props = defineProps({
  /** DIRECT | INDIRECT | WIRELESS | UNKNOWN | NOT_FOUND */
  type: { type: String, default: '' },
})

const severity = computed(() => MAC_TYPE_SEVERITY[props.type] ?? 'muted')
</script>

<template>
  <span class="mac-type" :class="`mac-type-${severity}`">{{ type }}</span>
</template>

<style scoped>
.mac-type {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Colour-blind-safe: hue is paired with distinct lightness and a spelled-out label. */
.mac-type-direct {
  background: color-mix(in srgb, var(--p-green-500) 18%, transparent);
  color: var(--p-green-700);
}

.mac-type-indirect {
  background: color-mix(in srgb, var(--p-amber-500) 20%, transparent);
  color: var(--p-amber-700);
}

.mac-type-wireless {
  background: color-mix(in srgb, var(--p-blue-500) 18%, transparent);
  color: var(--p-blue-700);
}

.mac-type-muted {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

html.app-dark .mac-type-direct {
  color: var(--p-green-300);
}

html.app-dark .mac-type-indirect {
  color: var(--p-amber-300);
}

html.app-dark .mac-type-wireless {
  color: var(--p-blue-300);
}

html.app-dark .mac-type-muted {
  background: var(--p-surface-700);
}
</style>
