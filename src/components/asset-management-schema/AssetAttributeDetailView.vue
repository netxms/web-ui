<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useToast } from 'primevue/usetoast'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import {
  useCreateAssetAttribute,
  useUpdateAssetAttribute,
} from '@/queries/useAssetManagementSchemaQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  attribute: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const toast = useToast()

const DATA_TYPES = [
  { value: 'String', label: 'String' },
  { value: 'Integer', label: 'Integer' },
  { value: 'Number', label: 'Number' },
  { value: 'Boolean', label: 'Boolean' },
  { value: 'Enum', label: 'Enum' },
  { value: 'MacAddress', label: 'MAC Address' },
  { value: 'IPAddress', label: 'IP Address' },
  { value: 'UUID', label: 'UUID' },
  { value: 'ObjectReference', label: 'Object Reference' },
  { value: 'Date', label: 'Date' },
]

const SYSTEM_TYPES = [
  { value: 'None', label: 'None' },
  { value: 'Serial', label: 'Serial Number' },
  { value: 'IPAddress', label: 'IP Address' },
  { value: 'MacAddress', label: 'MAC Address' },
  { value: 'Vendor', label: 'Vendor' },
  { value: 'Model', label: 'Model' },
]

const RANGE_TYPES = ['String', 'Integer', 'Number']

const NAME_PATTERN = /^[A-Za-z$_][A-Za-z0-9$_]*$/

function enumMapToRows(enumMap) {
  if (!enumMap || typeof enumMap !== 'object') return []
  return Object.entries(enumMap).map(([key, label]) => ({ key, label }))
}

function rowsToEnumMap(rows) {
  const map = {}
  for (const row of rows) {
    if (row.key) map[row.key] = row.label
  }
  return map
}

function buildForm(attribute) {
  const rangeMin = attribute?.rangeMin ?? 0
  const rangeMax = attribute?.rangeMax ?? 0
  return {
    name: attribute?.name ?? '',
    displayName: attribute?.displayName ?? '',
    dataType: attribute?.dataType ?? 'String',
    systemType: attribute?.systemType ?? 'None',
    isMandatory: attribute?.isMandatory ?? false,
    isUnique: attribute?.isUnique ?? false,
    isHidden: attribute?.isHidden ?? false,
    autofillScript: attribute?.autofillScript ?? '',
    useLimits: rangeMin !== 0 || rangeMax !== 0,
    rangeMin,
    rangeMax,
    enumRows: enumMapToRows(attribute?.enumMap),
  }
}

const form = ref(buildForm(props.attribute))
const nameError = ref('')

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildForm(props.attribute)),
)

watch(
  () => props.attribute,
  (attribute) => {
    form.value = buildForm(attribute)
    nameError.value = ''
  },
)

const isNew = computed(() => props.attribute === null)

const showRangeSection = computed(() => RANGE_TYPES.includes(form.value.dataType))

const rangeLabels = computed(() =>
  form.value.dataType === 'String'
    ? { min: 'Min length', max: 'Max length' }
    : { min: 'Min value', max: 'Max value' },
)

const {
  mutate: createAttribute,
  isPending: isCreating,
  error: createError,
} = useCreateAssetAttribute()

const {
  mutate: updateAttribute,
  isPending: isUpdating,
  error: updateError,
} = useUpdateAssetAttribute()

const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function addEnumRow() {
  form.value.enumRows.push({ key: '', label: '' })
}

function removeEnumRow(index) {
  form.value.enumRows.splice(index, 1)
}

function onCompile(result) {
  if (result.success) {
    const wCount = result.warnings?.length ?? 0
    toast.add({
      severity: 'success',
      summary: 'Compiled',
      detail: wCount
        ? `Compiled with ${wCount} warning${wCount > 1 ? 's' : ''}`
        : 'Script compiled successfully.',
      life: 3000,
    })
  } else {
    toast.add({
      severity: 'error',
      summary: 'Compile error',
      detail: result.error?.message ?? 'Script compilation failed.',
      life: 4000,
    })
  }
}

function save() {
  if (isNew.value) {
    if (!NAME_PATTERN.test(form.value.name)) {
      nameError.value =
        'Name must start with a letter, $, or _ and contain only letters, digits, $, or _.'
      return
    }
    nameError.value = ''
  }

  const payload = {
    displayName: form.value.displayName || undefined,
    dataType: form.value.dataType,
    systemType: form.value.systemType !== 'None' ? form.value.systemType : undefined,
    isMandatory: form.value.isMandatory || undefined,
    isUnique: form.value.isUnique || undefined,
    isHidden: form.value.isHidden || undefined,
    autofillScript: form.value.autofillScript || undefined,
    rangeMin:
      showRangeSection.value && form.value.useLimits && form.value.rangeMin
        ? form.value.rangeMin
        : undefined,
    rangeMax:
      showRangeSection.value && form.value.useLimits && form.value.rangeMax
        ? form.value.rangeMax
        : undefined,
    enumMap: form.value.dataType === 'Enum' ? rowsToEnumMap(form.value.enumRows) : undefined,
  }

  if (isNew.value) {
    createAttribute({ name: form.value.name, ...payload }, { onSuccess: () => emit('close') })
  } else {
    updateAttribute(
      { name: props.attribute.name, data: payload },
      { onSuccess: () => emit('saved') },
    )
  }
}

function discard() {
  form.value = buildForm(props.attribute)
  nameError.value = ''
  if (isNew.value) emit('close')
}

const title = computed(() =>
  isNew.value
    ? 'New Asset Attribute'
    : props.attribute?.displayName || props.attribute?.name || 'Asset Attribute',
)
</script>

