<script setup>
import { ref, computed } from 'vue'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import ObjectToolDetailView from '@/components/object-tools/ObjectToolDetailView.vue'
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
const confirmDelete = useConfirmDelete()
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

const { mutateAsync: deleteTool } = useDeleteObjectTool()
const { mutate: enableTool } = useEnableObjectTool()
const { mutate: disableTool } = useDisableObjectTool()

async function onDelete(tool) {
  const deleted = await confirmDelete({
    message: `Delete tool "${tool.name}"? This cannot be undone.`,
    run: () => deleteTool(tool.id),
    successDetail: `Tool "${tool.name}" deleted.`,
    failureDetail: 'Failed to delete tool.',
  })
  if (deleted && entityId.value === String(tool.id)) closeDetail()
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

function menuItems(tool) {
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
      command: () => onDelete(tool),
    },
  ]
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
  error: detailError,
  refetch: refetchDetail,
} = useObjectTool(numericEntityId)

const detailTool = computed(() => {
  if (isNewTool.value) return null
  return toolDetail.value ?? null
})
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Object Tools"
    icon="pi pi-wrench"
    :add-label="can.manageTools ? 'New Tool' : null"
    filter-placeholder="Filter tools..."
    count-noun="tool"
    :columns="columns"
    :rows="filteredTools"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No object tools found."
    :menu-items="menuItems"
    sort-field="name"
    :sort-order="1"
    storage-key="object-tools"
    :target-for="(row) => detailTarget(row.id)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <EntityDetailState
        v-if="isNewTool && !can.manageTools"
        restricted-right="manageTools"
        restricted-title="New Object Tool"
        restricted-subtitle="Object Tool"
        @back="closeDetail"
      />
      <EntityDetailState v-else-if="!isNewTool && isDetailLoading" loading @back="closeDetail" />
      <ObjectToolDetailView
        v-else-if="isNewTool || toolDetail"
        :tool="detailTool"
        :readonly="!can.manageTools"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Object tool not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

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
    </template>
  </EntityListSection>
</template>

<style scoped>
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
</style>
