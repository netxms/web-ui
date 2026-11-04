<script setup>
import Skeleton from 'primevue/skeleton'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'

/** The detail page while there is no entity to edit: loading, failed, missing or not allowed. */
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  notFoundText: { type: String, default: 'Not found.' },
  /** A `usePermissions().can` key; shows the restricted state instead of the others. */
  restrictedRight: { type: String, default: null },
  /** Header title for the restricted state, e.g. "New Action". */
  restrictedTitle: { type: String, default: null },
  restrictedSubtitle: { type: String, default: null },
})

const emit = defineEmits(['back', 'retry'])
</script>

<template>
  <template v-if="restrictedRight">
    <EntityDetailHeader
      :title="restrictedTitle"
      :subtitle="restrictedSubtitle"
      @back="emit('back')"
    />
    <RestrictedState :right="restrictedRight" />
  </template>

  <template v-else-if="loading">
    <EntityDetailHeader title="Loading…" @back="emit('back')" />
    <div class="detail-loading" role="status" aria-label="Loading">
      <Skeleton height="1.5rem" width="40%" />
      <Skeleton height="1rem" width="60%" />
      <Skeleton height="1rem" width="55%" />
      <Skeleton height="1rem" width="45%" />
    </div>
  </template>

  <template v-else-if="error">
    <EntityDetailHeader title="Error" @back="emit('back')" />
    <div class="detail-content">
      <QueryErrorState :error="error" @retry="emit('retry')" />
    </div>
  </template>

  <template v-else>
    <EntityDetailHeader title="Not Found" @back="emit('back')" />
    <div class="detail-content">
      <p class="not-found">{{ notFoundText }}</p>
    </div>
  </template>
</template>

<style scoped>
.detail-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
