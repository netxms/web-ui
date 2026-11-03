<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import ColumnEditDialog from './ColumnEditDialog.vue'
import DciPickerDialog from '@/components/objects/DciPickerDialog.vue'
import { useCreateSummaryTable, useUpdateSummaryTable } from '@/queries/useSummaryTableQueries'
import FormField from '@/components/common/FormField.vue'

const FLAG_TABLE_DCI_SOURCE = 1

const props = defineProps({
  /** SummaryTableDetails, or null for create mode */
  table: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

function buildForm(table) {
  return {
    title: table?.title ?? '',
    menuPath: table?.menuPath ?? '',
    isTableType: !!((table?.flags ?? 0) & FLAG_TABLE_DCI_SOURCE),
    nodeFilter: table?.nodeFilter ?? '',
    tableDciName: table?.tableDciName ?? '',
    columns: table?.columns ? table.columns.map((c) => ({ ...c })) : [],
  }
}

const form = ref(buildForm(props.table))

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.table)),
)

watch(
  () => props.table,
  (table) => {
    form.value = buildForm(table)
  },
)

const { mutate: createTable, isPending: isCreating, error: createError } = useCreateSummaryTable()
const { mutate: updateTable, isPending: isUpdating, error: updateError } = useUpdateSummaryTable()

const isNew = computed(() => props.table === null)
const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  const data = {
    title: form.value.title.trim(),
    menuPath: form.value.menuPath.trim() || undefined,
    nodeFilter: form.value.nodeFilter.trim() || undefined,
    flags: form.value.isTableType ? FLAG_TABLE_DCI_SOURCE : 0,
    tableDciName: form.value.isTableType ? form.value.tableDciName.trim() || undefined : undefined,
    columns: form.value.isTableType ? undefined : form.value.columns,
  }

  if (isNew.value) {
    createTable(data, { onSuccess: () => emit('close') })
  } else {
    updateTable({ id: props.table.id, data }, { onSuccess: () => emit('saved') })
  }
}

function discard() {
  form.value = buildForm(props.table)
  if (isNew.value) emit('close')
}

const title = computed(() =>
  isNew.value ? 'New Summary Table' : (props.table?.title ?? 'Summary Table'),
)

const isValid = computed(() => form.value.title.trim() !== '')

const showColumnDialog = ref(false)
const editingColumn = ref(null)
const editingColumnIndex = ref(-1)

function openAddColumn() {
  editingColumn.value = null
  editingColumnIndex.value = -1
  showColumnDialog.value = true
}

function openEditColumn(column, index) {
  editingColumn.value = column
  editingColumnIndex.value = index
  showColumnDialog.value = true
}

function onColumnConfirm(column) {
  if (editingColumnIndex.value >= 0) {
    form.value.columns.splice(editingColumnIndex.value, 1, column)
  } else {
    form.value.columns.push(column)
  }
}

function deleteColumn(index) {
  form.value.columns.splice(index, 1)
}

const showDciPicker = ref(false)

function onDciImport({ dci }) {
  form.value.columns.push({
    name: dci.description || dci.name,
    dciName: dci.name,
    flags: 0,
    separator: ';',
  })
}

const COL_FLAG_MULTIVALUED = 1
const COL_FLAG_REGEXP_MATCH = 2
const COL_FLAG_MATCH_DESCRIPTION = 4

function getColumnFlagBadges(flags) {
  const badges = []
  if (flags & COL_FLAG_MULTIVALUED) badges.push({ label: 'Multi', severity: 'info' })
  if (flags & COL_FLAG_REGEXP_MATCH) badges.push({ label: 'RegExp', severity: 'warn' })
  if (flags & COL_FLAG_MATCH_DESCRIPTION) badges.push({ label: 'Desc', severity: 'secondary' })
  return badges
}
</script>

