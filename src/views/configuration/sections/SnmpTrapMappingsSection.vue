<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import SnmpTrapMappingDetailView from '@/components/snmp-traps/SnmpTrapMappingDetailView.vue'
import {
  useSnmpTrapMappings,
  useSnmpTrapMapping,
  useDeleteSnmpTrapMapping,
} from '@/queries/useSnmpTrapMappingQueries'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { oidSortKey } from '@/utils/snmpOid'

const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewMapping = computed(() => entityId.value === 'new')

const { data: mappingsData, isLoading, isFetching, isError, error, refetch } = useSnmpTrapMappings()

// Names only; without the event list (or the right to read it) the code still shows.
const { data: eventTemplatesData } = useEventTemplates()
const eventNames = computed(() => {
  const names = new Map()
  for (const t of eventTemplatesData.value ?? []) names.set(t.code, t.name)
  return names
})

const mappings = computed(() =>
  (mappingsData.value ?? []).map((m) => ({
    ...m,
    eventName: eventNames.value.get(m.eventCode) ?? '',
    oidSortKey: oidSortKey(m.oid),
  })),
)

const filterState = ref({ text: '', tokens: [] })
const filteredMappings = computed(() => {
  const search = filterState.value.text.toLowerCase()
  if (!search) return mappings.value
  // Stored OIDs have no leading dot; a typed one should still match.
  const oidSearch = search.replace(/^\./, '')
  return mappings.value.filter(
    (m) =>
      m.oid.includes(oidSearch) ||
      m.eventName.toLowerCase().includes(search) ||
      m.description.toLowerCase().includes(search),
  )
})

const columns = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 80 },
  { id: 'oid', field: 'oid', sortField: 'oidSortKey', label: 'OID', sortable: true, width: 280 },
  { id: 'event', field: 'eventName', label: 'Event', sortable: true, width: 240 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 380 },
  { id: 'actions', field: null, label: '', width: 48 },
]

const selectedIds = ref(new Set())

useWorkingState('snmp-trap-mappings', { view: { filterState }, object: { selectedIds } })
const selectedMappings = computed(() =>
  filteredMappings.value.filter((m) => selectedIds.value.has(m.id)),
)

watch(filteredMappings, (visibleMappings) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(visibleMappings.map((m) => m.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

const { mutate: deleteMapping } = useDeleteSnmpTrapMapping()

const mappingLabel = (m) => (m.description ? `"${m.description}"` : m.oid)

function confirmDelete(targets) {
  confirm.require({
    message:
      targets.length === 1
        ? `Delete SNMP trap ${mappingLabel(targets[0])}? This cannot be undone.`
        : `Delete ${targets.length} SNMP trap? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      for (const mapping of targets) {
        deleteMapping(mapping.id, {
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? `Failed to delete mapping ${mapping.id}.`,
              life: 5000,
            })
          },
        })
      }
      selectedIds.value = new Set()
    },
  })
}

const contextMenu = ref()

function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedIds.value.has(row.id) && selectedMappings.value.length > 1
    ? selectedMappings.value
    : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const multiple = selectedIds.value.has(row?.id) && selectedMappings.value.length > 1
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      disabled: multiple,
      command: () => openDetail(row.id),
    },
    { separator: true },
    {
      label: multiple ? `Delete (${selectedMappings.value.length})` : 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(contextTargets()),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

const mappingDetailId = computed(() => {
  if (!isDetailView.value || isNewMapping.value) return null
  const id = Number(entityId.value)
  return Number.isInteger(id) && id > 0 ? id : null
})

const {
  data: mappingDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useSnmpTrapMapping(mappingDetailId)

// Replace rather than push: Back should return to the list, not to an empty "new" form.
function onCreated(id) {
  router.replace(detailTarget(id))
}
</script>

<template>
  <div v-if="isDetailView" class="trap-mappings-detail">
    <SnmpTrapMappingDetailView
      v-if="isNewMapping"
      :mapping="null"
      @close="closeDetail"
      @created="onCreated"
    />

    <template v-else>
      <SnmpTrapMappingDetailView
        v-if="mappingDetail && mappingDetail.id === mappingDetailId"
        :key="mappingDetailId"
        :mapping="mappingDetail"
        @close="closeDetail"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading..." @back="closeDetail" />
        <div class="detail-loading">
          <Skeleton height="1.5rem" width="40%" class="mb-3" />
          <Skeleton height="1rem" width="60%" class="mb-2" />
          <Skeleton height="1rem" width="55%" class="mb-2" />
        </div>
      </template>

      <template v-else-if="isDetailError">
        <EntityDetailHeader title="Error" @back="closeDetail" />
        <div class="detail-message">
          <QueryErrorState :error="detailError" @retry="refetchDetail" />
        </div>
      </template>

      <template v-else>
        <EntityDetailHeader title="Not Found" @back="closeDetail" />
        <div class="detail-message">
          <p class="empty-message">SNMP trap not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="trap-mappings-section">
    <SectionHeader title="SNMP Traps" icon="pi pi-inbox">
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
          label="New Mapping"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openDetail('new')"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter by OID, event or description..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">
        {{ $plural(filteredMappings.length, 'mapping') }}
      </span>
    </div>

    <div v-if="selectedMappings.length" class="selection-bar">
      <span class="selection-count">
        {{ $plural(selectedMappings.length, 'mapping') }} selected
      </span>
      <Button
        label="Delete"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        outlined
        @click="confirmDelete(selectedMappings)"
      />
      <Button
        label="Clear"
        size="small"
        text
        severity="secondary"
        @click="selectedIds = new Set()"
      />
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredMappings"
      striped
      column-borders
      resize-fit
      selectable
      :selected-ids="selectedIds"
      sort-field="id"
      :sort-order="1"
      :page-size="50"
      storage-key="snmp-trap-mappings"
      class="mappings-table"
      :target-for="(row) => detailTarget(row.id)"
      @selection-change="selectedIds = $event"
      @row-click="(row) => openDetail(row.id)"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'id'" class="text-muted">{{ row.id }}</span>
        <span v-else-if="col.id === 'oid'" class="mono">{{ row.oid }}</span>
        <span v-else-if="col.id === 'event'" class="mono">
          <template v-if="row.eventName">{{ row.eventName }}</template>
          <span v-else class="text-muted">#{{ row.eventCode }}</span>
        </span>
        <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">
          {{ row.description || '-' }}
        </span>
        <Button
          v-else-if="col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onRowContextMenu({ event: $event, row })"
        />
      </template>
      <template #empty>
        <div v-if="mappings.length === 0" class="empty-message">
          No SNMP traps. They turn incoming traps into events, matched by exact OID or else by the
          longest matching OID prefix.
        </div>
        <div v-else class="empty-message">No mappings match the current filter.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.trap-mappings-section,
.trap-mappings-detail {
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
  width: 300px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.selection-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
}

.section-loading,
.detail-loading {
  padding: 1rem;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.detail-message {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.mappings-table {
  flex: 1;
  min-height: 0;
}

.mappings-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
