<script setup>
/**
 * "Your account may not see this": for a permission boundary, not a failure (use EmptyState for
 * no data, UnderConstructionOverlay / notifyNotImplemented for unbuilt features). Muted rather
 * than red, so users do not report it as a bug, and it names the missing right so they know
 * what to ask their administrator for.
 */
import { computed } from 'vue'
import { labelForRight } from '@/auth/systemRights'
import EmptyState from '@/components/common/EmptyState.vue'

const props = defineProps({
  /** A `usePermissions().can` key, e.g. 'manageActions'. */
  right: { type: String, default: '' },
  title: { type: String, default: 'Not available with your permissions' },
  /** Overrides the generated "Requires the ... system right." sentence. */
  message: { type: String, default: '' },
  /** Single muted line, for sidebars and tree panels. */
  compact: { type: Boolean, default: false },
})

/** null when unknown/unspecified. */
const rightLabel = computed(() => (props.right ? labelForRight(props.right) : null))

const detail = computed(() => {
  if (props.message) return props.message
  return rightLabel.value
    ? `Requires the "${rightLabel.value}" system right.`
    : 'Your account does not have permission to view this.'
})
</script>

<template>
  <div v-if="compact" class="restricted-compact">
    <i class="pi pi-lock" />
    <span>{{ detail }}</span>
  </div>

  <EmptyState v-else icon="pi pi-lock" :title="title" :message="detail" class="restricted-state">
    <p class="restricted-hint">Ask your administrator to grant it.</p>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </EmptyState>
</template>

<style scoped>
/* Muted, not an error colour. */
.restricted-compact {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.restricted-hint {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  opacity: 0.85;
}
</style>
