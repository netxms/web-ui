<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import EventSelectField from '@/components/epp/EventSelectField.vue'
import DciThresholdDialog from '../DciThresholdDialog.vue'
import { useDciFlags } from '@/composables/useDciFlags'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { thresholdFunctionLabel, thresholdConditionLabel } from '@/utils/dciThresholdUtils'
import {
  ANOMALY_DIRECTION_OPTIONS,
  ANOMALY_MODE_OPTIONS,
  anomalyModelStatus,
  anomalyTrainingWarnings,
  anomalyTuningSummary,
  hardBoundsError,
  hasAnomalySettings,
} from '@/utils/dciAnomaly'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  form: { type: Object, required: true },
  /** The configuration as last read; null for a new DCI. */
  saved: { type: Object, default: null },
  dciType: { type: String, default: 'item' },
  /** Node or template. */
  objectId: { type: Number, default: null },
  ownerObject: { type: Object, default: null },
})

const flags = useDciFlags(props.form)

// Instance discovery owns the instance name then; legacy keeps it read-only.
const fromInstanceDiscovery = computed(
  () => props.objectId != null && props.form.templateId === props.objectId,
)

const hasAnomalyObject = computed(() => hasAnomalySettings(props.form))
const anomaly = computed(() => props.form.anomalyDetection)
const savedAnomaly = computed(() => props.saved?.anomalyDetection ?? null)
const anomalyOn = computed(() =>
  hasAnomalyObject.value ? anomaly.value.enabled === true : flags.detectAnomalies.value,
)

const { has: hasServerComponent } = useServerComponents()
// Kept while on, so it can still be turned off once the assistant is gone.
const showAiTuning = computed(
  () =>
    hasServerComponent(SERVER_COMPONENTS.AI_ASSISTANT) || savedAnomaly.value?.llmTuning === true,
)

function setAnomalyEnabled(on) {
  anomaly.value.enabled = on
  if (!on) anomaly.value.llmTuning = false
}

function setHardBound(side, value) {
  const next = { ...anomaly.value.hardBounds, [side]: value ?? null }
  for (const key of ['min', 'max']) if (next[key] == null) delete next[key]
  if (Object.keys(next).length) {
    anomaly.value.hardBounds = next
  } else if (savedAnomaly.value?.hardBounds != null) {
    anomaly.value.hardBounds = null
  } else {
    // Never set and still empty: leaves the form clean.
    delete anomaly.value.hardBounds
  }
}

const anomalyWarnings = computed(() =>
  hasAnomalyObject.value && anomalyOn.value ? anomalyTrainingWarnings(props.form, props.saved) : [],
)
const anomalyTuningText = computed(() =>
  anomaly.value?.llmTuning ? anomalyTuningSummary(savedAnomaly.value?.tuning) : null,
)
const anomalyModelText = computed(() =>
  savedAnomaly.value?.enabled && anomalyOn.value ? anomalyModelStatus(savedAnomaly.value) : null,
)

const openPanels = ref(['thresholds', ...(anomalyOn.value ? ['anomaly'] : [])])

const DELTA_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'simple', label: 'Simple difference' },
  { value: 'averagePerSecond', label: 'Average per second' },
  { value: 'averagePerMinute', label: 'Average per minute' },
]

const DATA_TYPE_OPTIONS = [
  { value: 'int32', label: 'Integer (32-bit)' },
  { value: 'uint32', label: 'Unsigned Integer (32-bit)' },
  { value: 'int64', label: 'Integer (64-bit)' },
  { value: 'uint64', label: 'Unsigned Integer (64-bit)' },
  { value: 'float', label: 'Floating Point' },
  { value: 'string', label: 'String' },
  { value: 'counter32', label: 'Counter (32-bit)' },
  { value: 'counter64', label: 'Counter (64-bit)' },
  { value: 'null', label: 'Same as collected' },
]

const RETENTION_MODE_OPTIONS = [
  { value: 0, label: 'Server default' },
  { value: -1, label: 'Custom' },
]

const customHourlyRetention = computed(() => props.form.hourlyRetention > 0)
const customDailyRetention = computed(() => props.form.dailyRetention > 0)

const showThresholdDialog = ref(false)
const editingThreshold = ref(null)
const editingThresholdIndex = ref(-1)

function addThreshold() {
  editingThreshold.value = null
  editingThresholdIndex.value = -1
  showThresholdDialog.value = true
}

