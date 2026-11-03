<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import ServerConfigVariableDialog from '@/components/server-config/ServerConfigVariableDialog.vue'
import { serverConfigFilterDefs } from '@/filterDefs/serverConfigFilterDefs'
import {
  useServerConfigVariables,
  useSetServerConfigVariable,
  useResetServerConfigVariable,
  useDeleteServerConfigVariable,
} from '@/queries/useServerConfigQueries'
import {
  namespaceOf,
  namespacesOf,
  isDefaultValue,
  currentValueForDisplay,
  defaultValueForDisplay,
} from '@/utils/serverConfigDisplay'
import { toCsv, downloadCsv } from '@/utils/csvExport'
import { viewState } from '@/utils/appStorage'
import { useWorkingState } from '@/composables/useWorkingState'

/**
 * Beyond legacy: a namespace list, token filters, an explicit "modified" marker, and a banner
 * naming variables whose changes still wait on a server restart.
 */

const confirm = useConfirm()
const toast = useToast()

const {
  data: variablesData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useServerConfigVariables()

const variables = computed(() => variablesData.value ?? [])
const existingNames = computed(() => variables.value.map((v) => v.name))

const ALL_NAMESPACES = '__all__'

// Per-tab, not a preference.
const selectedNamespace = ref(viewState.get('serverConfig.namespace', ALL_NAMESPACES))

watch(selectedNamespace, (ns) => viewState.set('serverConfig.namespace', ns))

const namespaces = computed(() => namespacesOf(variables.value))

// A namespace disappears when its last variable is deleted, which would leave the table
// empty with no hint why.
watch(namespaces, (list) => {
  if (
    selectedNamespace.value !== ALL_NAMESPACES &&
    !list.some((ns) => ns.name === selectedNamespace.value)
  ) {
    selectedNamespace.value = ALL_NAMESPACES
  }
})

const namespaceScoped = computed(() =>
  selectedNamespace.value === ALL_NAMESPACES
    ? variables.value
    : variables.value.filter((v) => namespaceOf(v.name) === selectedNamespace.value),
)

const filterState = ref({ text: '', tokens: [] })

function matchToken(variable, token) {
  const value = (token.value ?? '').toLowerCase()
  switch (token.key) {
    case 'Type':
      return (variable.dataType ?? '').toLowerCase() === value
    case 'Modified':
      return !isDefaultValue(variable)
    case 'Restart':
      return !!variable.needServerRestart
    default:
      return true
  }
}

const filteredVariables = computed(() => {
  const { text, tokens } = filterState.value
  let result = namespaceScoped.value

  if (text) {
    // Description as well as name: "which variable controls X" is the question asked.
    const search = text.toLowerCase()
    result = result.filter(
      (v) =>
        v.name.toLowerCase().includes(search) ||
        (v.description ?? '').toLowerCase().includes(search),
    )
  }

  if (tokens.length > 0) {
    result = result.filter((variable) => {
      let negateNext = false
      for (const token of tokens) {
        if (token.key === 'NOT') {
          negateNext = true
          continue
        }
        const matches = matchToken(variable, token)
        if (negateNext ? matches : !matches) return false
        negateNext = false
      }
      return true
    })
  }

  return result
})

const selectedNames = ref(new Set())

useWorkingState('server-config', { view: { filterState }, object: { selectedNames } })

const selectedVariables = computed(() =>
  filteredVariables.value.filter((v) => selectedNames.value.has(v.name)),
)

// A stale selection would let a bulk action hit variables the user can no longer see.
watch([selectedNamespace, filteredVariables], () => {
  if (selectedNames.value.size === 0) return
  const visible = new Set(filteredVariables.value.map((v) => v.name))
  const next = new Set([...selectedNames.value].filter((name) => visible.has(name)))
  if (next.size !== selectedNames.value.size) selectedNames.value = next
})

function clearSelection() {
  selectedNames.value = new Set()
}

/**
 * Variables changed in this session whose new value needs a server restart. Session-scoped:
 * the server exposes no "restart pending" flag.
 */
const pendingRestart = ref(new Set())

function notePendingRestart(variable) {
  if (!variable?.needServerRestart) return
  pendingRestart.value = new Set([...pendingRestart.value, variable.name])
}

const pendingRestartNames = computed(() => [...pendingRestart.value].sort())

const { mutate: setVariable, isPending: isSetting } = useSetServerConfigVariable()
const { mutate: resetVariable, isPending: isResetting } = useResetServerConfigVariable()
const { mutate: deleteVariable } = useDeleteServerConfigVariable()

const isSaving = computed(() => isSetting.value || isResetting.value)

const dialogVisible = ref(false)
const editingVariable = ref(null)
const dialogError = ref(null)

/** Read from the live list, so a reset inside the dialog re-renders with the new value. */
const dialogVariable = computed(() =>
  editingVariable.value
    ? (variables.value.find((v) => v.name === editingVariable.value) ?? null)
    : null,
)

function openCreate() {
  editingVariable.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(variable) {
  editingVariable.value = variable.name
  dialogError.value = null
  dialogVisible.value = true
}

function onDialogSave({ name, value }) {
  dialogError.value = null
  setVariable(
    { name, value },
    {
      onSuccess: (updated) => {
        dialogVisible.value = false
        notePendingRestart(updated)
        toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: `Variable "${name}" saved.`,
          life: 3000,
        })
      },
      onError: (err) => {
        // The handler writes, then reads back with `is_visible = 1`: a name colliding with a
        // hidden variable is stored and *then* answers 404. The write happened.
        dialogError.value =
          err.status === 404
            ? `"${name}" was saved, but it is a hidden variable and cannot be shown here.`
            : (err.message ?? 'Failed to save variable.')
      },
    },
  )
}

