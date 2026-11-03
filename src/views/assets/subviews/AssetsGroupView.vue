<script setup>
import { computed, ref, inject, watch } from 'vue'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppTable from '@/components/common/AppTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import ProgressSpinner from 'primevue/progressspinner'
import { getStatusInfo } from '@/utils/objectUtils'
import { useAssetPropertiesBatch } from '@/queries/useAssetPropertyQueries'
import { useQueryClient } from '@tanstack/vue-query'
import { userPrefs } from '@/utils/appStorage'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({ object: { type: Object, default: null } })

const childAssets = computed(() =>
  (props.object?.children ?? []).filter((c) => c.class === 'Asset'),
)
const childIds = computed(() => childAssets.value.map((c) => c.id))

const queryClient = useQueryClient()
const { propertiesById, isLoading } = useAssetPropertiesBatch(childIds)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => queryClient.invalidateQueries({ queryKey: ['assetProperties'] }))
}

const allAssets = computed(() =>
  childAssets.value.map((child) => {
    const properties = propertiesById.value.get(child.id) ?? {}
    return {
      ...child,
      properties,
      // Flattened: AppTable sorts on `row[field]` and cannot reach into `properties`.
      ipAddress: properties.ip_address ?? null,
      model: properties.model ?? null,
      vendor: properties.vendor ?? null,
    }
  }),
)

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 220 },
  { id: 'ipAddress', field: 'ipAddress', label: 'IP Address', sortable: true, width: 160 },
  { id: 'model', field: 'model', label: 'Model', sortable: true, width: 180 },
  { id: 'vendor', field: 'vendor', label: 'Vendor', sortable: true, width: 150 },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 120 },
]

const VIEW_MODE_PREF = 'assetsGroupView.viewMode'
const viewMode = ref(userPrefs.get(VIEW_MODE_PREF, 'cards'))

function setViewMode(mode) {
  viewMode.value = mode
  userPrefs.set(VIEW_MODE_PREF, mode)
}

const filterText = ref('')

useWorkingState('assets-group', { view: { filterText } })

const filteredAssets = computed(() => {
  if (!filterText.value) return allAssets.value
  const s = filterText.value.toLowerCase()
  return allAssets.value.filter(
    (a) =>
      a.name.toLowerCase().includes(s) ||
      (a.vendor ?? '').toLowerCase().includes(s) ||
      (a.model ?? '').toLowerCase().includes(s) ||
      (a.ipAddress ?? '').includes(s),
  )
})
</script>

<template>
  <div class="assets-group-view">
    <div class="assets-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter assets..."
          class="filter-input"
        />
      </IconField>
      <span class="asset-count"
        >{{ filteredAssets.length }} asset{{ filteredAssets.length !== 1 ? 's' : '' }}</span
      >
      <div class="view-toggle">
        <Button
          v-tooltip.bottom="'Card view'"
          aria-label="Card view"
          icon="pi pi-th-large"
          :text="viewMode !== 'cards'"
          :outlined="viewMode === 'cards'"
          size="small"
          severity="secondary"
          rounded
          @click="setViewMode('cards')"
        />
        <Button
          v-tooltip.bottom="'List view'"
          aria-label="List view"
          icon="pi pi-list"
          :text="viewMode !== 'list'"
          :outlined="viewMode === 'list'"
          size="small"
          severity="secondary"
          rounded
          @click="setViewMode('list')"
        />
      </div>
    </div>

    <div v-if="isLoading" class="assets-loading">
      <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
    </div>

    <div v-else-if="allAssets.length === 0" class="assets-empty">
      <i class="pi pi-inbox" />
      <p class="empty-title">No assets</p>
      <p class="empty-subtitle">This group contains no assets.</p>
    </div>

    <div v-else-if="filteredAssets.length === 0" class="assets-empty">
      <i class="pi pi-inbox" />
      <p class="empty-title">No assets match your filter</p>
      <p class="empty-subtitle">Try a different search term.</p>
    </div>

    <div v-else-if="viewMode === 'cards'" class="assets-card-grid">
      <div v-for="asset in filteredAssets" :key="asset.id" class="asset-card">
        <div class="asset-card-title">
          <span class="asset-name">{{ asset.name }}</span>
          <span
            class="asset-status-badge"
            :style="{
              background: getStatusInfo(asset.status).bgColor,
              color: getStatusInfo(asset.status).textColor,
            }"
          >
            {{ getStatusInfo(asset.status).label }}
          </span>
        </div>
        <div class="asset-card-divider" />
        <div class="asset-card-meta">
          <div class="meta-row">
            <span class="meta-label">IP</span>
            <span :class="asset.properties.ip_address ? 'meta-value' : 'meta-value meta-empty'">
              {{ asset.properties.ip_address ?? '—' }}
            </span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Model</span>
            <span :class="asset.properties.model ? 'meta-value' : 'meta-value meta-empty'">
              {{ asset.properties.model ?? '—' }}
            </span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Vendor</span>
            <span :class="asset.properties.vendor ? 'meta-value' : 'meta-value meta-empty'">
              {{ asset.properties.vendor ?? '—' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- AppTable, not DataTable: a group can hold hundreds of assets. -->
    <AppTable
      v-else
      :columns="columns"
      :rows="filteredAssets"
      :page-size="50"
      sort-field="name"
      :sort-order="1"
      striped
      column-borders
      auto-width
      class="assets-table"
    >
      <template #empty>No assets found.</template>
      <template #cell="{ col, row }">
        <div v-if="col.id === 'name'" class="table-name-cell">
          <span class="status-dot" :style="{ background: getStatusInfo(row.status).color }" />
          <span class="table-name-text">{{ row.name }}</span>
        </div>
        <StatusTag v-else-if="col.id === 'status'" :status="row.status" />
        <span v-else :class="row[col.field] ? '' : 'cell-empty'">
          {{ row[col.field] ?? '—' }}
        </span>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.assets-group-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.assets-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.filter-input {
  width: 260px;
}

.asset-count {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  padding-left: 0.25rem;
}

.view-toggle {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.assets-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  padding: 3rem;
}

.assets-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.375rem;
  padding: 3rem;
  color: var(--p-text-muted-color);
  text-align: center;
}

.assets-empty i {
  font-size: 2.5rem;
  opacity: 0.35;
  margin-bottom: 0.25rem;
}

.empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.empty-subtitle {
  margin: 0;
  font-size: 0.875rem;
}

.assets-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  align-content: start;
  overflow-y: auto;
  padding: 1rem;
  flex: 1;
}

.asset-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
  cursor: default;
}

.asset-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.asset-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.75rem 0.625rem;
}

.asset-name {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-status-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.asset-card-divider {
  height: 1px;
  background: var(--p-surface-border);
}

.asset-card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.625rem 0.75rem 0.75rem;
}

.meta-row {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  align-items: center;
  gap: 0.5rem;
}

.meta-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.meta-value {
  font-size: 0.8125rem;
  color: var(--p-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-empty {
  color: var(--p-text-muted-color);
}

.assets-table {
  flex: 1;
  min-height: 0;
}

.table-name-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.table-name-text {
  font-weight: 500;
}

.cell-empty {
  color: var(--p-text-muted-color);
}
</style>
