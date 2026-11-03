<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import EventSelectField from '@/components/epp/EventSelectField.vue'
import MibOidPickerDialog from '@/components/mibs/MibOidPickerDialog.vue'
import SnmpTrapParameterDialog from './SnmpTrapParameterDialog.vue'
import {
  useCreateSnmpTrapMapping,
  useUpdateSnmpTrapMapping,
} from '@/queries/useSnmpTrapMappingQueries'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { normalizeOid, oidError } from '@/utils/snmpOid'
import {
  EVENT_SNMP_UNMATCHED_TRAP,
  FIRST_PARAMETER_NUMBER,
  FLAG_FORCE_TEXT,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENT_TAG_LENGTH,
  MAX_OID_LENGTH,
  parameterSource,
  toParameterRequest,
} from '@/utils/snmpTrapMappings'

/**
 * Save sends the whole mapping in one PUT (the parameter list replaces the stored one).
 */
const props = defineProps({
  /** The mapping, or null to create one. */
  mapping: { type: Object, default: null },
})

const emit = defineEmits(['close', 'created'])

const toast = useToast()

const isNew = computed(() => props.mapping === null)

const form = ref({})
/** Parameters carry a local `id` so rows keep their identity while being reordered. */
const parameters = ref([])
let nextParameterId = 0

function snapshot() {
  return JSON.stringify({
    ...form.value,
    parameters: parameters.value.map((p) => [p.oid, p.position, p.description, p.flags]),
  })
}

const baseline = ref('')

function load(mapping) {
  form.value = {
    oid: mapping?.oid ?? '',
    eventCode: mapping?.eventCode ?? EVENT_SNMP_UNMATCHED_TRAP,
    eventTag: mapping?.eventTag ?? '',
    description: mapping?.description ?? '',
    transformationScript: mapping?.transformationScript ?? '',
  }
  parameters.value = (mapping?.parameters ?? []).map((p) => ({ id: ++nextParameterId, ...p }))
  baseline.value = snapshot()
}

load(props.mapping)

const isDirty = computed(() => snapshot() !== baseline.value)

// A refetch must not wipe edits in progress; an unchanged form follows the server.
watch(
  () => props.mapping,
  (mapping) => {
    if (!isDirty.value) load(mapping)
  },
)

useUnsavedChangesGuard(isDirty, { includeRouteUpdates: true })

const oidTouched = ref(false)
const oidProblem = computed(() => oidError(form.value.oid, { maxLength: MAX_OID_LENGTH }))
// A new, still-empty form does not open on an error; a bad OID shows once typed or on Save.
const shownOidError = computed(() =>
  oidTouched.value || form.value.oid.trim() ? oidProblem.value : '',
)
const eventError = computed(() => (form.value.eventCode ? '' : 'Event is required'))
const isValid = computed(() => !oidProblem.value && !eventError.value)

const {
  mutate: createMapping,
  isPending: isCreating,
  error: createError,
} = useCreateSnmpTrapMapping()
const {
  mutate: updateMapping,
  isPending: isUpdating,
  error: updateError,
} = useUpdateSnmpTrapMapping()

const isSaving = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

function save() {
  oidTouched.value = true
  if (!isValid.value) return
  const data = {
    oid: normalizeOid(form.value.oid),
    eventCode: form.value.eventCode,
    eventTag: form.value.eventTag.trim(),
    description: form.value.description,
    transformationScript: form.value.transformationScript,
    parameters: parameters.value.map(toParameterRequest),
  }

  if (isNew.value) {
    createMapping(data, {
      onSuccess: (mapping) => {
        load(mapping)
        emit('created', mapping.id)
      },
    })
  } else {
    updateMapping(
      { id: props.mapping.id, data },
      {
        onSuccess: (mapping) => {
          load(mapping)
          toast.add({
            severity: 'success',
            summary: 'Saved',
            detail: `SNMP trap ${mapping.id} saved.`,
            life: 3000,
          })
        },
      },
    )
  }
}

function discard() {
  oidTouched.value = false
  load(props.mapping)
  if (isNew.value) emit('close')
}

const title = computed(() => {
  if (isNew.value) return 'New SNMP Trap'
  return props.mapping.description || props.mapping.oid || 'SNMP Trap'
})

const oidPickerVisible = ref(false)

function onTrapOidPicked(oid) {
  form.value.oid = oid
  oidTouched.value = true
}

const parameterDialogVisible = ref(false)
const editingParameter = ref(null)

function openAddParameter() {
  editingParameter.value = null
  parameterDialogVisible.value = true
}

function openEditParameter(parameter) {
  editingParameter.value = parameter
  parameterDialogVisible.value = true
}

function onParameterSave(values) {
  if (editingParameter.value) {
    const id = editingParameter.value.id
    parameters.value = parameters.value.map((p) => (p.id === id ? { ...p, ...values } : p))
  } else {
    parameters.value = [...parameters.value, { id: ++nextParameterId, ...values }]
  }
}

// Deleting only touches the working copy, so it does not ask first.
function deleteParameter(index) {
  parameters.value = parameters.value.filter((_, i) => i !== index)
}

