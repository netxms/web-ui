<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import EventTemplateDetailView from '@/components/event-templates/EventTemplateDetailView.vue'
import {
  useEventTemplates,
  useEventTemplate,
  useDeleteEventTemplate,
} from '@/queries/useEventTemplateQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'
import { getStatusInfo } from '@/utils/objectUtils'

const route = useRoute()
const router = useRouter()
const confirmDelete = useConfirmDelete()

// Reading takes any of three rights; changing takes this one (`events.cpp`).
const { can } = usePermissions()

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

const { mutateAsync: deleteTemplate } = useDeleteEventTemplate()

function menuItems(template) {
  const canEdit = can.value.editEventDb
  return [
    {
      label: canEdit ? 'Edit' : 'View',
      icon: canEdit ? 'pi pi-pencil' : 'pi pi-eye',
      command: () => openDetail(template.code),
    },
    { separator: true, visible: canEdit },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      visible: canEdit,
      disabled: !isUserDefined(template),
      command: () => onDelete(template),
    },
  ]
}

function onDelete(template) {
  confirmDelete({
    message: `Delete event template "${template.name}"? This cannot be undone.`,
    run: () => deleteTemplate(template.code),
    successDetail: `Event template "${template.name}" deleted.`,
    failureDetail: 'Failed to delete event template.',
    errorDetail: (err) => (err.status === 400 ? 'Cannot delete a system event template.' : null),
  })
}

const templateDetailCode = computed(() =>
  isDetailView.value && !isNewTemplate.value ? entityId.value : null,
)
const {
  data: templateDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useEventTemplate(templateDetailCode)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Event Templates"
    icon="pi pi-bell"
    :add-label="can.editEventDb ? 'Add Event Template' : null"
    filter-placeholder="Filter by name or tags..."
    count-noun="template"
    :columns="columns"
    :rows="filteredTemplates"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No event templates found."
    :menu-items="menuItems"
    sort-field="code"
    :sort-order="1"
    :page-size-options="[50, 100, 200]"
    storage-key="event-templates"
    :target-for="(row) => detailTarget(row.code)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.code)"
  >
    <template #detail>
      <EntityDetailState
        v-if="isNewTemplate && !can.editEventDb"
        restricted-right="editEventDb"
        restricted-title="New Event Template"
        restricted-subtitle="Event Template"
        @back="closeDetail"
      />
      <EventTemplateDetailView v-else-if="isNewTemplate" :template="null" @close="closeDetail" />
      <EventTemplateDetailView
        v-else-if="templateDetail"
        :template="templateDetail"
        :readonly="!can.editEventDb"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Event template not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

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
    </template>
  </EntityListSection>
</template>

<style scoped>
.code-cell {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.template-name {
  font-weight: 500;
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
</style>