<template>
  <div class="summary-table-detail">
    <EntityDetailHeader :title="title" subtitle="DCI Summary Table" @back="emit('close')">
      <template #actions>
        <Button
          label="Discard"
          icon="pi pi-times"
          severity="secondary"
          size="small"
          :disabled="!isDirty && !isNew"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          severity="primary"
          size="small"
          :disabled="!isDirty || isPending || !isValid"
          :loading="isPending"
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
          <div class="detail-field">
            <label for="table-title">Title <span class="required">*</span></label>
            <InputText
              id="table-title"
              v-model="form.title"
              placeholder="Summary table title"
              class="field-input"
              autofocus
            />
          </div>
          <FormField class="detail-field" label="Menu path" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.menuPath"
              placeholder="e.g. Monitoring/Custom"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Table type" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.isTableType" input-id="table-type-toggle" />
              <label for="table-type-toggle" class="toggle-label"> Table DCI source </label>
            </div>
          </FormField>
          <FormField
            v-if="form.isTableType"
            class="detail-field"
            label="Table DCI name"
            v-slot="{ id }"
          >
            <InputText
              :id="id"
              v-model="form.tableDciName"
              placeholder="Name of the table-type DCI"
              class="field-input"
            />
          </FormField>
        </DetailCard>

        <DetailCard title="Node Filter" :wide="true">
          <div class="filter-body">
            <div class="filter-hint">
              <span class="hint-line">Variables:</span>
              <span class="hint-line"><code>$object</code> — current object</span>
              <span class="hint-line"
                ><code>$node</code> — current object if its class is Node</span
              >
              <span class="hint-line">
                Return <code>true</code> to include the object in this summary table
              </span>
            </div>
            <Textarea
              id="table-filter"
              v-model="form.nodeFilter"
              placeholder="return true; // include all objects"
              rows="5"
              class="filter-textarea"
              auto-resize
            />
          </div>
        </DetailCard>

        <DetailCard
          v-if="!form.isTableType"
          :title="`Columns (${form.columns.length})`"
          :wide="true"
        >
          <div class="columns-body">
            <div class="columns-toolbar">
              <Button
                label="Add Column"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                @click="openAddColumn"
              />
              <Button
                label="Import from DCI"
                icon="pi pi-download"
                size="small"
                severity="secondary"
                @click="showDciPicker = true"
              />
            </div>

            <div v-if="form.columns.length === 0" class="columns-empty">
              No columns defined. Add a column or import one from a DCI.
            </div>

            <DataTable
              v-else
              :value="form.columns"
              class="columns-table"
              reorderable-columns
              :reorderable-rows="true"
              @row-reorder="(e) => (form.columns = e.value)"
            >
              <Column row-reorder style="width: 2.5rem; flex: 0 0 2.5rem" />

              <Column field="name" header="Name" style="min-width: 140px">
                <template #body="{ data }">
                  <span class="col-name">{{ data.name }}</span>
                </template>
              </Column>

              <Column field="dciName" header="DCI Name" style="min-width: 140px">
                <template #body="{ data }">
                  <span class="col-dci-name">{{ data.dciName }}</span>
                </template>
              </Column>

              <Column header="Flags" style="min-width: 120px">
                <template #body="{ data }">
                  <div class="col-flags">
                    <Tag
                      v-for="badge in getColumnFlagBadges(data.flags)"
                      :key="badge.label"
                      :value="badge.label"
                      :severity="badge.severity"
                      outlined
                      class="col-flag-tag"
                    />
                    <span v-if="!getColumnFlagBadges(data.flags).length" class="text-muted">
                      —
                    </span>
                  </div>
                </template>
              </Column>

              <Column header="Separator" style="width: 90px">
                <template #body="{ data }">
                  <span v-if="data.flags & 1" class="text-muted">{{ data.separator || ';' }}</span>
                  <span v-else class="text-muted">—</span>
                </template>
              </Column>

              <Column style="width: 80px; flex: 0 0 80px">
                <template #body="{ data, index }">
                  <div class="col-actions">
                    <Button
                      icon="pi pi-pencil"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Edit"
                      @click="openEditColumn(data, index)"
                    />
                    <Button
                      icon="pi pi-trash"
                      text
                      rounded
                      severity="danger"
                      size="small"
                      aria-label="Delete"
                      @click="deleteColumn(index)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </DetailCard>
      </div>
    </div>
  </div>

  <ColumnEditDialog
    v-model:visible="showColumnDialog"
    :column="editingColumn"
    @confirm="onColumnConfirm"
  />

  <DciPickerDialog
    v-model:visible="showDciPicker"
    header="Import Column from DCI"
    hint="Click a DCI row to import it as a column"
    @select="onDciImport"
  />
</template>

<style scoped>
.summary-table-detail {
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
  /* The global .form-field in forms.css is column. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field > label:first-child,
/* FormField's own label carries its scope id, not this file's. */
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

.required {
  color: var(--p-red-500, #ef4444);
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

.filter-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0 0.25rem;
}

.filter-hint {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
}

.hint-line {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.hint-line code {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.filter-textarea {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.columns-body {
  padding: 0.5rem 0 0.25rem;
}

.columns-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.columns-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  border: 1px dashed var(--p-surface-border);
  border-radius: 0.5rem;
}

.columns-table {
  --p-datatable-body-cell-padding: 0.3rem 0.5rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.col-name {
  font-weight: 500;
}

.col-dci-name {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.col-flags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.col-flag-tag {
  font-size: 0.7rem;
}

.col-actions {
  display: flex;
  gap: 0.25rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