function onDialogReset(name) {
  dialogError.value = null
  resetVariable(name, {
    onSuccess: (updated) => notePendingRestart(updated),
    onError: (err) => {
      dialogError.value = err.message ?? 'Failed to reset variable.'
    },
  })
}

function confirmReset(targets) {
  const message =
    targets.length === 1
      ? `Reset "${targets[0].name}" to its default value?`
      : `Reset ${targets.length} variables to their default values?`

  confirm.require({
    message,
    header: 'Reset to Default',
    icon: 'pi pi-undo',
    rejectLabel: 'Cancel',
    acceptLabel: 'Reset',
    accept: () => {
      for (const variable of targets) {
        resetVariable(variable.name, {
          onSuccess: (updated) => notePendingRestart(updated),
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Reset Failed',
              detail: err.message ?? `Failed to reset "${variable.name}".`,
              life: 5000,
            })
          },
        })
      }
      clearSelection()
    },
  })
}

function confirmDelete(targets) {
  const message =
    targets.length === 1
      ? `Delete configuration variable "${targets[0].name}"? This cannot be undone.`
      : `Delete ${targets.length} configuration variables? This cannot be undone.`

  confirm.require({
    message,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      for (const variable of targets) {
        deleteVariable(variable.name, {
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? `Failed to delete "${variable.name}".`,
              life: 5000,
            })
          },
        })
      }
      clearSelection()
    },
  })
}

const CSV_COLUMNS = [
  { field: 'name', label: 'Name' },
  { field: 'value', label: 'Value' },
  { field: 'defaultValue', label: 'Default value' },
  { field: 'dataType', label: 'Type' },
  { field: 'restart', label: 'Restart' },
  { field: 'description', label: 'Description' },
]

/**
 * Exports displayed values, as legacy does: a CHOICE row its description, a PASSWORD row the
 * mask.
 */
function exportCsv(rows, filename) {
  const data = rows.map((v) => ({
    name: v.name,
    value: currentValueForDisplay(v),
    defaultValue: defaultValueForDisplay(v),
    dataType: v.dataType,
    restart: v.needServerRestart ? 'Yes' : 'No',
    description: v.description,
  }))
  downloadCsv(filename, toCsv(data, CSV_COLUMNS))
}

const contextMenu = ref()

