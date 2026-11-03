<script setup>
import { ref, computed } from 'vue'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import AppTable from '@/components/common/AppTable.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import ObjectToolDetailView from '@/components/object-tools/ObjectToolDetailView.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useRoute, useRouter } from 'vue-router'
import {
  useObjectTools,
  useObjectTool,
  useDeleteObjectTool,
  useEnableObjectTool,
  useDisableObjectTool,
} from '@/queries/useObjectToolQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'
import { TOOL_TYPE_LABELS } from '@/utils/objectToolUtils'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

// Anyone may read the tools their access list allows; only changing them takes this right
// (`objtools.cpp`).
const { can } = usePermissions()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewTool = computed(() => entityId.value === 'new')

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const { data: objectToolsData, isLoading, isFetching, isError, error, refetch } = useObjectTools()
const objectTools = computed(() => objectToolsData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('object-tools', { view: { filterState } })
const filteredTools = computed(() => {
  if (!filterState.value.text) return objectTools.value
  const search = filterState.value.text.toLowerCase()
  return objectTools.value.filter(
    (tool) =>
      (tool.name ?? '').toLowerCase().includes(search) ||
      (tool.commandName ?? '').toLowerCase().includes(search),
  )
})

function formatToolType(type) {
  return TOOL_TYPE_LABELS[type] ?? type
}

function onRowClick(row) {
  openDetail(row.id)
}

const contextMenu = ref()

const { mutate: deleteTool } = useDeleteObjectTool()
const { mutate: enableTool } = useEnableObjectTool()
const { mutate: disableTool } = useDisableObjectTool()

function confirmDelete(tool) {
  confirm.require({
    message: `Delete tool "${tool.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteTool(tool.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Tool "${tool.name}" deleted.`,
            life: 3000,
          })
          if (entityId.value === String(tool.id)) closeDetail()
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete tool.',
            life: 5000,
          })
        },
      })
    },
  })
}

function toggleEnabled(tool) {
  const mutate = tool.flags?.disabled ? enableTool : disableTool
  const action = tool.flags?.disabled ? 'enabled' : 'disabled'
  mutate(tool.id, {
    onSuccess: () => {
      toast.add({
        severity: 'success',
        summary: 'Updated',
        detail: `Tool "${tool.name}" ${action}.`,
        life: 3000,
      })
    },
    onError: (err) => {
      toast.add({
        severity: 'error',
        summary: 'Failed',
        detail: err.message ?? `Failed to ${action === 'enabled' ? 'enable' : 'disable'} tool.`,
        life: 5000,
      })
    },
  })
}

const contextMenuItems = computed(() => {
  const tool = contextMenu.value?.contextData
  const canManage = can.value.manageTools
  return [
    {
      label: canManage ? 'Edit' : 'View',
      icon: canManage ? 'pi pi-pencil' : 'pi pi-eye',
      command: () => openDetail(tool?.id),
    },
    {
      label: tool?.flags?.disabled ? 'Enable' : 'Disable',
      icon: tool?.flags?.disabled ? 'pi pi-play' : 'pi pi-pause',
      visible: canManage,
      command: () => toggleEnabled(tool),
    },
    { separator: true, visible: canManage },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      visible: canManage,
      command: () => confirmDelete(tool),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 150 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 80 },
  { id: 'commandName', field: 'commandName', label: 'Command', sortable: true, width: 300 },
  { id: 'toggle', field: 'toggle', label: '', width: 35 },
  { id: 'actions', field: 'actions', label: '', width: 35 },
]

const numericEntityId = computed(() => {
  const id = entityId.value
  if (!id || id === 'new') return null
  const n = Number(id)
  return Number.isNaN(n) ? null : n
})

const {
  data: toolDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useObjectTool(numericEntityId)

const detailTool = computed(() => {
  if (isNewTool.value) return null
  return toolDetail.value ?? null
})
</script>

<template>
  <div v-if="isDetailView" class="object-tools-detail">
    <template v-if="isNewTool && !can.manageTools">
      <EntityDetailHeader title="New Object Tool" subtitle="Object Tool" @back="closeDetail" />
      <RestrictedState right="manageTools" />
    </template>
    <div v-else-if="!isNewTool && isDetailLoading" class="detail-loading">
      <Skeleton height="2rem" width="40%" class="mb-3" />
      <Skeleton height="1rem" width="60%" class="mb-2" />
      <Skeleton height="1rem" width="55%" class="mb-2" />
      <Skeleton height="1rem" width="45%" class="mb-2" />
    </div>
    <ObjectToolDetailView
      v-else-if="isNewTool || toolDetail"
      :tool="detailTool"
      :readonly="!can.manageTools"
      @close="closeDetail"
    />
    <QueryErrorState v-else-if="isDetailError" :error="detailError" @retry="refetchDetail" />
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="object-tools-section">
    <SectionHeader title="Object Tools" icon="pi pi-wrench">
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
          v-if="can.manageTools"
          label="New Tool"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openNew"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput v-model="filterState" placeholder="Filter tools..." class="filter-input" />
      <span v-if="!isLoading" class="item-count">{{ $plural(filteredTools.length, 'tool') }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredTools"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="object-tools"
      class="tools-table"
      :target-for="(row) => detailTarget(row.id)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span
          v-if="col.id === 'name'"
          class="tool-name"
          :class="{ 'tool-disabled': row.flags?.disabled }"
          >{{ row.name }}</span
        >
        <Tag
          v-else-if="col.id === 'type'"
          :value="formatToolType(row.type)"
          severity="info"
          outlined
          :class="{ 'tool-cell-disabled': row.flags?.disabled }"
        />
        <span
          v-else-if="col.id === 'commandName'"
          :class="{ 'text-muted': !row.commandName, 'tool-cell-disabled': row.flags?.disabled }"
        >
          {{ row.commandName || row.commandShortName || '-' }}
        </span>
        <ToggleSwitch
          v-else-if="col.id === 'toggle'"
          :model-value="!row.flags?.disabled"
          :disabled="!can.manageTools"
          @update:model-value="toggleEnabled(row)"
          @click.stop
        />
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
        <div class="empty-message">No object tools found.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.object-tools-section,
.object-tools-detail {
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

.tools-table {
  flex: 1;
  min-height: 0;
}

.tools-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.tool-name {
  font-weight: 500;
}

.tool-disabled {
  opacity: 0.45;
  text-decoration: line-through;
}

.tool-cell-disabled {
  opacity: 0.45;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