function editThreshold(t) {
  editingThreshold.value = { ...t }
  editingThresholdIndex.value = (props.form.thresholds ?? []).indexOf(t)
  showThresholdDialog.value = true
}

function saveThreshold(t) {
  const thresholds = [...(props.form.thresholds ?? [])]
  if (editingThresholdIndex.value >= 0) {
    thresholds.splice(editingThresholdIndex.value, 1, t)
    editingThresholdIndex.value = -1
  } else {
    thresholds.push(t)
  }
  props.form.thresholds = thresholds
}

function duplicateThreshold(t) {
  const copy = { ...t }
  delete copy.id
  props.form.thresholds = [...(props.form.thresholds ?? []), copy]
}

function deleteThreshold(t) {
  props.form.thresholds = (props.form.thresholds ?? []).filter((x) => x !== t)
}

function thresholdStatusSeverity(t) {
  return t.disabled ? 'secondary' : 'success'
}

// Cluster options: for Cluster/Template owners, or a node with a Cluster among its immediate
// parents (not the full ancestor chain), as in legacy.

const AGGREGATION_FUNCTION_OPTIONS = [
  { value: 0, label: 'Total' },
  { value: 1, label: 'Average' },
  { value: 2, label: 'Min' },
  { value: 3, label: 'Max' },
]

const parentIds = computed(() => props.ownerObject?.parents ?? [])
const { objectsById: parentObjectsById } = useObjectsByIds(parentIds)

const clusterParent = computed(() => {
  for (const parent of parentObjectsById.value.values()) {
    if (parent.class === 'Cluster') return parent
  }
  return null
})

const showClusterOptions = computed(() => {
  const cls = props.ownerObject?.class
  return cls === 'Cluster' || cls === 'Template' || clusterParent.value != null
})

const clusterResourceOptions = computed(() => {
  const source = props.ownerObject?.class === 'Cluster' ? props.ownerObject : clusterParent.value
  const resources = source?.resources ?? []
  return [{ value: 0, label: '(none)' }, ...resources.map((r) => ({ value: r.id, label: r.name }))]
})
</script>

