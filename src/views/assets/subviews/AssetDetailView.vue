<script setup>
import { ref, computed, inject, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useAssetManagementSchema } from '@/queries/useAssetManagementSchemaQueries'
import { formatDateMedium } from '@/utils/timeFormat'
import {
  useAssetProperties,
  useUpdateAssetProperty,
  useDeleteAssetProperty,
} from '@/queries/useAssetPropertyQueries'

const props = defineProps({ object: { type: Object, default: null } })

const confirm = useConfirm()

const objectId = computed(() => props.object?.id ?? null)

const {
  data: schema,
  isLoading: schemaLoading,
  isError: schemaError,
  error: schemaErrorObj,
  refetch: refetchSchema,
} = useAssetManagementSchema()

const {
  data: properties,
  isLoading: propertiesLoading,
  isError: propertiesError,
  error: propertiesErrorObj,
  refetch: refetchProperties,
} = useAssetProperties(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => refetchProperties())
}

const updateProperty = useUpdateAssetProperty()
const deleteProperty = useDeleteAssetProperty()

// null = no active edit
const editingName = ref(null)
// keyed by attr name
const editForm = ref({})

const isLoading = computed(() => schemaLoading.value || propertiesLoading.value)
const isError = computed(() => schemaError.value || propertiesError.value)
const combinedError = computed(() => schemaErrorObj.value || propertiesErrorObj.value)

function retryLoad() {
  refetchSchema()
  refetchProperties()
}

const SYSTEM_TYPE_ORDER = ['Serial', 'IPAddress', 'MacAddress', 'Vendor', 'Model']

const SYSTEM_TYPE_CHIPS = {
  Serial: { label: 'Serial', bg: 'var(--p-blue-100)', fg: 'var(--p-blue-700)' },
  IPAddress: { label: 'IP Address', bg: 'var(--p-teal-100)', fg: 'var(--p-teal-700)' },
  MacAddress: { label: 'MAC', bg: 'var(--p-surface-200)', fg: 'var(--p-text-muted-color)' },
  Vendor: { label: 'Vendor', bg: 'var(--p-orange-100)', fg: 'var(--p-orange-700)' },
  Model: { label: 'Model', bg: 'var(--p-purple-100)', fg: 'var(--p-purple-700)' },
}

const sortedRows = computed(() => {
  const attrs = schema.value ?? []
  const vals = properties.value ?? {}
  return [...attrs]
    .sort((a, b) => {
      const aS = a.systemType !== 'None'
      const bS = b.systemType !== 'None'
      if (aS !== bS) return aS ? -1 : 1
      if (aS) {
        return SYSTEM_TYPE_ORDER.indexOf(a.systemType) - SYSTEM_TYPE_ORDER.indexOf(b.systemType)
      }
      return a.displayName.localeCompare(b.displayName)
    })
    .map((attr) => ({ ...attr, value: vals[attr.name] ?? null }))
})

function getEnumOptions(attr) {
  if (attr.enumMap && Object.keys(attr.enumMap).length) {
    // enumMap: { displayName: sortOrder }; the stored value is the display name
    return Object.entries(attr.enumMap)
      .sort(([, a], [, b]) => Number(a) - Number(b))
      .map(([label]) => ({ key: label, label }))
  }
  if (attr.enumValues) {
    return Object.entries(attr.enumValues).map(([key, label]) => ({ key, label }))
  }
  return []
}

function getEnumLabel(attr, storedValue) {
  if (!storedValue) return null
  if (attr.enumMap && Object.keys(attr.enumMap).length) return storedValue
  return attr.enumValues?.[storedValue] ?? storedValue
}

