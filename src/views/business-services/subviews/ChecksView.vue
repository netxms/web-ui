<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import DciPickerDialog from '@/components/objects/DciPickerDialog.vue'
import BusinessServiceCheckDialog from '@/components/business-services/BusinessServiceCheckDialog.vue'
import {
  useBusinessServiceChecks,
  useCreateBusinessServiceCheck,
  useCreateBusinessServiceChecks,
  useDeleteBusinessServiceChecks,
} from '@/queries/useBusinessServiceQueries'
import { useObjectsByIds, useDciValues } from '@/queries/useObjectQueries'
import { MODERATE_TIER } from '@/queries/config'
import { hasObjectRight } from '@/auth/objectAccessRights'
import {
  checkOrigin,
  checkState,
  checkTypeLabel,
  duplicateCheckPayload,
} from '@/utils/businessServiceChecks'
import { objectTarget } from '@/utils/routeTargets'
import { useWorkingState } from '@/composables/useWorkingState'

/**
 * Checks created from a prototype or by auto-binding cannot be modified; legacy disables Edit,
 * here they open read-only so their settings can still be read.
 */
const props = defineProps({
  object: { type: Object, required: true },
})

const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const objectId = computed(() => props.object.id)
const isPrototype = computed(() => props.object.class === 'BusinessServicePrototype')
const canModify = computed(() => hasObjectRight(props.object, 'MODIFY'))

const {
  data: checksData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useBusinessServiceChecks(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const checks = computed(() => checksData.value ?? [])

const objectIds = computed(() => {
  const ids = new Set()
  for (const check of checks.value) {
    if (check.relatedObjectId) ids.add(check.relatedObjectId)
    if (checkOrigin(check) === 'prototype') ids.add(check.prototypeServiceId)
  }
  return [...ids]
})
const { objectsById } = useObjectsByIds(objectIds)

function checkDci(check) {
  return check.type === 'dci' && check.relatedObjectId && check.relatedDciId
    ? { objectId: check.relatedObjectId, dciId: check.relatedDciId }
    : null
}
// Only names are needed, so no polling.
const { valueOf: dciValueOf } = useDciValues(() => checks.value.map(checkDci), {
  tier: MODERATE_TIER,
})

const rows = computed(() =>
  checks.value.map((check) => {
    const object = check.relatedObjectId ? objectsById.value.get(check.relatedObjectId) : null
    const origin = checkOrigin(check)
    const prototype =
      origin === 'prototype' ? objectsById.value.get(check.prototypeServiceId) : null
    const dci = dciValueOf(checkDci(check))
    const state = checkState(check.status)

    let originName = ''
    if (origin === 'autobind') originName = 'Auto-binding'
    else if (origin === 'prototype') originName = prototype?.name ?? `[${check.prototypeServiceId}]`

    return {
      ...check,
      object,
      objectName: check.relatedObjectId ? (object?.name ?? `[${check.relatedObjectId}]`) : '',
      dciName:
        check.type === 'dci' && check.relatedDciId
          ? dci?.description || dci?.name || `[${check.relatedDciId}]`
          : '',
      typeLabel: checkTypeLabel(check.type),
      stateLabel: state.label,
      stateStatus: state.status,
      origin,
      prototype,
      originName,
    }
  }),
)

const filterState = ref({ text: '', tokens: [] })

/** Legacy BusinessServiceCheckFilter fields, plus the origin. */
const filteredRows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  if (!search) return rows.value
  return rows.value.filter((row) =>
    [
      row.description,
      row.typeLabel,
      row.stateLabel,
      row.objectName,
      row.dciName,
      row.failureReason,
      row.originName,
    ].some((text) => text.toLowerCase().includes(search)),
  )
})

const selectedIds = ref(new Set())

useWorkingState('checks', { view: { filterState }, object: { selectedIds } })

const selectedRows = computed(() => filteredRows.value.filter((r) => selectedIds.value.has(r.id)))

