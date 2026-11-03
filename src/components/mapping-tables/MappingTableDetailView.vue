<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import MappingTableEntryDialog from './MappingTableEntryDialog.vue'
import { useCreateMappingTable, useUpdateMappingTable } from '@/queries/useMappingTableQueries'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import {
  FLAG_NUMERIC_KEYS,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  entriesFromCsv,
  parseNumericKey,
  validateEntries,
} from '@/utils/mappingTables'
import { parseCsv } from '@/utils/csvImport'
import { toCsv, downloadCsv, safeFilename } from '@/utils/csvExport'

// Properties and entries are one form because the numeric-keys flag changes what a valid key
// is: saved apart, turning it on rewrites every text key to "0" (see `utils/mappingTables.js`).
const props = defineProps({
  /** Null to create one. */
  table: { type: Object, default: null },
})

const emit = defineEmits(['close', 'created'])

const confirm = useConfirm()
const toast = useToast()

const isNew = computed(() => props.table === null)

const form = ref({ name: '', description: '', numeric: false })
/** Entries carry a local `id`: keys are edited and may collide, so they cannot key rows. */
const entries = ref([])
let nextEntryId = 0

function snapshot() {
  return JSON.stringify({
    ...form.value,
    entries: entries.value.map((e) => [e.key, e.value, e.description]),
  })
}

const baseline = ref('')

function load(table) {
  form.value = {
    name: table?.name ?? '',
    description: table?.description ?? '',
    numeric: !!((table?.flags ?? 0) & FLAG_NUMERIC_KEYS),
  }
  entries.value = (table?.elements ?? []).map((e) => ({ id: ++nextEntryId, ...e }))
  baseline.value = snapshot()
}

load(props.table)

const isDirty = computed(() => snapshot() !== baseline.value)

// A refetch must not wipe edits in progress; an unchanged form follows the server.
watch(
  () => props.table,
  (table) => {
    if (!isDirty.value) load(table)
  },
)

useUnsavedChangesGuard(isDirty, { includeRouteUpdates: true })

const nameError = computed(() => (form.value.name.trim() ? '' : 'Name is required'))
const entryErrors = computed(() => validateEntries(entries.value, form.value.numeric))
const isValid = computed(() => !nameError.value && entryErrors.value.size === 0)

const { mutate: createTable, isPending: isCreating, error: createError } = useCreateMappingTable()
const { mutate: updateTable, isPending: isUpdating, error: updateError } = useUpdateMappingTable()

const isSaving = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  // Only bit 0 is edited here; any other flag bits the server sets are carried through.
  const otherFlags = (props.table?.flags ?? 0) & ~FLAG_NUMERIC_KEYS
  const data = {
    name: form.value.name.trim(),
    description: form.value.description,
    flags: otherFlags | (form.value.numeric ? FLAG_NUMERIC_KEYS : 0),
    elements: entries.value.map(({ key, value, description }) => ({ key, value, description })),
  }

  if (isNew.value) {
    createTable(data, {
      onSuccess: (table) => {
        load(table)
        emit('created', table.id)
      },
    })
  } else {
    updateTable(
      { id: props.table.id, data },
      {
        onSuccess: (table) => {
          load(table)
          toast.add({
            severity: 'success',
            summary: 'Saved',
            detail: `Mapping table "${table.name}" saved.`,
            life: 3000,
          })
        },
      },
    )
  }
}

function discard() {
  load(props.table)
  if (isNew.value) emit('close')
}

const title = computed(() =>
  isNew.value ? 'New Mapping Table' : props.table.name || 'Mapping Table',
)

const filterState = ref({ text: '', tokens: [] })
const problemsOnly = ref(false)

watch(
  () => entryErrors.value.size,
  (count) => {
    if (count === 0) problemsOnly.value = false
  },
)

const rows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  return entries.value
    .filter((e) => !problemsOnly.value || entryErrors.value.has(e.id))
    .filter(
      (e) =>
        !search ||
        e.key.toLowerCase().includes(search) ||
        e.value.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search),
    )
    .map((e) => ({
      ...e,
      // A key that is not yet a valid number sorts last.
      sortKey: form.value.numeric ? parseNumericKey(e.key) : e.key,
    }))
})

const columns = [
  { id: 'key', field: 'key', sortField: 'sortKey', label: 'Key', sortable: true, width: 200 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 260 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 320 },
  { id: 'actions', field: null, label: '', width: 48 },
]

const selectedIds = ref(new Set())

const selectedEntries = computed(() => rows.value.filter((r) => selectedIds.value.has(r.id)))