function moveParameter(index, delta) {
  const target = index + delta
  if (target < 0 || target >= parameters.value.length) return
  const next = [...parameters.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  parameters.value = next
}
</script>

<template>
  <div class="trap-mapping-detail">
    <EntityDetailHeader :title="title" subtitle="SNMP Trap" @back="emit('close')">
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
            <InputText :id="id" :model-value="String(mapping.id)" disabled class="field-input" />
          </FormField>
          <FormField class="detail-field" label="GUID" v-slot="{ id }">
            <InputText :id="id" :model-value="mapping.guid" disabled class="field-input" />
          </FormField>
        </DetailCard>

        <DetailCard title="General" :wide="isNew">
          <FormField class="detail-field" label="Description" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.description"
              :maxlength="MAX_DESCRIPTION_LENGTH"
              :autofocus="isNew"
              class="field-input"
            />
          </FormField>
          <FormField
            class="detail-field"
            label="Trap OID"
            required
            :error="shownOidError"
            :empty="!form.oid.trim()"
            v-slot="{ id, describedBy }"
          >
            <div class="oid-row">
              <InputText
                :id="id"
                v-model="form.oid"
                :aria-describedby="describedBy"
                :maxlength="MAX_OID_LENGTH"
                placeholder="e.g. 1.3.6.1.6.3.1.1.5.3"
                spellcheck="false"
                class="field-input mono-input"
                @blur="oidTouched = true"
              />
              <Button
                label="Select..."
                icon="pi pi-sitemap"
                size="small"
                severity="secondary"
                outlined
                @click="oidPickerVisible = true"
              />
            </div>
          </FormField>
          <FormField class="detail-field" label="Event" required :error="eventError" group>
            <EventSelectField v-model="form.eventCode" />
          </FormField>
          <FormField class="detail-field" label="Event Tag" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="form.eventTag"
              :maxlength="MAX_EVENT_TAG_LENGTH"
              placeholder="Optional"
              class="field-input"
            />
          </FormField>
        </DetailCard>

        <DetailCard :title="`Parameters (${parameters.length})`" wide>
          <div class="parameters-body">
            <div class="parameters-toolbar">
              <Button
                label="Add Parameter"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                @click="openAddParameter"
              />
              <span class="parameters-hint">
                Event parameter 1 is the trap OID; these varbinds follow in this order. A varbind
                missing from a trap is skipped, and the parameters after it move up.
              </span>
            </div>

            <div v-if="parameters.length === 0" class="parameters-empty">
              No parameter mappings. The event gets only the trap OID.
            </div>

            <DataTable
              v-else
              :value="parameters"
              data-key="id"
              class="parameters-table"
              :reorderable-rows="true"
              @row-reorder="(e) => (parameters = e.value)"
            >
              <Column row-reorder style="width: 2.5rem" />

              <Column header="Event Parameter" style="width: 9rem">
                <template #body="{ index }">
                  <span class="text-muted">{{ index + FIRST_PARAMETER_NUMBER }}</span>
                </template>
              </Column>

              <Column header="Varbind" style="min-width: 14rem">
                <template #body="{ data }">
                  <span :class="data.position > 0 ? 'varbind-position' : 'mono'">
                    {{ parameterSource(data) }}
                  </span>
                </template>
              </Column>

              <Column header="Description" style="min-width: 10rem">
                <template #body="{ data }">
                  <span :class="{ 'text-muted': !data.description }">
                    {{ data.description || '-' }}
                  </span>
                </template>
              </Column>

              <Column header="Options" style="width: 8rem">
                <template #body="{ data }">
                  <Tag
                    v-if="data.flags & FLAG_FORCE_TEXT"
                    v-tooltip.top="'Never convert value to hex string'"
                    value="Text"
                    severity="secondary"
                    outlined
                  />
                  <span v-else class="text-muted">-</span>
                </template>
              </Column>

              <Column style="width: 9.5rem">
                <template #body="{ data, index }">
                  <div class="row-actions">
                    <Button
                      v-tooltip.top="'Move up'"
                      icon="pi pi-arrow-up"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Move up"
                      :disabled="index === 0"
                      @click="moveParameter(index, -1)"
                    />
                    <Button
                      v-tooltip.top="'Move down'"
                      icon="pi pi-arrow-down"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Move down"
                      :disabled="index === parameters.length - 1"
                      @click="moveParameter(index, 1)"
                    />
                    <Button
                      icon="pi pi-pencil"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Edit"
                      @click="openEditParameter(data)"
                    />
                    <Button
                      icon="pi pi-trash"
                      text
                      rounded
                      severity="danger"
                      size="small"
                      aria-label="Delete"
                      @click="deleteParameter(index)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </DetailCard>

        <DetailCard title="Transformation Script" wide>
          <div class="script-body">
            <NxslScriptEditor
              v-model="form.transformationScript"
              hint-key="snmp-trap-transformation"
              show-compile
              placeholder="// Optional: adjust $event before it is generated"
              :rows="10"
            />
          </div>
        </DetailCard>
      </div>
    </div>

    <MibOidPickerDialog
      v-model:visible="oidPickerVisible"
      :oid="form.oid"
      header="Select Trap OID"
      @select="onTrapOidPicked"
    />

    <SnmpTrapParameterDialog
      v-model:visible="parameterDialogVisible"
      :parameter="editingParameter"
      @save="onParameterSave"
    />
  </div>
</template>

<style scoped>
.trap-mapping-detail {
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

/* The label is rendered by FormField, so it carries that component's scope id. */
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

.oid-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.mono-input,
.mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.parameters-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0;
}

.parameters-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.parameters-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.parameters-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.varbind-position {
  font-size: 0.875rem;
}

.row-actions {
  display: flex;
  gap: 0.125rem;
  justify-content: flex-end;
}

.script-body {
  padding: 0.75rem 0;
}

.script-body .nxsl-script-editor {
  width: 100%;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
