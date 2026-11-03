<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import EventForwarderDetailView from '@/components/event-forwarders/EventForwarderDetailView.vue'
import {
  useEventForwarders,
  useEventForwarder,
  useDeleteEventForwarder,
} from '@/queries/useEventForwarderQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { eventForwarderStatus, sendStatusLabel } from '@/utils/eventForwarderDisplay'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

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

function onRowClick(row) {
  openDetail(row.name)
}

/** The forwarder name is the route param, so a rename has to move the URL with it. */
function onSaved(name) {
  if (name !== entityId.value) openDetail(name)
}

const contextMenu = ref()

const { mutate: deleteForwarder } = useDeleteEventForwarder()

const contextMenuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => openDetail(contextMenu.value.contextData.name),
  },
  { separator: true },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => confirmDelete(contextMenu.value.contextData),
  },
])

function confirmDelete(forwarder) {
  confirm.require({
    message: `Delete event forwarder "${forwarder.name}"?`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteForwarder(forwarder.name, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Event forwarder "${forwarder.name}" deleted.`,
            life: 3000,
          })
          if (isDetailView.value) closeDetail()
        },
        onError: (err) => {
          // The server refuses to delete a forwarder still referenced by a server action.
          const detail =
            err.status === 409
              ? `"${forwarder.name}" is used by one or more server actions. Remove it from those actions first.`
              : (err.message ?? 'Failed to delete event forwarder.')
          toast.add({ severity: 'error', summary: 'Delete Failed', detail, life: 6000 })
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

const forwarderDetailName = computed(() =>
  isDetailView.value && !isNewForwarder.value ? entityId.value : null,
)
const {
  data: forwarderDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useEventForwarder(forwarderDetailName)
</script>

<template>
  <div v-if="isDetailView" class="event-forwarders-detail">
    <EventForwarderDetailView
      v-if="isNewForwarder"
      :forwarder="null"
      @close="closeDetail"
      @created="(name) => openDetail(name)"
    />

    <template v-else>
      <EventForwarderDetailView
        v-if="forwarderDetail"
        :forwarder="forwarderDetail"
        @close="closeDetail"
        @saved="onSaved"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading…" @back="closeDetail" />
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
          <p class="empty-message">Event forwarder not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve filter state -->
  <div v-show="!isDetailView" class="event-forwarders-section">
    <SectionHeader title="Event Forwarders" icon="pi pi-share-alt">
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
          label="Add Forwarder"
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
        placeholder="Filter event forwarders..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredForwarders.length, 'event forwarder')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredForwarders"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="event-forwarders"
      class="forwarders-table"
      :target-for="(row) => detailTarget(row.name)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
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
        <span v-else-if="col.id === 'messageCount'">{{ row.messageCount ?? 0 }}</span>
        <span v-else-if="col.id === 'failureCount'" :class="{ 'text-danger': row.failureCount }">{{
          row.failureCount ?? 0
        }}</span>
        <span v-else-if="col.id === 'droppedCount'" :class="{ 'text-danger': row.droppedCount }">{{
          row.droppedCount ?? 0
        }}</span>
        <span v-else-if="col.id === 'queueSize'">{{ row.queueSize ?? 0 }}</span>
        <span v-else-if="col.id === 'sendStatus'">{{ sendStatusLabel(row.sendStatus) }}</span>
        <span v-else-if="col.id === 'errorMessage'" class="error-cell">{{
          row.errorMessage || ''
        }}</span>
        <Button
          v-else-if="col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onActionsClick($event, row)"
        />
      </template>
      <template #empty>
        <div class="empty-message">
          No event forwarders configured. An event forwarder relays events to an external system and
          can then be selected by a "Forward event" server action.
        </div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.event-forwarders-section,
.event-forwarders-detail {
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

.section-loading,
.detail-loading {
  padding: 1rem;
}

.forwarders-table {
  flex: 1;
  min-height: 0;
}

.forwarders-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

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

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
  max-width: 32rem;
  margin: 0 auto;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