watch(rows, (visibleRows) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(visibleRows.map((r) => r.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

// No confirmation: Discard restores the working copy.
function deleteEntries(targets) {
  const ids = new Set(targets.map((t) => t.id))
  entries.value = entries.value.filter((e) => !ids.has(e.id))
  selectedIds.value = new Set()
}

const plural = (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`

const dialogVisible = ref(false)
const editingEntry = ref(null)

function openAdd() {
  editingEntry.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  editingEntry.value = entries.value.find((e) => e.id === row.id) ?? null
  dialogVisible.value = true
}

function onEntrySave(values) {
  if (editingEntry.value) {
    const id = editingEntry.value.id
    entries.value = entries.value.map((e) => (e.id === id ? { ...e, ...values } : e))
  } else {
    entries.value = [...entries.value, { id: ++nextEntryId, ...values }]
  }
}

const contextMenu = ref()

function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedIds.value.has(row.id) && selectedEntries.value.length > 1
    ? selectedEntries.value
    : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const multiple = selectedIds.value.has(row?.id) && selectedEntries.value.length > 1
  return [
    {
      label: 'Edit...',
      icon: 'pi pi-pencil',
      disabled: multiple,
      command: () => openEdit(row),
    },
    {
      label: multiple ? `Delete (${selectedEntries.value.length})` : 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => deleteEntries(contextTargets()),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

const CSV_COLUMNS = [
  { field: 'key', label: 'Key' },
  { field: 'value', label: 'Value' },
  { field: 'description', label: 'Description' },
]

function exportCsv() {
  downloadCsv(safeFilename(form.value.name, 'mapping-table'), toCsv(entries.value, CSV_COLUMNS))
}

const fileInput = ref()

async function onFileChosen(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  let imported
  try {
    imported = entriesFromCsv(parseCsv(await file.text()))
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Import Failed', detail: err.message, life: 5000 })
    return
  }
  if (imported.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Nothing to Import',
      detail: `"${file.name}" contains no data rows.`,
      life: 5000,
    })
    return
  }

  const withIds = imported.map((e) => ({ id: ++nextEntryId, ...e }))
  if (entries.value.length === 0) {
    entries.value = withIds
    return
  }
  confirm.require({
    header: 'Import CSV',
    message: `Replace the ${plural(entries.value.length)} in this table with the ${plural(withIds.length)} from "${file.name}", or add them after the existing ones?`,
    icon: 'pi pi-file-import',
    acceptLabel: 'Replace',
    rejectLabel: 'Append',
    accept: () => {
      entries.value = withIds
    },
    reject: () => {
      entries.value = [...entries.value, ...withIds]
    },
  })
}
</script>

<template>
  <div class="mapping-table-detail">
    <EntityDetailHeader :title="title" subtitle="Mapping Table" @back="emit('close')">
      <template #actions>
        <Button
          label="Discard"
          icon="pi pi-times"
          severity="secondary"
          size="small"
          :disabled="(!isDirty && !isNew) || isSaving"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          severity="primary"
          size="small"
          :disabled="(!isDirty && !isNew) || !isValid || isSaving"
          :loading="isSaving"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <div class="detail-content">
      <MutationErrorState :error="mutationError" class="error-message" />

      <div class="detail-cards-grid">
        <DetailCard v-if="!isNew" title="Identification">
          <FormField class="detail-field" label="ID" v-slot="{ id }">
            <InputText :id="id" :model-value="String(table.id)" disabled class="field-input" />
          </FormField>
          <FormField class="detail-field" label="GUID" v-slot="{ id }">
            <InputText :id="id" :model-value="table.guid" disabled class="field-input" />
          </FormField>
        </DetailCard>

        <DetailCard title="General" :wide="isNew">
          <FormField
            class="detail-field"
            label="Name"
            required
            :empty="!form.name.trim()"
            v-slot="{ id }"
          >
            <InputText
              :id="id"
              v-model="form.name"
              :maxlength="MAX_NAME_LENGTH"
              :autofocus="isNew"
              placeholder="e.g. ifOperStatus"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Description" v-slot="{ id }">
            <Textarea
              :id="id"
              v-model="form.description"
              :maxlength="MAX_TEXT_LENGTH"
              :rows="2"
              auto-resize
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Keys" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.numeric" input-id="mapping-table-numeric" />
              <label for="mapping-table-numeric" class="toggle-label">Numeric keys</label>
            </div>
          </FormField>
        </DetailCard>

        <DetailCard :title="`Entries (${entries.length})`" wide>
          <div class="entries-body">
            <div class="entries-toolbar">
              <Button
                label="Add Entry"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                @click="openAdd"
              />
              <Button
                label="Import CSV..."
                icon="pi pi-file-import"
                size="small"
                severity="secondary"
                @click="fileInput.click()"
              />
              <Button
                label="Export CSV"
                icon="pi pi-file-export"
                size="small"
                severity="secondary"
                :disabled="entries.length === 0"
                @click="exportCsv"
              />
              <input
                ref="fileInput"
                type="file"
                accept=".csv,text/csv"
                class="file-input-hidden"
                aria-label="CSV file to import"
                @change="onFileChosen"
              />
              <SmartFilterInput
                v-model="filterState"
                placeholder="Filter entries..."
                class="filter-input"
              />
            </div>

            <Message v-if="entryErrors.size > 0" severity="warn" :closable="false">
              <span class="problems-text">
                {{ plural(entryErrors.size) }} must be fixed before saving.
                <template v-if="form.numeric">
                  Numeric keys are decimal or 0x-prefixed hexadecimal numbers.
                </template>
              </span>
              <Button
                :label="problemsOnly ? 'Show all' : 'Show only these'"
                size="small"
                text
                class="problems-toggle"
                @click="problemsOnly = !problemsOnly"
              />
            </Message>

            <div v-if="selectedEntries.length" class="selection-bar">
              <span class="selection-count">{{ plural(selectedEntries.length) }} selected</span>
              <Button
                label="Delete"
                icon="pi pi-trash"
                size="small"
                severity="danger"
                outlined
                @click="deleteEntries(selectedEntries)"
              />
              <Button
                label="Clear"
                size="small"
                text
                severity="secondary"
                @click="selectedIds = new Set()"
              />
            </div>

            <AppTable
              :columns="columns"
              :rows="rows"
              striped
              column-borders
              resize-fit
              selectable
              :selected-ids="selectedIds"
              sort-field="sortKey"
              :sort-order="1"
              :page-size="50"
              storage-key="mapping-table-entries"
              :owner-id="table?.id ?? 'new'"
              class="entries-table"
              @selection-change="selectedIds = $event"
              @row-click="openEdit"
              @row-contextmenu="onRowContextMenu"
            >
              <template #cell="{ col, row }">
                <span v-if="col.id === 'key'" class="entry-key">
                  <i
                    v-if="entryErrors.has(row.id)"
                    v-tooltip.top="entryErrors.get(row.id)"
                    class="pi pi-exclamation-circle entry-problem"
                    :aria-label="entryErrors.get(row.id)"
                  />
                  <span :class="{ 'text-muted': !row.key }">{{ row.key || '(empty)' }}</span>
                </span>
                <span
                  v-else-if="col.id === 'value'"
                  class="entry-mono"
                  :class="{ 'text-muted': !row.value }"
                >
                  {{ row.value || '-' }}
                </span>
                <span
                  v-else-if="col.id === 'description'"
                  :class="{ 'text-muted': !row.description }"
                >
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
                  @click.stop="onRowContextMenu({ event: $event, row })"
                />
              </template>
              <template #empty>
                <div v-if="entries.length === 0" class="empty-message">
                  No entries yet. Add them one by one or import a CSV file with Key, Value and
                  Description columns.
                </div>
                <div v-else class="empty-message">No entries match the current filter.</div>
              </template>
            </AppTable>
          </div>
        </DetailCard>
      </div>
    </div>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <MappingTableEntryDialog
      v-model:visible="dialogVisible"
      :entry="editingEntry"
      :entries="entries"
      :numeric="form.numeric"
      @save="onEntrySave"
    />
  </div>
</template>

<style scoped>
.mapping-table-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.error-message {
  margin: 1.5rem 1.5rem 0;
}

.detail-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
}

.detail-field {
  display: flex;
  /* Explicit: the global .form-field in forms.css is column. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

/* FormField renders the label, so it carries that component's scope id. */
.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 10rem;
  flex-shrink: 0;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.toggle-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-label {
  font-size: 0.875rem;
  cursor: pointer;
}

.entries-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0;
}

.entries-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.file-input-hidden {
  display: none;
}

.filter-input {
  width: 280px;
  margin-left: auto;
}

.problems-text {
  font-size: 0.8125rem;
}

.problems-toggle {
  margin-left: 0.5rem;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
  background: var(--p-surface-ground);
}

.selection-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
}

.entries-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.entry-key {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.entry-problem {
  color: var(--p-orange-500);
  font-size: 0.8125rem;
}

.entry-mono {
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