/** Inside a multi-row selection acts on the selection, outside it on the row under the cursor. */
function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedNames.value.has(row.name) && selectedVariables.value.length > 1
    ? selectedVariables.value
    : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const multiple = selectedNames.value.has(row?.name) && selectedVariables.value.length > 1
  const suffix = multiple ? ` (${selectedVariables.value.length})` : ''

  return [
    {
      label: 'Edit...',
      icon: 'pi pi-pencil',
      disabled: multiple,
      command: () => openEdit(row),
    },
    {
      label: `Reset to default${suffix}`,
      icon: 'pi pi-undo',
      command: () => confirmReset(contextTargets()),
    },
    {
      label: `Delete${suffix}`,
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(contextTargets()),
    },
    { separator: true },
    {
      label: `Export selected to CSV${suffix}`,
      icon: 'pi pi-file-export',
      command: () => exportCsv(contextTargets(), 'server-configuration-selected'),
    },
    {
      label: 'Export all to CSV',
      icon: 'pi pi-file-export',
      command: () => exportCsv(filteredVariables.value, 'server-configuration'),
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
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 260 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 180 },
  { id: 'defaultValue', field: 'defaultValue', label: 'Default value', sortable: true, width: 160 },
  {
    id: 'needServerRestart',
    field: 'needServerRestart',
    label: 'Restart',
    sortable: true,
    width: 80,
  },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 420 },
  { id: 'actions', field: null, label: '', width: 48 },
]

/** Legacy parity: a variable that no longer holds its default value is shown in bold. */
function rowClass(row) {
  return isDefaultValue(row) ? null : 'variable-modified'
}
</script>

