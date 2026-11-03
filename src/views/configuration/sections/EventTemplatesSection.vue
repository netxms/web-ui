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
import EventTemplateDetailView from '@/components/event-templates/EventTemplateDetailView.vue'
import {
  useEventTemplates,
  useEventTemplate,
  useDeleteEventTemplate,
} from '@/queries/useEventTemplateQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { getStatusInfo } from '@/utils/objectUtils'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewTemplate = computed(() => entityId.value === 'new')

const SEVERITY_LABELS = {
  0: 'Normal',
  1: 'Warning',
  2: 'Minor',
  3: 'Major',
  4: 'Critical',
}

function severityLabel(value) {
  return SEVERITY_LABELS[value] ?? String(value)
}

function isUserDefined(template) {
  return template.code >= 100000
}

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const { data: templatesData, isLoading, isFetching, isError, error, refetch } = useEventTemplates()
const templates = computed(() => templatesData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('event-templates', { view: { filterState } })
const filteredTemplates = computed(() => {
  if (!filterState.value.text) return templates.value
  const search = filterState.value.text.toLowerCase()
  return templates.value.filter(
    (t) =>
      (t.name ?? '').toLowerCase().includes(search) ||
      (Array.isArray(t.tags) ? t.tags.join(',') : (t.tags ?? '')).toLowerCase().includes(search),
  )
})

const columns = [
  { id: 'code', field: 'code', label: 'Code', sortable: true, width: 70 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 220 },
  { id: 'severity', field: 'severity', label: 'Severity', sortable: true, width: 110 },
  { id: 'flags', field: 'flags', label: 'Flags', sortable: false, width: 80 },
  { id: 'message', field: 'message', label: 'Message', sortable: true, width: 280 },
  { id: 'tags', field: 'tags', label: 'Tags', sortable: false, width: 120 },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

function onRowClick(row) {
  openDetail(row.code)
}

const contextMenu = ref()

const { mutate: deleteTemplate } = useDeleteEventTemplate()

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => openDetail(data.code),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      disabled: data ? !isUserDefined(data) : true,
      command: () => confirmDelete(data),
    },
  ]
})

function confirmDelete(template) {
  confirm.require({
    message: `Delete event template "${template.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteTemplate(template.code, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Event template "${template.name}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          const detail =
            err.status === 400
              ? 'Cannot delete a system event template.'
              : (err.message ?? 'Failed to delete event template.')
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

const templateDetailCode = computed(() =>
  isDetailView.value && !isNewTemplate.value ? entityId.value : null,
)
const {
  data: templateDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useEventTemplate(templateDetailCode)
</script>

<template>
  <div v-if="isDetailView" class="event-templates-detail">
    <EventTemplateDetailView v-if="isNewTemplate" :template="null" @close="closeDetail" />

    <template v-else>
      <EventTemplateDetailView
        v-if="templateDetail"
        :template="templateDetail"
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
          <p class="empty-message">Event template not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="event-templates-section">
    <SectionHeader title="Event Templates" icon="pi pi-bell">
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
          label="Add Event Template"
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
        placeholder="Filter by name or tags..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredTemplates.length, 'template')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredTemplates"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="code"
      :sort-order="1"
      :page-size="50"
      :page-size-options="[50, 100, 200]"
      storage-key="event-templates"
      class="templates-table"
      :target-for="(row) => detailTarget(row.code)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'code'" class="code-cell">{{ row.code }}</span>
        <span v-else-if="col.id === 'name'" class="template-name">{{ row.name }}</span>
        <span
          v-else-if="col.id === 'severity'"
          class="sev-tag"
          :style="{
            background: getStatusInfo(row.severity).bgColor,
            color: getStatusInfo(row.severity).textColor,
          }"
        >
          {{ severityLabel(row.severity) }}
        </span>
        <template v-else-if="col.id === 'flags'">
          <span v-if="row.flags & 1" class="flag-tag">Log</span>
          <span v-else class="text-muted">—</span>
        </template>
        <span
          v-else-if="col.id === 'message'"
          :class="['message-text', { 'text-muted': !row.message }]"
          :title="row.message || undefined"
          >{{ row.message || '—' }}</span
        >
        <span v-else-if="col.id === 'tags'" :class="{ 'text-muted': !row.tags?.length }">
          {{ row.tags?.length ? row.tags.join(', ') : '—' }}
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
        <div class="empty-message">No event templates found.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.event-templates-section,
.event-templates-detail {
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

.templates-table {
  flex: 1;
  min-height: 0;
}

.templates-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.code-cell {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.template-name {
  font-weight: 500;
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

.message-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sev-tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: var(--p-border-radius-sm, 4px);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
}

.flag-tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: var(--p-border-radius-sm, 4px);
  font-size: 0.8125rem;
  border: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
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