// A bulk action must not reach rows the filter has hidden, or checks deleted meanwhile.
watch(filteredRows, (visibleRows) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(visibleRows.map((r) => r.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

function clearSelection() {
  selectedIds.value = new Set()
}

const dialogVisible = ref(false)
const editedCheck = ref(null)

const dialogReadonly = computed(
  () => !!editedCheck.value && (editedCheck.value.autoCreated || !canModify.value),
)

const readonlyReason = computed(() => {
  const check = editedCheck.value
  if (!check) return ''
  if (check.origin === 'autobind') {
    return 'Created by auto-binding, so it cannot be edited. Change the auto-bind settings in Properties, or duplicate the check to get one you can edit.'
  }
  if (check.origin === 'prototype') {
    return `Created from prototype ${check.originName}, so it cannot be edited here. Edit the check in the prototype, or duplicate it to get one you can edit.`
  }
  return 'You do not have permission to modify this business service.'
})

function openCreate() {
  editedCheck.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  if (!row) return
  editedCheck.value = row
  dialogVisible.value = true
}

const { mutate: createCheck } = useCreateBusinessServiceCheck()

function duplicate(row) {
  createCheck(
    { objectId: objectId.value, data: duplicateCheckPayload(row) },
    {
      onError: (err) => {
        // 403 is already toasted by api/client.js.
        if (err?.status === 403) return
        toast.add({
          severity: 'error',
          summary: 'Could not duplicate check',
          detail: err?.message,
          life: 5000,
        })
      },
    },
  )
}

const { mutate: createChecks } = useCreateBusinessServiceChecks()

const objectPickerVisible = ref(false)
const dciPickerVisible = ref(false)

const addMenu = ref()
const addMenuItems = [
  {
    label: 'Object status checks...',
    icon: 'pi pi-box',
    command: () => (objectPickerVisible.value = true),
  },
  {
    label: 'DCI threshold checks...',
    icon: 'pi pi-chart-line',
    command: () => (dciPickerVisible.value = true),
  },
]

function addChecks(items, noun) {
  if (items.length === 0) return
  createChecks(
    { objectId: objectId.value, items },
    {
      onSuccess: (results) => {
        // 403 is already toasted by api/client.js; anything else needs saying here.
        const failed = results.filter((r) => r.status === 'rejected')
        const reportable = failed.filter((r) => r.reason?.status !== 403)
        if (reportable.length > 0) {
          toast.add({
            severity: 'error',
            summary: `Could not add ${reportable.length} of ${items.length} ${noun}`,
            detail: reportable[0].reason?.message,
            life: 5000,
          })
        }
      },
    },
  )
}

function onObjectsPicked(picked) {
  const objects = Array.isArray(picked) ? picked : [picked]
  addChecks(
    objects.map((o) => ({ type: 'object', relatedObjectId: o.id, description: o.name })),
    'object checks',
  )
}

function onDcisPicked(picked) {
  addChecks(
    picked.map(({ object, dci }) => ({
      type: 'dci',
      relatedObjectId: object.id,
      relatedDciId: Number(dci.id),
      description: dci.description || dci.name,
    })),
    'DCI checks',
  )
}

const { mutate: deleteChecks } = useDeleteBusinessServiceChecks()

function confirmDelete(targets) {
  if (targets.length === 0) return

  let message =
    targets.length === 1
      ? `Delete check "${targets[0].description}"?`
      : `Delete ${targets.length} checks?`
  if (isPrototype.value) {
    message += ' Checks created from it in business services are deleted too.'
  }
  if (targets.some((t) => t.autoCreated)) {
    message +=
      ' Checks created automatically are added again the next time auto-binding runs or their prototype changes.'
  }

  confirm.require({
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    message,
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteChecks(
        { objectId: objectId.value, checkIds: targets.map((t) => t.id) },
        {
          onSuccess: (results) => {
            const reportable = results.filter(
              (r) => r.status === 'rejected' && r.reason?.status !== 403,
            )
            if (reportable.length > 0) {
              toast.add({
                severity: 'error',
                summary:
                  reportable.length > 1
                    ? `Could not delete ${reportable.length} checks`
                    : 'Could not delete check',
                detail: reportable[0].reason?.message,
                life: 5000,
              })
            }
          },
        },
      )
      clearSelection()
    },
  })
}

function relatedObjectTarget(row) {
  return row.object ? objectTarget(row.object) : null
}

function dciTarget(row) {
  return row.object && row.relatedDciId
    ? objectTarget(row.object, 'dcis', { entityId: row.relatedDciId })
    : null
}

const contextMenu = ref()

/** Inside a multi-row selection the menu acts on the whole selection, outside it on the row. */
function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedIds.value.has(row.id) && selectedRows.value.length > 1 ? selectedRows.value : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const targets = contextTargets()
  const multiple = targets.length > 1
  const suffix = multiple ? ` (${targets.length})` : ''
  const editable = !!row && !row.autoCreated && canModify.value

  return [
    {
      label: editable ? 'Edit...' : 'View...',
      icon: editable ? 'pi pi-pencil' : 'pi pi-eye',
      disabled: multiple || !row,
      command: () => openEdit(row),
    },
    {
      label: 'Duplicate',
      icon: 'pi pi-copy',
      disabled: multiple || !row || !canModify.value,
      command: () => duplicate(row),
    },
    {
      label: `Delete${suffix}`,
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      disabled: !canModify.value || targets.length === 0,
      command: () => confirmDelete(contextTargets()),
    },
    { separator: true },
    {
      label: 'Go to Object',
      icon: 'pi pi-external-link',
      disabled: multiple || !row || !relatedObjectTarget(row),
      command: () => router.push(relatedObjectTarget(row)),
    },
    {
      label: 'Go to DCI',
      icon: 'pi pi-external-link',
      disabled: multiple || !row || !dciTarget(row),
      command: () => router.push(dciTarget(row)),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, row) {
  contextMenu.value.show(event, row)
}

const columns = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 70 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 220 },
  { id: 'type', field: 'typeLabel', label: 'Type', sortable: true, width: 120 },
  { id: 'object', field: 'objectName', label: 'Object', sortable: true, width: 200 },
  { id: 'dci', field: 'dciName', label: 'DCI', sortable: true, width: 200 },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 100 },
  { id: 'reason', field: 'failureReason', label: 'Reason', sortable: true, width: 260 },
  { id: 'origin', field: 'originName', label: 'Origin', sortable: true, width: 180 },
  { id: 'actions', field: null, label: '', width: 48 },
]

