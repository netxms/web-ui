<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
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

const { mutateAsync: deleteMapping } = useDeleteSnmpTrapMapping()

const mappingLabel = (m) => (m.description ? `"${m.description}"` : m.oid)

function confirmDelete(targets) {
  confirm.require({
    message:
      targets.length === 1
        ? `Delete SNMP trap ${mappingLabel(targets[0])}? This cannot be undone.`
        : `Delete ${targets.length} SNMP traps? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      // One observer runs every delete and keeps only the last call's callbacks, so each
      // failure is caught on its own promise.
      for (const mapping of targets) {
        deleteMapping(mapping.id).catch((err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? `Failed to delete mapping ${mapping.id}.`,
            life: 5000,
          })
        })
      }
      selectedIds.value = new Set()
    },
  })
}

function menuItems(row) {
  const multiple = selectedIds.value.has(row.id) && selectedMappings.value.length > 1
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
      command: () => confirmDelete(multiple ? selectedMappings.value : [row]),
    },
  ]
}

const mappingDetailId = computed(() => {
  if (!isDetailView.value || isNewMapping.value) return null
  const id = Number(entityId.value)
  return Number.isInteger(id) && id > 0 ? id : null
})

const {
  data: mappingDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useSnmpTrapMapping(mappingDetailId)

// Replace rather than push: Back should return to the list, not to an empty "new" form.
function onCreated(id) {
  router.replace(detailTarget(id))
}
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="SNMP Traps"
    icon="pi pi-inbox"
    add-label="New Mapping"
    filter-placeholder="Filter by OID, event or description..."
    count-noun="mapping"
    :columns="columns"
    :rows="filteredMappings"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    :menu-items="menuItems"
    selectable
    :selected-ids="selectedIds"
    sort-field="id"
    :sort-order="1"
    storage-key="snmp-trap-mappings"
    :target-for="(row) => detailTarget(row.id)"
    @selection-change="selectedIds = $event"
    @refresh="refetch"
    @add="openDetail('new')"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <SnmpTrapMappingDetailView
        v-if="isNewMapping"
        :mapping="null"
        @close="closeDetail"
        @created="onCreated"
      />
      <SnmpTrapMappingDetailView
        v-else-if="mappingDetail && mappingDetail.id === mappingDetailId"
        :key="mappingDetailId"
        :mapping="mappingDetail"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="SNMP trap not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #before-table>
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
    </template>

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
    </template>

    <template #empty>
      <template v-if="mappings.length === 0">
        No SNMP traps. They turn incoming traps into events, matched by exact OID or else by the
        longest matching OID prefix.
      </template>
      <template v-else>No mappings match the current filter.</template>
    </template>
  </EntityListSection>
</template>

<style scoped>
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

.mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