function formatDateForApi(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateDisplay(iso) {
  if (!iso) return '—'
  // Asset date fields are free text on the server, so an unparseable value is shown as-is.
  return formatDateMedium(iso, { fallback: iso })
}

function startEditRow(data) {
  editingName.value = data.name
  editForm.value = { [data.name]: data.value }
}

function saveEditRow() {
  const name = editingName.value
  updateProperty.mutate({
    objectId: objectId.value,
    name,
    value: editForm.value[name] ?? '',
  })
  editingName.value = null
  editForm.value = {}
}

function cancelEditRow() {
  editingName.value = null
  editForm.value = {}
}

function confirmDelete(attr) {
  confirm.require({
    header: 'Confirm Delete',
    message: `Delete the value for "${attr.displayName}"?`,
    icon: 'pi pi-trash',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => deleteProperty.mutate({ objectId: objectId.value, name: attr.name }),
  })
}
</script>

<template>
  <div class="asset-detail-view">
    <div v-if="object?.linkedObject" class="asset-info-bar">
      <span class="linked-chip">
        <i class="pi pi-link" />
        {{ object.linkedObject.name }}
      </span>
    </div>

    <div v-if="isLoading" class="state-overlay">
      <ProgressSpinner style="width: 2rem; height: 2rem" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="combinedError"
      message="Failed to load asset properties."
      class="asset-load-error"
      @retry="retryLoad"
    />

    <DataTable
      v-else
      :value="sortedRows"
      data-key="name"
      striped-rows
      show-gridlines
      scrollable
      scroll-height="flex"
      class="asset-props-table"
    >
      <Column field="displayName" header="Property" style="width: 220px">
        <template #body="{ data }">
          <span class="prop-display-name">{{ data.displayName }}</span>
        </template>
      </Column>

      <Column header="Value">
        <template #body="{ data }">
          <template v-if="data.name === editingName">
            <InputText
              v-if="['String', 'IPAddress', 'MacAddress', 'UUID'].includes(data.dataType)"
              v-model="editForm[data.name]"
              size="small"
              class="w-full"
              @keyup.enter="saveEditRow"
              @keyup.escape="cancelEditRow"
            />
            <InputNumber
              v-else-if="data.dataType === 'Integer'"
              :model-value="editForm[data.name] != null ? Number(editForm[data.name]) : null"
              @update:model-value="editForm[data.name] = $event != null ? String($event) : ''"
              :use-grouping="false"
              :min-fraction-digits="0"
              :max-fraction-digits="0"
              size="small"
              class="w-full"
            />
            <InputNumber
              v-else-if="data.dataType === 'Number'"
              :model-value="editForm[data.name] != null ? Number(editForm[data.name]) : null"
              @update:model-value="editForm[data.name] = $event != null ? String($event) : ''"
              size="small"
              class="w-full"
            />
            <ToggleSwitch
              v-else-if="data.dataType === 'Boolean'"
              :model-value="editForm[data.name] === 'true'"
              @update:model-value="editForm[data.name] = String($event)"
            />
            <Select
              v-else-if="data.dataType === 'Enum'"
              v-model="editForm[data.name]"
              :options="getEnumOptions(data)"
              option-value="key"
              option-label="label"
              size="small"
              class="w-full"
            />
            <DatePicker
              v-else-if="data.dataType === 'Date'"
              :model-value="editForm[data.name] ? new Date(editForm[data.name]) : null"
              @update:model-value="editForm[data.name] = $event ? formatDateForApi($event) : ''"
              date-format="yy-mm-dd"
              size="small"
              class="w-full"
            />
            <InputText
              v-else
              v-model="editForm[data.name]"
              size="small"
              class="w-full"
              @keyup.enter="saveEditRow"
              @keyup.escape="cancelEditRow"
            />
          </template>

          <template v-else>
            <template v-if="data.dataType === 'Boolean'">
              <i v-if="data.value === 'true'" class="pi pi-check prop-bool-true" />
              <span v-else class="prop-value-empty">—</span>
            </template>
            <span v-else-if="data.dataType === 'Enum' && data.value" class="prop-value">
              {{ getEnumLabel(data, data.value) ?? data.value }}
            </span>
            <span v-else-if="data.dataType === 'Date' && data.value" class="prop-value">
              {{ formatDateDisplay(data.value) }}
            </span>
            <span v-else :class="data.value ? 'prop-value' : 'prop-value-empty'">
              {{ data.value ?? '—' }}
            </span>
          </template>
        </template>
      </Column>

      <Column field="isMandatory" header="Mandatory" style="width: 110px; text-align: center">
        <template #body="{ data }">
          <i v-if="data.isMandatory" class="pi pi-check mandatory-check" />
          <span v-else class="muted-dash">—</span>
        </template>
      </Column>

      <Column field="isUnique" header="Unique" style="width: 90px; text-align: center">
        <template #body="{ data }">
          <i v-if="data.isUnique" class="pi pi-lock unique-lock" />
          <span v-else class="muted-dash">—</span>
        </template>
      </Column>

      <Column field="systemType" header="System Type" style="width: 140px">
        <template #body="{ data }">
          <span
            v-if="data.systemType !== 'None' && SYSTEM_TYPE_CHIPS[data.systemType]"
            class="system-type-chip"
            :style="{
              background: SYSTEM_TYPE_CHIPS[data.systemType].bg,
              color: SYSTEM_TYPE_CHIPS[data.systemType].fg,
            }"
          >
            {{ SYSTEM_TYPE_CHIPS[data.systemType].label }}
          </span>
        </template>
      </Column>

      <Column header="Actions" style="width: 120px">
        <template #body="{ data }">
          <div class="actions-cell">
            <template v-if="data.name === editingName">
              <Button
                icon="pi pi-check"
                text
                severity="success"
                size="small"
                v-tooltip.left="'Save'"
                aria-label="Save"
                @click="saveEditRow"
              />
              <Button
                icon="pi pi-times"
                text
                severity="secondary"
                size="small"
                v-tooltip.left="'Cancel'"
                aria-label="Cancel"
                @click="cancelEditRow"
              />
            </template>
            <template v-else>
              <Button
                icon="pi pi-pencil"
                text
                severity="secondary"
                size="small"
                v-tooltip.left="'Edit value'"
                aria-label="Edit value"
                @click="startEditRow(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                severity="danger"
                size="small"
                :disabled="data.isMandatory || !data.value"
                v-tooltip.left="
                  data.isMandatory ? 'Mandatory properties cannot be deleted' : 'Delete value'
                "
                :aria-label="
                  data.isMandatory ? 'Mandatory properties cannot be deleted' : 'Delete value'
                "
                @click="confirmDelete(data)"
              />
            </template>
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.asset-detail-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.asset-info-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  min-height: 2.5rem;
  flex-shrink: 0;
}

