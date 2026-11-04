<script setup>
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const confirmDelete = useConfirmDelete()

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

const { mutateAsync: deleteAttribute } = useDeleteAssetAttribute()

function menuItems(attribute) {
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => openDetail(attribute.name) },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => onDelete(attribute),
    },
  ]
}

function onDelete(attribute) {
  const displayName = attribute.displayName || attribute.name
  confirmDelete({
    message: `Delete attribute "${displayName}"? All stored values for this attribute on existing assets will also be removed. This cannot be undone.`,
    run: () => deleteAttribute(attribute.name),
    successDetail: `Attribute "${displayName}" deleted.`,
    failureDetail: 'Failed to delete attribute.',
  })
}

const attributeDetailName = computed(() =>
  isDetailView.value && !isNewAttribute.value ? entityId.value : null,
)
const {
  data: attributeDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useAssetAttribute(attributeDetailName)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Asset Management Schema"
    icon="pi pi-database"
    add-label="Add Attribute"
    filter-placeholder="Filter by name, display name, or type..."
    count-noun="attribute"
    :columns="columns"
    :rows="filteredAttributes"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No asset attributes defined."
    :menu-items="menuItems"
    sort-field="name"
    :sort-order="1"
    :page-size-options="[50, 100, 200]"
    storage-key="asset-management-schema"
    :target-for="(row) => detailTarget(row.name)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.name)"
  >
    <template #detail>
      <AssetAttributeDetailView v-if="isNewAttribute" :attribute="null" @close="closeDetail" />
      <AssetAttributeDetailView
        v-else-if="attributeDetail"
        :attribute="attributeDetail"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Asset attribute not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

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
        <span v-if="!row.isMandatory && !row.isUnique && !row.isHidden" class="text-muted">—</span>
      </span>
    </template>
  </EntityListSection>
</template>

<style scoped>
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

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
