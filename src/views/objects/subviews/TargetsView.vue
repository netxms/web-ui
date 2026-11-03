<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import StatusTag from '@/components/common/StatusTag.vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import BindableObjectPickerDialog from '@/components/objects/BindableObjectPickerDialog.vue'
import TemplateRemovalDialog from '@/components/objects/TemplateRemovalDialog.vue'
import { useObjectChildren, useUnbindObjectChild, useZoneNames } from '@/queries/useObjectQueries'
import { useActions } from '@/composables/useActions'
import { useTemplateBinding } from '@/composables/useTemplateBinding'
import { useWorkingState } from '@/composables/useWorkingState'
import { TEMPLATE_APPLICABLE_CLASSES, getClassLabel } from '@/utils/objectUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const objectId = computed(() => props.object.id)

const {
  data: targets,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useObjectChildren(objectId, TEMPLATE_APPLICABLE_CLASSES)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

// Only for its pending flag; the composable owns the mutations.
const { isPending: isRemoving } = useUnbindObjectChild()
const { applyTemplate, removeTemplate } = useTemplateBinding()

const zoneNames = useZoneNames()

const filterText = ref('')

useWorkingState('targets', { view: { filterText } })
const filteredTargets = computed(() => {
  const list = targets.value ?? []
  if (!filterText.value) return list
  const search = filterText.value.toLowerCase()
  return list.filter((t) => {
    const zone = zoneNames.value.get(t.zoneUIN) ?? ''
    return (
      String(t.id).includes(search) ||
      (t.name ?? '').toLowerCase().includes(search) ||
      zone.toLowerCase().includes(search) ||
      (t.primaryName ?? '').toLowerCase().includes(search) ||
      (t.sysDescription ?? '').toLowerCase().includes(search)
    )
  })
})

const COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 60 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 220 },
  { id: 'class', field: 'class', label: 'Class', sortable: true, width: 120 },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 100 },
  { id: 'zone', field: 'zoneUIN', label: 'Zone', width: 140 },
  {
    id: 'primaryName',
    field: 'primaryName',
    label: 'Primary host name',
    sortable: true,
    width: 180,
  },
  {
    id: 'sysDescription',
    field: 'sysDescription',
    label: 'Description',
    sortable: true,
    width: 220,
  },
  { id: 'actions', field: null, label: '', sortable: false, width: 44 },
]

const pickerVisible = ref(false)

async function onApplySelected(selected) {
  if (!selected?.length) return
  const { applied, failed } = await applyTemplate(objectId.value, selected)
  if (applied > 0) {
    toast.add({
      severity: 'success',
      summary: applied === 1 ? 'Template applied' : `Template applied to ${applied} objects`,
      life: 2500,
    })
  }
  if (failed > 0) {
    toast.add({ severity: 'error', summary: 'Apply failed for one or more objects', life: 3000 })
  }
}

// Auto-open the picker when navigated here via the "Apply to..." action.
watch(
  () => route.query.action,
  (action) => {
    if (action === 'apply') {
      pickerVisible.value = true
      router.replace({ query: { ...route.query, action: undefined } })
    }
  },
  { immediate: true },
)

const removalDialogVisible = ref(false)
const removalTarget = ref(null)

function openRemovalDialog(target) {
  removalTarget.value = target
  removalDialogVisible.value = true
}

async function onConfirmRemoval(removeDci) {
  const target = removalTarget.value
  if (!target) return
  const { removed, failed } = await removeTemplate([objectId.value], [target], { removeDci })
  if (removed > 0) {
    toast.add({ severity: 'success', summary: 'Target removed', life: 2500 })
    removalDialogVisible.value = false
  }
  if (failed > 0) toast.add({ severity: 'error', summary: 'Remove failed', life: 3000 })
}

function goToObject(target) {
  router.push({ name: 'infrastructure', params: { objectId: target.id, viewId: 'status' } })
}

// Merged with the generic 'object' action registry so it stays in sync with the object tree's
// menu.
const contextMenu = ref()

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const rowActionContext = computed(() => {
  const data = contextMenu.value?.contextData
  return data ? { object: data, viewContext: 'templateTargets' } : null
})
const { menuItems: objectMenuItems } = useActions(rowActionContext, { domains: ['object'] })

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  if (!data) return []
  return [
    { label: 'Remove from template', icon: 'pi pi-times', command: () => openRemovalDialog(data) },
    { label: 'Go to Object', icon: 'pi pi-external-link', command: () => goToObject(data) },
    { separator: true },
    ...objectMenuItems.value,
  ]
})
</script>

<template>
  <div class="targets-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="targets-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter targets..."
          class="filter-input"
        />
      </IconField>
      <span v-if="!isLoading" class="targets-count">{{
        $plural(filteredTargets.length, 'target')
      }}</span>
      <Button
        label="Apply to..."
        icon="pi pi-arrow-right"
        size="small"
        severity="primary"
        class="apply-btn"
        @click="pickerVisible = true"
      />
    </div>

    <AppTable
      :columns="COLUMNS"
      :rows="filteredTargets"
      :loading="isLoading"
      :error="isError ? error : null"
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="business-service-targets"
      resize-fit
      @retry="refetch"
      @row-contextmenu="({ event, row }) => onActionsClick(event, row)"
    >
      <template #cell="{ col, row }">
        <template v-if="col.id === 'class'">{{ getClassLabel(row.class) }}</template>
        <template v-else-if="col.id === 'status'">
          <StatusTag :status="row.status" />
        </template>
        <template v-else-if="col.id === 'zone'">{{ zoneNames.get(row.zoneUIN) || '--' }}</template>
        <template v-else-if="col.id === 'actions'">
          <Button
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
      </template>
      <template #empty>
        <div class="empty-message">
          This template is not applied to any objects yet. Use "Apply to..." to add targets.
        </div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <BindableObjectPickerDialog
      v-model:visible="pickerVisible"
      :classes="TEMPLATE_APPLICABLE_CLASSES"
      @select="onApplySelected"
    />

    <TemplateRemovalDialog
      v-model:visible="removalDialogVisible"
      :target="removalTarget"
      :is-pending="isRemoving"
      @confirm="onConfirmRemoval"
    />
  </div>
</template>

<style scoped>
.targets-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.targets-toolbar {
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

.targets-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.apply-btn {
  margin-left: auto;
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