<template>
  <div class="processing-tab">
    <Accordion v-model:value="openPanels" multiple class="dci-accordion">
      <AccordionPanel value="transformation">
        <AccordionHeader><span class="panel-title">Transformation</span></AccordionHeader>
        <AccordionContent>
          <div class="accordion-form">
            <FormField label="Transformed Type" v-slot="{ id }">
              <Select
                :input-id="id"
                v-model="form.transformedDataType"
                :options="DATA_TYPE_OPTIONS"
                option-label="label"
                option-value="value"
                class="form-input"
              />
            </FormField>
            <FormField label="Delta Calculation" v-slot="{ id }">
              <Select
                :input-id="id"
                v-model="form.deltaCalculation"
                :options="DELTA_OPTIONS"
                option-label="label"
                option-value="value"
                class="form-input"
              />
            </FormField>
            <FormField label="NXSL Script" group class="form-field--full">
              <NxslScriptEditor
                v-model="form.transformationScript"
                hint-key="dci-transformation"
                show-compile
                :rows="6"
                class="form-input"
              />
            </FormField>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="thresholds">
        <AccordionHeader><span class="panel-title">Thresholds</span></AccordionHeader>
        <AccordionContent>
          <div class="thresholds-panel">
            <FormField v-if="dciType === 'item'" label="Instance Name" v-slot="{ id }">
              <InputText
                :id="id"
                v-model="form.instanceName"
                :readonly="fromInstanceDiscovery"
                :title="fromInstanceDiscovery ? 'Set by instance discovery' : undefined"
                class="form-input"
              />
            </FormField>
            <div class="threshold-option">
              <Checkbox
                v-model="flags.processAllThresholds.value"
                input-id="all-thresholds"
                binary
              />
              <label for="all-thresholds">Process all thresholds (not just first match)</label>
            </div>

            <UnderConstructionOverlay>
              <div class="threshold-option">
                <Checkbox input-id="disable-processing" binary disabled />
                <label for="disable-processing">Disable threshold processing</label>
              </div>
              <div class="threshold-option threshold-option--indent">
                <Checkbox input-id="reenable-at" binary disabled />
                <label for="reenable-at">Re-enable threshold processing at given time</label>
                <DatePicker
                  show-time
                  hour-format="24"
                  size="small"
                  disabled
                  class="form-input-md"
                />
              </div>
            </UnderConstructionOverlay>

            <div class="thresholds-toolbar">
              <Button
                label="Add Threshold"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                outlined
                @click="addThreshold"
              />
            </div>

            <DataTable
              :value="form.thresholds ?? []"
              size="small"
              class="thresholds-table"
              :show-gridlines="true"
            >
              <template #empty>
                <div class="empty-thresholds">No thresholds configured.</div>
              </template>

              <Column header="Function" style="width: 110px">
                <template #body="{ data }">
                  <code>{{ thresholdFunctionLabel(data.function) }}</code>
                </template>
              </Column>

              <Column header="Condition" style="width: 160px">
                <template #body="{ data }">
                  <span v-if="data.function === 'script'" class="text-muted">script</span>
                  <span v-else-if="data.function === 'error'" class="text-muted">error count</span>
                  <span v-else-if="data.function === 'anomaly'" class="text-muted">anomaly</span>
                  <span v-else>
                    <code>{{ thresholdConditionLabel(data.condition) }}</code>
                    {{ data.value }}
                  </span>
                </template>
              </Column>

              <Column header="Activation Event" style="min-width: 140px">
                <template #body="{ data }">
                  <span class="event-name">{{ data.activationEvent }}</span>
                </template>
              </Column>

              <Column header="Status" style="width: 90px">
                <template #body="{ data }">
                  <Tag
                    :value="data.disabled ? 'Disabled' : 'Active'"
                    :severity="thresholdStatusSeverity(data)"
                    outlined
                  />
                </template>
              </Column>

              <Column style="width: 100px; flex: 0 0 100px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button
                      icon="pi pi-pencil"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Edit"
                      @click="editThreshold(data)"
                    />
                    <Button
                      icon="pi pi-copy"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      aria-label="Duplicate"
                      @click="duplicateThreshold(data)"
                    />
                    <Button
                      icon="pi pi-trash"
                      text
                      rounded
                      severity="danger"
                      size="small"
                      aria-label="Delete"
                      @click="deleteThreshold(data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>

            <FormField label="Rearm Event" group>
              <div class="event-picker-column">
                <EventSelectField v-model="form.allThresholdsRearmEvent" clearable />
                <span class="field-hint-inline"
                  >Generate event when all thresholds are deactivated</span
                >
              </div>
            </FormField>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel v-if="dciType === 'item'" value="anomaly">
        <AccordionHeader><span class="panel-title">Anomaly Detection</span></AccordionHeader>
        <AccordionContent>
          <div class="accordion-form">
            <template v-if="hasAnomalyObject">
              <div class="checkbox-row">
                <Checkbox
                  :model-value="anomaly.enabled"
                  input-id="anomaly-enabled"
                  binary
                  @update:model-value="setAnomalyEnabled"
                />
                <label for="anomaly-enabled">Detect anomalies</label>
              </div>
              <div v-if="showAiTuning" class="checkbox-row">
                <Checkbox
                  v-model="anomaly.llmTuning"
                  input-id="anomaly-llm-tuning"
                  binary
                  :disabled="!anomaly.enabled"
                />
                <label for="anomaly-llm-tuning">Tune settings using AI</label>
              </div>
              <Message
                v-if="anomalyWarnings.length"
                severity="warn"
                size="small"
                :closable="false"
                class="anomaly-warning"
              >
                <p v-for="w in anomalyWarnings" :key="w.id" class="anomaly-warning-line">
                  {{ w.text }}
                </p>
              </Message>
              <FormField label="Sensitivity" v-slot="{ id }">
                <div class="field-with-hint">
                  <InputNumber
                    v-model="anomaly.sensitivity"
                    :input-id="id"
                    :min="0.1"
                    :max="100"
                    :min-fraction-digits="1"
                    :max-fraction-digits="2"
                    placeholder="3.5"
                    :disabled="!anomaly.enabled"
                    class="form-input-sm"
                  />
                  <span class="field-hint-inline"
                    >Standard deviations from the expected value that are still normal; lower
                    is more sensitive</span
                  >
                </div>
              </FormField>
              <FormField label="Report Deviations" v-slot="{ id }">
                <Select
                  v-model="anomaly.direction"
                  :input-id="id"
                  :options="ANOMALY_DIRECTION_OPTIONS"
                  option-label="label"
                  option-value="value"
                  :disabled="!anomaly.enabled"
                  class="form-input-md"
                />
              </FormField>
              <FormField label="Analyze" v-slot="{ id }">
                <Select
                  v-model="anomaly.mode"
                  :input-id="id"
                  :options="ANOMALY_MODE_OPTIONS"
                  option-label="label"
                  option-value="value"
                  :disabled="!anomaly.enabled"
                  class="form-input-md"
                />
              </FormField>
              <FormField label="Training Days" v-slot="{ id }">
                <div class="field-with-hint">
                  <InputNumber
                    v-model="anomaly.minTrainingDays"
                    :input-id="id"
                    :min="1"
                    :max="365"
                    suffix=" days"
                    placeholder="7"
                    :disabled="!anomaly.enabled"
                    class="form-input-sm"
                  />
                  <span class="field-hint-inline"
                    >Minimum days with data before anomalies are reported</span
                  >
                </div>
              </FormField>
              <FormField label="Hard Bounds" group :error="hardBoundsError(anomaly.hardBounds)">
                <div class="field-with-hint">
                  <div class="inline-fields">
                    <InputNumber
                      :model-value="anomaly.hardBounds?.min ?? null"
                      :max-fraction-digits="6"
                      :use-grouping="false"
                      placeholder="Minimum"
                      aria-label="Hard bound minimum"
                      :disabled="!anomaly.enabled"
                      class="form-input-sm"
                      @update:model-value="setHardBound('min', $event)"
                    />
                    <span class="bounds-separator">..</span>
                    <InputNumber
                      :model-value="anomaly.hardBounds?.max ?? null"
                      :max-fraction-digits="6"
                      :use-grouping="false"
                      placeholder="Maximum"
                      aria-label="Hard bound maximum"
                      :disabled="!anomaly.enabled"
                      class="form-input-sm"
                      @update:model-value="setHardBound('max', $event)"
                    />
                  </div>
                  <span class="field-hint-inline"
                    >Values outside them are anomalies, also while the model is learning. Empty
                    for no bound.</span
                  >
                </div>
              </FormField>
              <FormField v-if="anomalyTuningText" label="AI Suggestion" group>
                <span class="readonly-text"
                  >{{ anomalyTuningText }}; used instead of the settings above</span
                >
              </FormField>
              <FormField v-if="anomalyModelText" label="Model" group>
                <span class="readonly-text">{{ anomalyModelText }}</span>
              </FormField>
            </template>
            <template v-else>
              <div class="checkbox-row">
                <Checkbox
                  v-model="flags.detectAnomalies.value"
                  input-id="anomaly-enabled"
                  binary
                />
                <label for="anomaly-enabled">Detect anomalies</label>
              </div>
              <p class="field-note">Anomaly detection settings need a newer server.</p>
            </template>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel v-if="dciType === 'item'" value="aggregation">
        <AccordionHeader><span class="panel-title">Aggregation</span></AccordionHeader>
        <AccordionContent>
          <div class="accordion-form">
            <div class="checkbox-row">
              <Checkbox v-model="form.aggregationDisabled" input-id="agg-disabled" binary />
              <label for="agg-disabled">Disable data aggregation for this DCI</label>
            </div>

            <FormField label="Hourly Aggregate Retention" group>
              <div class="inline-fields">
                <Select
                  :model-value="customHourlyRetention ? -1 : 0"
                  :options="RETENTION_MODE_OPTIONS"
                  option-label="label"
                  option-value="value"
                  class="form-input-md"
                  @update:model-value="
                    (v) => {
                      form.hourlyRetention = v === -1 ? 1 : 0
                    }
                  "
                />
                <InputNumber
                  v-if="customHourlyRetention"
                  v-model="form.hourlyRetention"
                  :min="1"
                  class="form-input-sm"
                  suffix=" days"
                />
              </div>
            </FormField>

            <FormField label="Daily Aggregate Retention" group>
              <div class="inline-fields">
                <Select
                  :model-value="customDailyRetention ? -1 : 0"
                  :options="RETENTION_MODE_OPTIONS"
                  option-label="label"
                  option-value="value"
                  class="form-input-md"
                  @update:model-value="
                    (v) => {
                      form.dailyRetention = v === -1 ? 1 : 0
                    }
                  "
                />
                <InputNumber
                  v-if="customDailyRetention"
                  v-model="form.dailyRetention"
                  :min="1"
                  class="form-input-sm"
                  suffix=" days"
                />
              </div>
            </FormField>

            <p class="field-note">
              Note: on TimescaleDB backend, per-DCI retention overrides are not honored (retention
              is per storage class) and "Disabled" is enforced as a query-time filter only.
            </p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel v-if="showClusterOptions" value="cluster">
        <AccordionHeader><span class="panel-title">Cluster Options</span></AccordionHeader>
        <AccordionContent>
          <div class="accordion-form">
            <FormField label="Associate with Cluster Resource" group>
              <Select
                v-model="form.resourceId"
                :options="clusterResourceOptions"
                option-label="label"
                option-value="value"
                class="form-input"
                :disabled="clusterResourceOptions.length <= 1"
              />
            </FormField>
            <div class="checkbox-row">
              <Checkbox v-model="flags.aggregateOnCluster.value" input-id="agg-on-cluster" binary />
              <label for="agg-on-cluster">Aggregate values from cluster nodes</label>
            </div>
            <div class="checkbox-row">
              <Checkbox
                v-model="flags.aggregateWithErrors.value"
                input-id="agg-with-errors"
                binary
                :disabled="!flags.aggregateOnCluster.value"
              />
              <label for="agg-with-errors">
                Use last known value for aggregation in case of data collection error
              </label>
            </div>
            <div v-if="dciType === 'item'" class="checkbox-row">
              <Checkbox
                v-model="flags.transformAggregated.value"
                input-id="transform-aggregated"
                binary
                :disabled="!flags.aggregateOnCluster.value"
              />
              <label for="transform-aggregated">Run transformation script on aggregated data</label>
            </div>
            <FormField v-if="dciType === 'item'" label="Aggregation Function" v-slot="{ id }">
              <Select
                :input-id="id"
                v-model="flags.aggregationFunction.value"
                :options="AGGREGATION_FUNCTION_OPTIONS"
                option-label="label"
                option-value="value"
                class="form-input"
                :disabled="!flags.aggregateOnCluster.value"
              />
            </FormField>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>

    <DciThresholdDialog
      v-model:visible="showThresholdDialog"
      :threshold="editingThreshold"
      @save="saveThreshold"
    />
  </div>
