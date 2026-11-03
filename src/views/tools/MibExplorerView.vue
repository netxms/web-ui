<script setup>
/**
 * The tree half of the legacy MIB explorer; walking a live node needs an SNMP walk/get
 * endpoint that does not exist yet.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import MibBrowser from '@/components/mibs/MibBrowser.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useMibNode } from '@/queries/useMibQueries'
import LoadingState from '@/components/common/LoadingState.vue'

const route = useRoute()
const router = useRouter()

// The URL owns the selection, so a deep link and a click behave the same way.
const selectedOid = computed(() => {
  const oid = route.query.oid
  return typeof oid === 'string' && oid !== '' ? oid : null
})

const { data: node, isLoading, isError, error, refetch } = useMibNode(selectedOid)

function selectOid(oid) {
  if (oid === selectedOid.value) return
  router.replace({ query: { ...route.query, oid: oid || undefined } })
}

const detailFields = computed(() => {
  const n = node.value
  if (!n) return []
  return [
    { label: 'OID', value: n.oid },
    { label: 'Name', value: n.name },
    { label: 'Type', value: n.type },
    { label: 'Status', value: n.status },
    { label: 'Access', value: n.access },
    { label: 'Index', value: n.index },
    { label: 'Display Hint', value: n.displayHint },
    { label: 'Textual Convention', value: n.textualConvention },
    { label: 'Description', value: n.description },
  ].filter((f) => f.value != null && f.value !== '')
})

const enumValues = computed(() => (node.value?.enumValues?.length ? node.value.enumValues : null))

async function copyOid() {
  if (!selectedOid.value) return
  try {
    await navigator.clipboard.writeText(selectedOid.value)
  } catch {
    // Clipboard access can be refused; the OID is on screen and selectable.
  }
}
</script>

<template>
  <div class="mib-explorer">
    <div class="mib-tree-panel">
      <MibBrowser :selected-oid="selectedOid" @select="selectOid" />
    </div>

    <div class="mib-detail-panel">
      <EmptyState
        v-if="!selectedOid"
        icon="pi pi-share-alt"
        title="No OID selected"
        message="Pick a node in the MIB tree to see its definition."
      />

      <QueryErrorState v-else-if="isError" :error="error" @retry="refetch" />

      <LoadingState v-else-if="isLoading" class="mib-detail-loading" />

      <div v-else-if="node" class="mib-details">
        <div class="details-header">
          <span class="details-title">{{ node.name || node.oid }}</span>
          <Button
            icon="pi pi-copy"
            label="Copy OID"
            severity="secondary"
            text
            size="small"
            @click="copyOid"
          />
        </div>

        <div class="details-grid">
          <template v-for="field in detailFields" :key="field.label">
            <span class="detail-label">{{ field.label }}</span>
            <span
              class="detail-value"
              :class="{ 'detail-value--description': field.label === 'Description' }"
              >{{ field.value }}</span
            >
          </template>
        </div>

        <div v-if="enumValues" class="enum-section">
          <span class="detail-label">Enum Values</span>
          <div class="enum-table">
            <div v-for="ev in enumValues" :key="ev.value" class="enum-row">
              <span class="enum-val">{{ ev.value }}</span>
              <span class="enum-name">{{ ev.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mib-explorer {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) 3fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.mib-tree-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--p-surface-border);
  overflow: hidden;
}

.mib-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 1rem 1.25rem;
}

.mib-detail-loading {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
}

.details-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

.details-grid {
  display: grid;
  grid-template-columns: minmax(120px, max-content) 1fr;
  gap: 0.375rem 1rem;
  font-size: 0.8125rem;
}

.detail-label {
  color: var(--p-text-muted-color);
  font-weight: 500;
}

.detail-value {
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

.detail-value--description {
  white-space: pre-wrap;
  line-height: 1.5;
}

.enum-section {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.enum-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
  overflow: hidden;
}

.enum-row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: 0.75rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
}

.enum-row:nth-child(odd) {
  background: var(--p-surface-100);
}

:global(.app-dark) .enum-row:nth-child(odd) {
  background: var(--p-surface-800);
}

.enum-val {
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .mib-explorer {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .mib-tree-panel {
    border-right: none;
    border-bottom: 1px solid var(--p-surface-border);
  }
}
</style>