<template>
  <div class="asset-attribute-detail">
    <EntityDetailHeader :title="title" subtitle="Asset Attribute" @back="emit('close')">
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
          :disabled="!isDirty || isPending"
          :loading="isPending"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <div class="detail-content">
      <MutationErrorState :error="mutationError" class="error-message" />

      <div class="detail-cards-grid">
        <DetailCard title="Identity">
          <FormField
            class="detail-field"
            :class="{ 'detail-field-error': nameError }"
            label="Name"
            group
          >
            <div class="field-with-error">
              <InputText
                id="attr-name"
                v-model="form.name"
                :disabled="!isNew"
                placeholder="e.g. serialNumber"
                class="field-input"
                :invalid="!!nameError"
              />
              <small v-if="nameError" class="field-error-msg">{{ nameError }}</small>
            </div>
          </FormField>
          <FormField class="detail-field" label="Display Name" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.displayName"
              placeholder="Human-readable label"
              class="field-input"
            />
          </FormField>
        </DetailCard>

        <DetailCard title="Data Type">
          <FormField class="detail-field" label="Data Type" v-slot="{ id }">
            <Select
              :input-id="id"
              id="attr-data-type"
              v-model="form.dataType"
              :options="DATA_TYPES"
              option-label="label"
              option-value="value"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="System Type" v-slot="{ id }">
            <Select
              :input-id="id"
              id="attr-system-type"
              v-model="form.systemType"
              :options="SYSTEM_TYPES"
              option-label="label"
              option-value="value"
              class="field-input"
            />
          </FormField>
        </DetailCard>

        <DetailCard title="Constraints" :wide="true">
          <FormField class="detail-field" label="Mandatory" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.isMandatory" input-id="attr-mandatory" />
              <label for="attr-mandatory" class="toggle-label"
                >Value is required on all assets</label
              >
            </div>
          </FormField>
          <FormField class="detail-field" label="Unique" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.isUnique" input-id="attr-unique" />
              <label for="attr-unique" class="toggle-label"
                >Value must be unique across all assets</label
              >
            </div>
          </FormField>
          <FormField class="detail-field" label="Hidden" group>
            <div class="toggle-field">
              <ToggleSwitch v-model="form.isHidden" input-id="attr-hidden" />
              <label for="attr-hidden" class="toggle-label">Hide attribute in the UI</label>
            </div>
          </FormField>
          <template v-if="showRangeSection">
            <FormField class="detail-field" label="Use limits" group>
              <div class="toggle-field">
                <ToggleSwitch v-model="form.useLimits" input-id="attr-use-limits" />
                <label for="attr-use-limits" class="toggle-label">
                  {{
                    form.dataType === 'String' ? 'Enforce min/max length' : 'Enforce min/max value'
                  }}
                </label>
              </div>
            </FormField>
            <template v-if="form.useLimits">
              <FormField class="detail-field" :label="`${rangeLabels.min}`" v-slot="{ id }">
                <InputNumber
                  :input-id="id"
                  id="attr-range-min"
                  v-model="form.rangeMin"
                  :min="0"
                  show-buttons
                  class="field-input"
                />
              </FormField>
              <FormField class="detail-field" :label="`${rangeLabels.max}`" v-slot="{ id }">
                <InputNumber
                  :input-id="id"
                  id="attr-range-max"
                  v-model="form.rangeMax"
                  :min="0"
                  show-buttons
                  class="field-input"
                />
              </FormField>
            </template>
          </template>
        </DetailCard>

        <DetailCard v-if="form.dataType === 'Enum'" title="Enum Values" :wide="true">
          <div v-if="form.enumRows.length === 0" class="enum-empty">
            No values defined. Add values below.
          </div>
          <div v-for="(row, index) in form.enumRows" :key="index" class="enum-row">
            <InputText
              v-model="row.key"
              placeholder="Value key"
              class="enum-key-input"
              size="small"
            />
            <InputText
              v-model="row.label"
              placeholder="Display label"
              class="enum-label-input"
              size="small"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              aria-label="Remove"
              @click="removeEnumRow(index)"
            />
          </div>
          <div class="enum-add-row">
            <Button
              label="Add Value"
              icon="pi pi-plus"
              severity="secondary"
              size="small"
              @click="addEnumRow"
            />
          </div>
        </DetailCard>

        <DetailCard title="Autofill Script" :wide="true">
          <div class="detail-field detail-field-block">
            <NxslScriptEditor
              v-model="form.autofillScript"
              hint-key="asset-autofill"
              show-compile
              placeholder="// Return new value for asset property"
              :rows="8"
              @compile="onCompile"
            />
          </div>
        </DetailCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asset-attribute-detail {
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
  /* The global .form-field in forms.css is column; a scoped rule only overrides what it names. */
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
/* FormField renders the label, so it carries no scope id of this file. */
.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 10rem;
  flex-shrink: 0;
}

.detail-field-block {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding-top: 0.75rem;
}

.detail-field-block .nxsl-script-editor {
  width: 100%;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-with-error {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-with-error .field-input {
  flex: unset;
  width: 100%;
}

.field-error-msg {
  font-size: 0.75rem;
  color: var(--p-red-500);
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

.enum-empty {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0;
}

.enum-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.enum-row:last-of-type {
  border-bottom: none;
}

.enum-key-input {
  width: 10rem;
  flex-shrink: 0;
}

.enum-label-input {
  flex: 1;
  min-width: 0;
}

.enum-add-row {
  padding-top: 0.75rem;
}
</style>