<template>
  <div class="server-config-section">
    <SectionHeader title="Server Configuration" icon="pi pi-sliders-h">
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
          v-tooltip.bottom="'Export to CSV'"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Export to CSV"
          :disabled="isLoading || filteredVariables.length === 0"
          @click="exportCsv(filteredVariables, 'server-configuration')"
        />
        <Button
          label="Create Variable"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreate"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <Message
      v-if="pendingRestartNames.length > 0"
      severity="warn"
      closable
      class="restart-banner"
      @close="pendingRestart = new Set()"
    >
      <span class="restart-banner-text">
        Server restart required for
        {{ $plural(pendingRestartNames.length, 'change') }} made in this session:
        <span class="restart-banner-names">{{ pendingRestartNames.join(', ') }}</span>
      </span>
    </Message>

    <div class="section-body">
      <!-- Namespace facet over the dot-prefixed namespaces -->
      <nav class="namespace-panel" aria-label="Configuration namespaces">
        <template v-if="isLoading">
          <div v-for="i in 12" :key="i" class="namespace-skeleton">
            <Skeleton width="60%" height="0.875rem" />
            <Skeleton width="1.5rem" height="0.75rem" />
          </div>
        </template>
        <template v-else>
          <button
            type="button"
            class="namespace-item"
            :class="{ active: selectedNamespace === ALL_NAMESPACES }"
            @click="selectedNamespace = ALL_NAMESPACES"
          >
            <span class="namespace-name">All variables</span>
            <span class="namespace-count">{{ variables.length }}</span>
          </button>
          <button
            v-for="ns in namespaces"
            :key="ns.name"
            type="button"
            class="namespace-item"
            :class="{ active: selectedNamespace === ns.name }"
            @click="selectedNamespace = ns.name"
          >
            <span class="namespace-name">{{ ns.name }}</span>
            <span class="namespace-count">{{ ns.count }}</span>
          </button>
        </template>
      </nav>

      <div class="variables-panel">
        <div class="section-toolbar">
          <SmartFilterInput
            v-model="filterState"
            :filter-defs="serverConfigFilterDefs"
            placeholder="Filter variables..."
            class="filter-input"
          />
          <span v-if="!isLoading" class="item-count">
            {{ $plural(filteredVariables.length, 'variable') }}
          </span>
        </div>

        <div v-if="selectedVariables.length" class="selection-bar">
          <span class="selection-count">
            {{ $plural(selectedVariables.length, 'variable') }} selected
          </span>
          <Button
            label="Reset to default"
            icon="pi pi-undo"
            size="small"
            severity="secondary"
            outlined
            @click="confirmReset(selectedVariables)"
          />
          <Button
            label="Delete"
            icon="pi pi-trash"
            size="small"
            severity="danger"
            outlined
            @click="confirmDelete(selectedVariables)"
          />
          <Button
            label="Export"
            icon="pi pi-file-export"
            size="small"
            severity="secondary"
            outlined
            @click="exportCsv(selectedVariables, 'server-configuration-selected')"
          />
          <Button label="Clear" size="small" text severity="secondary" @click="clearSelection" />
        </div>

        <div v-if="isLoading" class="section-loading">
          <Skeleton v-for="i in 12" :key="i" height="2rem" class="mb-2" />
        </div>

        <QueryErrorState
          v-else-if="isError"
          :error="error"
          class="section-error"
          @retry="refetch"
        />

        <AppTable
          v-else
          :columns="columns"
          :rows="filteredVariables"
          :row-class="rowClass"
          striped
          column-borders
          resize-fit
          selectable
          :selected-ids="selectedNames"
          sort-field="name"
          :sort-order="1"
          :page-size="50"
          storage-key="server-config"
          class="variables-table"
          @selection-change="selectedNames = $event"
          @row-click="openEdit"
          @row-contextmenu="onRowContextMenu"
          @retry="refetch"
        >
          <template #cell="{ col, row }">
            <template v-if="col.id === 'name'">
              <span class="variable-name">
                <i
                  v-if="!isDefaultValue(row)"
                  v-tooltip.top="'Changed from the default value'"
                  class="modified-dot"
                  aria-label="Modified"
                />
                {{ row.name }}
              </span>
            </template>
            <span
              v-else-if="col.id === 'value'"
              class="variable-value"
              :class="{ 'text-muted': !row.value }"
            >
              {{ currentValueForDisplay(row) || '-' }}
            </span>
            <span v-else-if="col.id === 'defaultValue'" class="variable-value text-muted">
              {{ defaultValueForDisplay(row) || '-' }}
            </span>
            <Tag
              v-else-if="col.id === 'needServerRestart'"
              :value="row.needServerRestart ? 'Yes' : 'No'"
              :severity="row.needServerRestart ? 'warn' : 'secondary'"
              outlined
            />
            <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">
              {{ row.description || '-' }}
            </span>
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
            <div class="empty-message">No configuration variables match the current filter.</div>
          </template>
        </AppTable>
      </div>
    </div>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <ServerConfigVariableDialog
      v-model:visible="dialogVisible"
      :variable="dialogVariable"
      :saving="isSaving"
      :error="dialogError"
      :existing-names="existingNames"
      @save="onDialogSave"
      @reset="onDialogReset"
    />
  </div>
</template>

<style scoped>
.server-config-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.restart-banner {
  margin: 0.5rem 1rem 0;
}

.restart-banner-text {
  font-size: 0.8125rem;
}

.restart-banner-names {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.section-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.namespace-panel {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  overflow-y: auto;
  padding: 0.25rem;
}

.namespace-item {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.625rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
}

.namespace-item:hover {
  background: var(--p-surface-hover);
}

.namespace-item.active {
  background: var(--p-primary-50);
  color: var(--p-primary-color);
  font-weight: 500;
}

.namespace-name {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.namespace-count {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  flex-shrink: 0;
}

.namespace-item.active .namespace-count {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  color: var(--p-primary-color);
}

.namespace-skeleton {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.625rem;
}

.variables-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
  width: 340px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
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

.section-loading {
  padding: 1rem;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.variables-table {
  flex: 1;
  min-height: 0;
}

.variables-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

/* Legacy parity: non-default values stand out from the stock configuration. */
.variables-table :deep(tr.variable-modified) {
  font-weight: 600;
}

.variable-name {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.modified-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--p-primary-color);
  flex-shrink: 0;
}

.variable-value {
  font-family: var(--font-mono);
  font-size: 0.75rem;
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
</style>