.linked-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  background: var(--p-surface-100);
  border: 1px solid var(--p-surface-200);
  color: var(--p-text-color);
  font-size: 0.75rem;
  font-weight: 500;
}

.state-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-load-error {
  flex: 1;
  justify-content: center;
}

.asset-props-table {
  flex: 1;
  min-height: 0;
}

.asset-props-table :deep(.p-datatable-table) {
  table-layout: fixed;
}

/* Keep editor inputs from expanding the row height */
.asset-props-table :deep(.p-inputtext),
.asset-props-table :deep(.p-select),
.asset-props-table :deep(.p-inputnumber .p-inputtext) {
  padding-block: 0.25rem;
}

.asset-props-table :deep(.p-datepicker-input) {
  padding-block: 0.25rem;
}

.prop-display-name {
  font-weight: 600;
}

.prop-value {
  color: var(--p-text-color);
}

.prop-value-empty {
  color: var(--p-text-muted-color);
}

.prop-bool-true {
  color: var(--p-green-500);
  font-size: 0.875rem;
}

.mandatory-check {
  color: var(--p-green-500);
  font-size: 0.875rem;
}

.unique-lock {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.muted-dash {
  color: var(--p-text-muted-color);
}

.system-type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  padding-right: 0.75rem;
}
</style>
