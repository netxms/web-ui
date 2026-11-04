<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import EventForwarderDetailView from '@/components/event-forwarders/EventForwarderDetailView.vue'
import {
  useEventForwarders,
  useEventForwarder,
  useDeleteEventForwarder,
} from '@/queries/useEventForwarderQueries'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { eventForwarderStatus, sendStatusLabel } from '@/utils/eventForwarderDisplay'

const route = useRoute()
const router = useRouter()
const confirmDelete = useConfirmDelete()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

/** Forwarders are keyed by name; 'new' is the create sentinel. */
const isNewForwarder = computed(() => entityId.value === 'new')

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const {
  data: forwardersData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useEventForwarders()
const forwarders = computed(() => forwardersData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('event-forwarders', { view: { filterState } })
const filteredForwarders = computed(() => {
  if (!filterState.value.text) return forwarders.value
  const search = filterState.value.text.toLowerCase()
  return forwarders.value.filter(
    (f) =>
      (f.name ?? '').toLowerCase().includes(search) ||
      (f.description ?? '').toLowerCase().includes(search) ||
      (f.driverName ?? '').toLowerCase().includes(search),
  )
})

// Column order follows the legacy EventForwarders view.
const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 160 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 220 },
  { id: 'driverName', field: 'driverName', label: 'Driver', sortable: true, width: 110 },
  { id: 'status', field: 'driverInitialized', label: 'Status', sortable: true, width: 130 },
  { id: 'messageCount', field: 'messageCount', label: 'Events', sortable: true, width: 90 },
  { id: 'failureCount', field: 'failureCount', label: 'Failures', sortable: true, width: 90 },
  { id: 'droppedCount', field: 'droppedCount', label: 'Dropped', sortable: true, width: 90 },
  { id: 'queueSize', field: 'queueSize', label: 'Queue', sortable: true, width: 80 },
  { id: 'sendStatus', field: 'sendStatus', label: 'Last status', sortable: true, width: 100 },
  {
    id: 'errorMessage',
    field: 'errorMessage',
    label: 'Error message',
    sortable: false,
    width: 260,
  },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

/** The forwarder name is the route param, so a rename has to move the URL with it. */
function onSaved(name) {
  if (name !== entityId.value) openDetail(name)
}

const { mutateAsync: deleteForwarder } = useDeleteEventForwarder()

function menuItems(forwarder) {
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => openDetail(forwarder.name) },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => onDelete(forwarder),
    },
  ]
}

async function onDelete(forwarder) {
  const deleted = await confirmDelete({
    message: `Delete event forwarder "${forwarder.name}"?`,
    run: () => deleteForwarder(forwarder.name),
    successDetail: `Event forwarder "${forwarder.name}" deleted.`,
    failureDetail: 'Failed to delete event forwarder.',
    // The server refuses to delete a forwarder still referenced by a server action.
    errorDetail: (err) =>
      err.status === 409
        ? `"${forwarder.name}" is used by one or more server actions. Remove it from those actions first.`
        : null,
  })
  if (deleted && isDetailView.value) closeDetail()
}

const forwarderDetailName = computed(() =>
  isDetailView.value && !isNewForwarder.value ? entityId.value : null,
)
const {
  data: forwarderDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useEventForwarder(forwarderDetailName)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Event Forwarders"
    icon="pi pi-share-alt"
    add-label="Add Forwarder"
    filter-placeholder="Filter event forwarders..."
    count-noun="event forwarder"
    :columns="columns"
    :rows="filteredForwarders"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text='No event forwarders configured. An event forwarder relays events to an external system and can then be selected by a "Forward event" server action.'
    :menu-items="menuItems"
    sort-field="name"
    :sort-order="1"
    storage-key="event-forwarders"
    :target-for="(row) => detailTarget(row.name)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.name)"
  >
    <template #detail>
      <EventForwarderDetailView
        v-if="isNewForwarder"
        :forwarder="null"
        @close="closeDetail"
        @created="(name) => openDetail(name)"
      />
      <EventForwarderDetailView
        v-else-if="forwarderDetail"
        :forwarder="forwarderDetail"
        @close="closeDetail"
        @saved="onSaved"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Event forwarder not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #cell="{ col, row }">
      <span v-if="col.id === 'name'" class="forwarder-name">{{ row.name }}</span>
      <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">{{
        row.description || '-'
      }}</span>
      <Tag v-else-if="col.id === 'driverName'" :value="row.driverName" severity="info" outlined />
      <span
        v-else-if="col.id === 'status'"
        class="status-badge"
        :class="eventForwarderStatus(row).class"
      >
        <i :class="eventForwarderStatus(row).icon" />
        {{ eventForwarderStatus(row).label }}
      </span>
      <span v-else-if="col.id === 'failureCount'" :class="{ 'text-danger': row.failureCount }">{{
        row.failureCount ?? 0
      }}</span>
      <span v-else-if="col.id === 'droppedCount'" :class="{ 'text-danger': row.droppedCount }">{{
        row.droppedCount ?? 0
      }}</span>
      <span v-else-if="col.id === 'sendStatus'">{{ sendStatusLabel(row.sendStatus) }}</span>
      <span v-else-if="col.id === 'errorMessage'" class="error-cell">{{
        row.errorMessage || ''
      }}</span>
      <span v-else-if="col.id === 'messageCount' || col.id === 'queueSize'">{{
        row[col.field] ?? 0
      }}</span>
    </template>
  </EntityListSection>
</template>

<style scoped>
.forwarder-name {
  font-weight: 500;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
}

.status-ok {
  color: var(--p-green-600);
}

.status-warn {
  color: var(--p-orange-600);
}

.status-error {
  color: var(--p-red-500);
}

.error-cell,
.text-danger {
  color: var(--p-red-500);
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
