<script setup>
import { computed } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import MacTypeBadge from './MacTypeBadge.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { describeMacHit } from '@/utils/macSearch'

const props = defineProps({
  /** Raw hits from GET /v1/find/mac-address */
  hits: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  /** ApiError, or null. A 403 means the account lacks SEARCH_NETWORK. */
  error: { type: Object, default: null },
  /** Absolute index in the palette */
  focusedIndex: { type: Number, default: 0 },
  /** Index of this group's first row in the flat result list */
  offset: { type: Number, default: 0 },
  /** The palette's `optionBindings(absoluteIndex)`, so option ids are generated in one place. */
  optionBindings: { type: Function, default: null },
})

const emit = defineEmits(['activate'])

const rows = computed(() => props.hits.map((hit) => describeMacHit(hit)))

const isForbidden = computed(() => props.error?.status === 403)
</script>

<template>
  <!-- State rows are presentational; GlobalSearch announces them from its live region. -->
  <div v-if="isLoading" class="mac-state" role="presentation">
    <i class="pi pi-spin pi-spinner" />
    <span>Searching the network…</span>
  </div>

  <div v-else-if="isForbidden" class="mac-state" role="presentation">
    <i class="pi pi-lock" />
    <span>Your account does not have the "search network" permission.</span>
  </div>

  <div v-else-if="error" class="mac-state mac-state-error" role="presentation">
    <i class="pi pi-exclamation-triangle" />
    <span>{{ error.message || 'Search failed.' }}</span>
  </div>

  <div v-else-if="rows.length === 0" class="mac-state" role="presentation">
    <i class="pi pi-search-minus" />
    <span>No devices found with that MAC address.</span>
  </div>

  <template v-else>
    <component
      :is="row.target ? AppLink : 'div'"
      v-for="(row, idx) in rows"
      :key="`mac-${idx}-${row.mac}`"
      v-bind="optionBindings?.(offset + idx)"
      :to="row.target"
      class="mac-row"
      :class="{ 'is-focused': focusedIndex === offset + idx, 'is-static': !row.target }"
      @activate="emit('activate', hits[idx])"
    >
      <ObjectIcon v-if="row.ownerObject" :object="row.ownerObject" class="mac-icon" />
      <i v-else class="pi pi-desktop mac-icon" />

      <div class="mac-body">
        <div class="mac-line-primary">
          <span class="mac-owner">{{ row.ownerName ?? 'Unknown device' }}</span>
          <span v-if="row.ifaceName" class="mac-iface">/ {{ row.ifaceName }}</span>
          <span
            v-if="row.status"
            class="mac-status"
            :style="{ background: row.status.bgColor, color: row.status.textColor }"
            >{{ row.status.label }}</span
          >
        </div>

        <div class="mac-line-secondary">
          <span class="mac-address">{{ row.mac }}</span>
          <span v-if="row.ip" class="mac-sep">·</span>
          <span v-if="row.ip">{{ row.ip }}</span>
          <template v-if="row.switchName">
            <span class="mac-sep">·</span>
            <span>
              via {{ row.switchName }}
              <template v-if="row.portName">port {{ row.portName }}</template>
              <template v-if="row.ifIndex">(idx {{ row.ifIndex }})</template>
            </span>
          </template>
        </div>
      </div>

      <MacTypeBadge :type="row.type" class="mac-type-slot" />
    </component>
  </template>
</template>

<style scoped>
/* Mirrors .search-result-item in GlobalSearch.vue, widened for a two-line row. */
.mac-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: background 0.1s;
  color: inherit;
  text-decoration: none;
}

.mac-row.is-static {
  cursor: default;
}

.mac-row:hover,
.mac-row.is-focused {
  background: var(--p-content-hover-background);
}

.mac-icon {
  font-size: 0.9rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  margin-top: 0.15rem;
}

.mac-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.mac-line-primary {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  min-width: 0;
}

.mac-owner {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mac-iface {
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mac-status {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.mac-line-secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.mac-address {
  font-family: var(--font-mono);
}

.mac-sep {
  opacity: 0.5;
}

/* The badge is a flex-start row child; nudge it onto the first line's baseline. */
.mac-type-slot {
  margin-top: 0.1rem;
}

.mac-state {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.mac-state-error {
  color: var(--p-red-500);
}
</style>