const serviceNoun = computed(() => (isPrototype.value ? 'prototype' : 'business service'))
</script>

<template>
  <div class="checks-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="checks-toolbar">
      <SmartFilterInput v-model="filterState" placeholder="Filter checks..." class="filter-input" />
      <span v-if="!isLoading" class="checks-count">{{
        $plural(filteredRows.length, 'check')
      }}</span>
      <div v-if="canModify" class="toolbar-actions">
        <Button
          label="Add Multiple"
          icon="pi pi-chevron-down"
          icon-pos="right"
          size="small"
          severity="secondary"
          outlined
          aria-haspopup="true"
          @click="addMenu.toggle($event)"
        />
        <Menu ref="addMenu" :model="addMenuItems" :popup="true" />
        <Button
          label="Create Check"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreate"
        />
      </div>
    </div>

    <div v-if="selectedRows.length" class="selection-bar">
      <span class="selection-count">{{ $plural(selectedRows.length, 'check') }} selected</span>
      <Button
        v-if="canModify"
        label="Delete"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        outlined
        @click="confirmDelete(selectedRows)"
      />
      <Button label="Clear" size="small" text severity="secondary" @click="clearSelection" />
    </div>

    <AppTable
      :columns="columns"
      :rows="filteredRows"
      :loading="isLoading"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      selectable
      :selected-ids="selectedIds"
      sort-field="id"
      :sort-order="1"
      :page-size="50"
      storage-key="business-service-checks"
      class="checks-table"
      @selection-change="selectedIds = $event"
      @row-click="openEdit"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'description'" class="check-description">
          <i
            v-if="row.autoCreated"
            v-tooltip.top="'Created automatically; it cannot be edited'"
            class="pi pi-lock auto-icon"
            aria-label="Created automatically"
          />
          {{ row.description }}
        </span>
        <template v-else-if="col.id === 'object'">
          <AppLink v-if="relatedObjectTarget(row)" :to="relatedObjectTarget(row)" @click.stop>
            {{ row.objectName }}
          </AppLink>
          <span v-else class="text-muted">{{ row.objectName }}</span>
        </template>
        <template v-else-if="col.id === 'dci'">
          <AppLink v-if="row.dciName && dciTarget(row)" :to="dciTarget(row)" @click.stop>
            {{ row.dciName }}
          </AppLink>
          <span v-else class="text-muted">{{ row.dciName }}</span>
        </template>
        <StatusTag
          v-else-if="col.id === 'status'"
          :status="row.stateStatus"
          :value="row.stateLabel"
        />
        <template v-else-if="col.id === 'origin'">
          <AppLink v-if="row.prototype" :to="objectTarget(row.prototype)" @click.stop>
            {{ row.originName }}
          </AppLink>
          <span v-else :class="{ 'text-muted': row.origin === 'autobind' }">{{
            row.originName
          }}</span>
        </template>
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
        <div v-if="checks.length === 0" class="empty-message">
          <p class="empty-title">No checks configured</p>
          <p class="empty-text">
            Checks decide whether this {{ serviceNoun }} is operational: an object's status, a DCI's
            thresholds, or a script.
          </p>
        </div>
        <div v-else class="empty-message">No checks match the current filter.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <BusinessServiceCheckDialog
      v-model:visible="dialogVisible"
      :service-id="objectId"
      :check="editedCheck"
      :readonly="dialogReadonly"
      :readonly-reason="readonlyReason"
    />

    <AllObjectsPickerDialog
      v-model:visible="objectPickerVisible"
      title="Select Objects (Ctrl+click for several)"
      multi-select
      @select="onObjectsPicked"
    />

    <DciPickerDialog
      v-model:visible="dciPickerVisible"
      header="Add DCI Threshold Checks"
      multiple
      confirm-label="Add Checks"
      @select="onDcisPicked"
    />
  </div>
</template>

<style scoped>
.checks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.checks-toolbar {
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

.checks-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

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

.checks-table {
  flex: 1;
  min-height: 0;
}

.checks-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.check-description {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.auto-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.text-muted {
  color: var(--p-text-muted-color);
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

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.375rem;
}

.empty-text {
  font-size: 0.875rem;
  margin: 0;
  line-height: 1.5;
}
</style>
