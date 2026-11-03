<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import Skeleton from 'primevue/skeleton'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import AssetAttributeDetailView from '@/components/asset-management-schema/AssetAttributeDetailView.vue'
import {
  useAssetManagementSchema,
  useAssetAttribute,
  useDeleteAssetAttribute,
} from '@/queries/useAssetManagementSchemaQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewAttribute = computed(() => entityId.value === 'new')

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const {
  data: attributesData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useAssetManagementSchema()
const attributes = computed(() => attributesData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('asset-management-schema', { view: { filterState } })
const filteredAttributes = computed(() => {
  if (!filterState.value.text) return attributes.value
  const search = filterState.value.text.toLowerCase()
  return attributes.value.filter(
    (a) =>
      (a.name ?? '').toLowerCase().includes(search) ||
      (a.displayName ?? '').toLowerCase().includes(search) ||
      (a.dataType ?? '').toLowerCase().includes(search),
  )
})

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 180 },
  { id: 'displayName', field: 'displayName', label: 'Display Name', sortable: true, width: 200 },
  { id: 'dataType', field: 'dataType', label: 'Data Type', sortable: true, width: 120 },
  { id: 'systemType', field: 'systemType', label: 'System Type', sortable: true, width: 120 },
  { id: 'flags', field: 'flags', label: 'Flags', sortable: false, width: 110 },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

function onRowClick(row) {
  openDetail(row.name)
}

const contextMenu = ref()

const { mutate: deleteAttribute } = useDeleteAssetAttribute()

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => openDetail(data.name),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(data),
    },
  ]
})

function confirmDelete(attribute) {
  const displayName = attribute.displayName || attribute.name
  confirm.require({
    message: `Delete attribute "${displayName}"? All stored values for this attribute on existing assets will also be removed. This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteAttribute(attribute.name, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Attribute "${displayName}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete attribute.',
            life: 5000,
          })
        },
      })
    },
  })
}

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const attributeDetailName = computed(() =>
  isDetailView.value && !isNewAttribute.value ? entityId.value : null,
)
const {
  data: attributeDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useAssetAttribute(attributeDetailName)
</script>

<template>
  <div v-if="isDetailView" class="asset-schema-detail">
    <AssetAttributeDetailView v-if="isNewAttribute" :attribute="null" @close="closeDetail" />

    <template v-else>
      <AssetAttributeDetailView
        v-if="attributeDetail"
        :attribute="attributeDetail"
        @close="closeDetail"
        @saved="() => {}"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading..." @back="closeDetail" />
        <div class="detail-loading">
          <Skeleton height="1.5rem" width="40%" class="mb-3" />
          <Skeleton height="1rem" width="60%" class="mb-2" />
          <Skeleton height="1rem" width="55%" class="mb-2" />
          <Skeleton height="1rem" width="45%" class="mb-2" />
        </div>
      </template>

      <template v-else-if="isDetailError">
        <EntityDetailHeader title="Error" @back="closeDetail" />
        <div class="detail-content">
          <QueryErrorState :error="detailError" @retry="refetchDetail" />
        </div>
      </template>

      <template v-else>
        <EntityDetailHeader title="Not Found" @back="closeDetail" />
        <div class="detail-content">
          <p class="empty-message">Asset attribute not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="asset-schema-section">
    <SectionHeader title="Asset Management Schema" icon="pi pi-database">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          label="Add Attribute"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openNew"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter by name, display name, or type..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredAttributes.length, 'attribute')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredAttributes"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      :page-size-options="[50, 100, 200]"
      storage-key="asset-management-schema"
      class="attributes-table"
      :target-for="(row) => detailTarget(row.name)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'name'" class="attr-name">{{ row.name }}</span>
        <span v-else-if="col.id === 'displayName'" :class="{ 'text-muted': !row.displayName }">
          {{ row.displayName || '—' }}
        </span>
        <span v-else-if="col.id === 'dataType'" class="type-tag">{{ row.dataType }}</span>
        <span
          v-else-if="col.id === 'systemType'"
          :class="['system-type', { 'text-muted': !row.systemType || row.systemType === 'None' }]"
        >
          {{ row.systemType && row.systemType !== 'None' ? row.systemType : '—' }}
        </span>
        <span v-else-if="col.id === 'flags'" class="flag-chips">
          <span v-if="row.isMandatory" class="flag-chip flag-mandatory">Mandatory</span>
          <span v-if="row.isUnique" class="flag-chip flag-unique">Unique</span>
          <span v-if="row.isHidden" class="flag-chip flag-hidden">Hidden</span>
          <span v-if="!row.isMandatory && !row.isUnique && !row.isHidden" class="text-muted"
            >—</span
          >
        </span>
        <button
          v-else-if="col.id === 'actions'"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onActionsClick($event, row)"
        >
          <i class="pi pi-ellipsis-v" />
        </button>
      </template>
      <template #empty>
        <div class="empty-message">No asset attributes defined.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.asset-schema-section,
.asset-schema-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 320px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.section-loading,
.detail-loading {
  padding: 1rem;
}

.attributes-table {
  flex: 1;
  min-height: 0;
}

.attributes-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.attr-name {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 0.8125rem;
}

.type-tag {
  display: inline-block;
  padding: 0.125rem 0.4rem;
  border-radius: var(--p-border-radius-sm, 4px);
  font-size: 0.75rem;
  background: var(--p-surface-100);
  border: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
}

.flag-chips {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.flag-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: var(--p-border-radius-sm, 4px);
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
}

.flag-mandatory {
  background: #fef3c7;
  color: #92400e;
}

.flag-unique {
  background: #dbeafe;
  color: #1e40af;
}

/* Dark variants: background is the hue at 22% lightness, text at 78%, as in the status
   helpers in src/utils/objectUtils.js. */
html.app-dark .flag-mandatory {
  background: #63520d;
  color: #f1bd9d;
}

html.app-dark .flag-unique {
  background: #0e3263;
  color: #a3b4eb;
}

.flag-hidden {
  background: var(--p-surface-100);
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-surface-border);
}

.row-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: var(--p-text-muted-color);
  cursor: pointer;
  font-size: 0.875rem;
}

.row-action-btn:hover {
  background: var(--p-surface-hover);
  color: var(--p-text-color);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
