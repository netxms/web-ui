<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import AppTable from '@/components/common/AppTable.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import ServerActionDetailView from '@/components/server-actions/ServerActionDetailView.vue'
import {
  useServerActions,
  useServerAction,
  useDeleteServerAction,
} from '@/queries/useServerActionQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewAction = computed(() => entityId.value === 'new')

const ACTION_TYPE_LABELS = {
  0: 'Local Command',
  1: 'Agent Command',
  3: 'Notification',
  4: 'Forward Action',
  5: 'NXSL Script',
  7: 'SSH Command',
}

function actionTypeLabel(type) {
  return ACTION_TYPE_LABELS[type] ?? String(type)
}

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const { data: actionsData, isLoading, isFetching, isError, error, refetch } = useServerActions()
const actions = computed(() => actionsData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('server-actions', { view: { filterState } })
const filteredActions = computed(() => {
  if (!filterState.value.text) return actions.value
  const search = filterState.value.text.toLowerCase()
  return actions.value.filter(
    (a) =>
      (a.name ?? '').toLowerCase().includes(search) ||
      actionTypeLabel(a.type).toLowerCase().includes(search) ||
      (a.notificationChannelName ?? '').toLowerCase().includes(search),
  )
})

function onRowClick(row) {
  openDetail(row.id)
}

const contextMenu = ref()

const { mutate: deleteAction } = useDeleteServerAction()

const contextMenuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => openDetail(contextMenu.value.contextData.id),
  },
  { separator: true },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => confirmDelete(contextMenu.value.contextData),
  },
])

function confirmDelete(action) {
  confirm.require({
    message: `Delete action "${action.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteAction(action.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Action "${action.name}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          const detail =
            err.status === 409
              ? 'Action is used in an event processing policy rule and cannot be deleted.'
              : (err.message ?? 'Failed to delete action.')
          toast.add({ severity: 'error', summary: 'Delete Failed', detail, life: 5000 })
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

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 180 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 130 },
  {
    id: 'recipientAddress',
    field: 'recipientAddress',
    label: 'Recipient',
    sortable: true,
    width: 150,
  },
  { id: 'emailSubject', field: 'emailSubject', label: 'Subject', sortable: true, width: 150 },
  { id: 'data', field: 'data', label: 'Data', sortable: false, width: 150 },
  {
    id: 'notificationChannelName',
    field: 'notificationChannelName',
    label: 'Channel',
    sortable: true,
    width: 130,
  },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

const actionDetailId = computed(() =>
  isDetailView.value && !isNewAction.value ? entityId.value : null,
)
const {
  data: actionDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useServerAction(actionDetailId)
</script>

<template>
  <div v-if="isDetailView" class="actions-detail">
    <ServerActionDetailView v-if="isNewAction" :action="null" @close="closeDetail" />

    <template v-else>
      <ServerActionDetailView
        v-if="actionDetail"
        :action="actionDetail"
        @close="closeDetail"
        @saved="() => {}"
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
          <p class="empty-message">Action not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="actions-section">
    <SectionHeader title="Actions" icon="pi pi-bolt">
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
          label="Add Action"
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
        placeholder="Filter actions..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredActions.length, 'action')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredActions"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="server-actions"
      class="actions-table"
      :target-for="(row) => detailTarget(row.id)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span
          v-if="col.id === 'name'"
          class="action-name"
          :class="{ 'action-disabled': row.isDisabled }"
          >{{ row.name }}</span
        >
        <Tag
          v-else-if="col.id === 'type'"
          :value="actionTypeLabel(row.type)"
          severity="info"
          outlined
        />
        <span
          v-else-if="col.id === 'recipientAddress'"
          :class="{ 'text-muted': !row.recipientAddress }"
          >{{ row.recipientAddress || '-' }}</span
        >
        <span v-else-if="col.id === 'emailSubject'" :class="{ 'text-muted': !row.emailSubject }">{{
          row.emailSubject || '-'
        }}</span>
        <span v-else-if="col.id === 'data'" :class="{ 'text-muted': !row.data }">{{
          row.data || '-'
        }}</span>
        <span
          v-else-if="col.id === 'notificationChannelName'"
          :class="{ 'text-muted': !row.notificationChannelName }"
          >{{ row.notificationChannelName || '-' }}</span
        >
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
        <div class="empty-message">No server actions found.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.actions-section,
.actions-detail {
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

.actions-table {
  flex: 1;
  min-height: 0;
}

.actions-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.action-name {
  font-weight: 500;
}

.action-disabled {
  color: var(--p-text-muted-color);
  text-decoration: line-through;
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
