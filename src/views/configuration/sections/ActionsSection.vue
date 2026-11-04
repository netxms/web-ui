<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import ServerActionDetailView from '@/components/server-actions/ServerActionDetailView.vue'
import {
  useServerActions,
  useServerAction,
  useDeleteServerAction,
} from '@/queries/useServerActionQueries'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'

const route = useRoute()
const router = useRouter()
const confirmDelete = useConfirmDelete()

// Reading takes this right or the EPP right; changing takes this one (`actions.cpp`).
const { can } = usePermissions()

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

const { mutateAsync: deleteAction } = useDeleteServerAction()

function menuItems(action) {
  return [
    {
      label: can.value.manageActions ? 'Edit' : 'View',
      icon: can.value.manageActions ? 'pi pi-pencil' : 'pi pi-eye',
      command: () => openDetail(action.id),
    },
    { separator: true, visible: can.value.manageActions },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      visible: can.value.manageActions,
      command: () => onDelete(action),
    },
  ]
}

function onDelete(action) {
  confirmDelete({
    message: `Delete action "${action.name}"? This cannot be undone.`,
    run: () => deleteAction(action.id),
    successDetail: `Action "${action.name}" deleted.`,
    failureDetail: 'Failed to delete action.',
    errorDetail: (err) =>
      err.status === 409
        ? 'Action is used in an event processing policy rule and cannot be deleted.'
        : null,
  })
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
  error: detailError,
  refetch: refetchDetail,
} = useServerAction(actionDetailId)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Actions"
    icon="pi pi-bolt"
    :add-label="can.manageActions ? 'Add Action' : null"
    filter-placeholder="Filter actions..."
    count-noun="action"
    :columns="columns"
    :rows="filteredActions"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No server actions found."
    :menu-items="menuItems"
    sort-field="name"
    :sort-order="1"
    storage-key="server-actions"
    :target-for="(row) => detailTarget(row.id)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <EntityDetailState
        v-if="isNewAction && !can.manageActions"
        restricted-right="manageActions"
        restricted-title="New Action"
        restricted-subtitle="Server Action"
        @back="closeDetail"
      />
      <ServerActionDetailView v-else-if="isNewAction" :action="null" @close="closeDetail" />
      <ServerActionDetailView
        v-else-if="actionDetail"
        :action="actionDetail"
        :readonly="!can.manageActions"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Action not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

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
      <span v-else :class="{ 'text-muted': !row[col.field] }">{{ row[col.field] || '-' }}</span>
    </template>
  </EntityListSection>
</template>

<style scoped>
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
</style>