</template>

<style scoped>
.processing-tab {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
  padding: 1.5rem;
}

:deep(.dci-accordion .p-accordionpanel) {
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border) !important;
  border-radius: var(--p-border-radius-lg, 0.5rem) !important;
  overflow: hidden;
}

:deep(.dci-accordion .p-accordionpanel + .p-accordionpanel) {
  margin-top: 1rem;
}

:deep(.dci-accordion .p-accordionheader) {
  padding: 0.625rem 1rem;
}

:deep(.dci-accordion .p-accordionheader[aria-expanded='true']) {
  border-bottom: 1px solid var(--p-surface-border);
}

:deep(.dci-accordion .p-accordioncontent-content) {
  padding: 0;
}

.panel-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
}

.accordion-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0.5rem 1rem;
}

.form-field {
  display: flex;
  /* Overrides `column` from the global .form-field in forms.css. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

.form-field--full {
  align-items: flex-start;
  padding-top: 0.75rem;
}

/* `:deep` reaches the FormField label; bare `label` covers hand-rolled markup. */
.form-field label,
.form-field :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.form-input-sm {
  width: 8rem;
}

.form-input-md {
  width: 12rem;
}

.inline-fields {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.thresholds-panel {
  padding: 0.5rem 1rem 1rem;
}

.thresholds-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.threshold-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}

.threshold-option label {
  font-size: 0.8125rem;
  cursor: pointer;
}

.thresholds-table {
  --p-datatable-body-cell-padding: 0.25rem 0.5rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.empty-thresholds {
  text-align: center;
  padding: 1rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.event-name {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.text-muted {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.checkbox-row label {
  font-size: 0.875rem;
  cursor: pointer;
}

.field-note {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  margin: 0.5rem 0 0;
  line-height: 1.4;
}

.threshold-option--indent {
  margin-left: 1.5rem;
  flex-wrap: wrap;
}

.event-picker-column {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.field-with-hint {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.bounds-separator {
  color: var(--p-text-muted-color);
}

.anomaly-warning {
  margin: 0.5rem 0;
}

.anomaly-warning-line {
  margin: 0;
}

.readonly-text {
  font-size: 0.8125rem;
  line-height: 1.4;
}

.field-hint-inline {
  display: block;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  margin-top: 0.25rem;
}
</style>
