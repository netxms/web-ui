<script setup>
import { ref, reactive, watch, computed, useId } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import FormField from '@/components/common/FormField.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import EventPickerDialog from '@/components/epp/EventPickerDialog.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'

// The parent keys this by rule GUID, so selecting another rule mounts a fresh form.
const props = defineProps({
  rule: { type: Object, required: true },
  parserType: { type: String, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  /** The parser's "Always process all rules"; while off, Break changes nothing. */
  processAll: { type: Boolean, default: false },
})

const emit = defineEmits(['update:rule', 'move-up', 'move-down', 'duplicate', 'remove'])

const local = reactive({ ...props.rule })

watch(local, () => emit('update:rule', { ...local }), { deep: true })

const TIME_UNITS = [
  { label: 'seconds', value: 1 },
  { label: 'minutes', value: 60 },
  { label: 'hours', value: 3600 },
  { label: 'days', value: 86400 },
]

function secondsToUnit(secs) {
  if (!secs) return { amount: 1, unit: TIME_UNITS[0] }
  for (const u of [...TIME_UNITS].reverse()) {
    if (secs >= u.value && secs % u.value === 0) {
      return { amount: secs / u.value, unit: u }
    }
  }
  return { amount: secs, unit: TIME_UNITS[0] }
}

const initInterval = secondsToUnit(local.absenceInterval || 3600)
const absenceIntervalAmount = ref(initInterval.amount)
const absenceIntervalUnit = ref(initInterval.unit)

const initRealert = secondsToUnit(local.absenceRealertInterval || 0)
const absenceRealertAmount = ref(initRealert.amount)
const absenceRealertUnit = ref(initRealert.unit)

function updateAbsenceInterval() {
  local.absenceInterval = absenceIntervalAmount.value * absenceIntervalUnit.value.value
}

function updateAbsenceRealert() {
  local.absenceRealertInterval = absenceRealertAmount.value * absenceRealertUnit.value.value
}

const SYSLOG_SEVERITIES = [
  { label: 'Emergency', value: 0x01 },
  { label: 'Alert', value: 0x02 },
  { label: 'Critical', value: 0x04 },
  { label: 'Error', value: 0x08 },
  { label: 'Warning', value: 0x10 },
  { label: 'Notice', value: 0x20 },
  { label: 'Informational', value: 0x40 },
  { label: 'Debug', value: 0x80 },
]

const WINEVENT_LEVELS = [
  { label: 'Critical', value: 0x0100 },
  { label: 'Error', value: 0x0001 },
  { label: 'Warning', value: 0x0002 },
  { label: 'Info', value: 0x0004 },
  { label: 'Audit Success', value: 0x0008 },
  { label: 'Audit Failure', value: 0x0010 },
]

function parseLevelMask(str) {
  if (!str) return 0
  try {
    return parseInt(str, str.startsWith('0x') || str.startsWith('0X') ? 16 : 10) || 0
  } catch {
    return 0
  }
}

function isLevelChecked(bit) {
  return (parseLevelMask(local.level) & bit) !== 0
}

function bitmaskFlagsModel(options) {
  return computed({
    get: () => options.filter((o) => isLevelChecked(o.value)).map((o) => o.value),
    set: (values) => {
      const mask = values.reduce((acc, v) => acc | v, 0)
      local.level = mask === 0 ? '' : `0x${mask.toString(16).toUpperCase()}`
    },
  })
}
const syslogSeverityModel = bitmaskFlagsModel(SYSLOG_SEVERITIES)
const winEventLevelModel = bitmaskFlagsModel(WINEVENT_LEVELS)

const matchHintId = useId()

const eventPickerVisible = ref(false)
const { data: eventTemplatesData } = useEventTemplates()

function onEventPicked(code) {
  const events = eventTemplatesData.value ?? []
  const found = events.find((e) => e.code === code)
  local.event = found ? found.name : String(code)
}
</script>

<template>
  <div class="rule-form">
    <div class="rule-form-header">
      <h2 class="rule-form-title">
        Rule {{ index + 1 }} <span class="rule-form-count">of {{ count }}</span>
      </h2>
      <div class="rule-form-actions">
        <Button
          v-tooltip.bottom="'Move up'"
          aria-label="Move up"
          icon="pi pi-arrow-up"
          size="small"
          text
          severity="secondary"
          rounded
          :disabled="index === 0"
          @click="emit('move-up')"
        />
        <Button
          v-tooltip.bottom="'Move down'"
          aria-label="Move down"
          icon="pi pi-arrow-down"
          size="small"
          text
          severity="secondary"
          rounded
          :disabled="index === count - 1"
          @click="emit('move-down')"
        />
        <Button
          v-tooltip.bottom="'Duplicate rule'"
          aria-label="Duplicate rule"
          icon="pi pi-copy"
          size="small"
          text
          severity="secondary"
          rounded
          @click="emit('duplicate')"
        />
        <Button
          v-tooltip.bottom="'Remove rule'"
          aria-label="Remove rule"
          icon="pi pi-trash"
          size="small"
          text
          severity="danger"
          rounded
          @click="emit('remove')"
        />
      </div>
    </div>

    <div class="detail-cards-grid">
      <DetailCard title="General" wide>
        <FormField class="detail-field" label="Name" v-slot="{ id }">
          <InputText :id="id" v-model="local.name" class="field-input" />
        </FormField>
        <FormField class="detail-field" label="Description" v-slot="{ id }">
          <InputText :id="id" v-model="local.description" class="field-input" />
        </FormField>
      </DetailCard>

      <DetailCard title="Match" wide>
        <FormField
          class="detail-field detail-field--top"
          label="Regular expression"
          v-slot="{ id }"
        >
          <div class="field-input field-with-hint">
            <div class="inline-row">
              <InputText
                :id="id"
                v-model="local.match"
                :aria-describedby="matchHintId"
                class="field-input mono"
                spellcheck="false"
                autocomplete="off"
              />
              <label class="checkbox-label invert-label">
                <Checkbox v-model="local.matchInvert" binary />
                <span>Invert</span>
              </label>
            </div>
            <small :id="matchHintId" class="hint-text">
              Named capture groups: (?P&lt;name&gt;...). Macros: @{NAME}.
            </small>
          </div>
        </FormField>
        <FormField class="detail-field" label="Absence detection" group>
          <label class="checkbox-label">
            <Checkbox v-model="local.absenceDetection" binary />
            <span>Alert when the pattern is not seen</span>
          </label>
        </FormField>
        <FormField v-if="local.absenceDetection" class="detail-field" label="Timing" group>
          <div class="field-input absence-row">
            <div class="timing-group">
              <span class="muted-text">Expected within</span>
              <InputNumber
                v-model="absenceIntervalAmount"
                class="duration-number"
                :min="1"
                aria-label="Expected within"
                @update:model-value="updateAbsenceInterval"
              />
              <Select
                v-model="absenceIntervalUnit"
                :options="TIME_UNITS"
                option-label="label"
                class="duration-unit"
                aria-label="Expected within unit"
                @update:model-value="updateAbsenceInterval"
              />
            </div>
            <div class="timing-group">
              <span class="muted-text">Re-alert every</span>
              <InputNumber
                v-model="absenceRealertAmount"
                class="duration-number"
                :min="0"
                aria-label="Re-alert every"
                @update:model-value="updateAbsenceRealert"
              />
              <Select
                v-model="absenceRealertUnit"
                :options="TIME_UNITS"
                option-label="label"
                class="duration-unit"
                aria-label="Re-alert every unit"
                @update:model-value="updateAbsenceRealert"
              />
            </div>
          </div>
        </FormField>
      </DetailCard>

      <DetailCard title="Filters">
        <template v-if="parserType === 'syslog'">
          <FormField class="detail-field" label="Tag" v-slot="{ id }">
            <InputText :id="id" v-model="local.source" class="field-input" placeholder="Any" />
          </FormField>
          <FormField class="detail-field" label="Facility" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="local.facility"
              class="field-input"
              placeholder="Any (0-23)"
            />
          </FormField>
          <FormField class="detail-field" label="Severity" v-slot="{ id }">
            <MultiSelect
              v-model="syslogSeverityModel"
              :input-id="id"
              :options="SYSLOG_SEVERITIES"
              option-label="label"
              option-value="value"
              placeholder="All severities"
              :max-selected-labels="3"
              class="field-input"
            />
          </FormField>
        </template>

        <template v-else-if="parserType === 'windows-event'">
          <FormField class="detail-field" label="Publisher" v-slot="{ id }">
            <InputText :id="id" v-model="local.source" class="field-input" placeholder="Any" />
          </FormField>
          <FormField class="detail-field" label="Event ID" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="local.id"
              class="field-input"
              placeholder="Any (100 or 100-200)"
            />
          </FormField>
          <FormField class="detail-field" label="Level" v-slot="{ id }">
            <MultiSelect
              v-model="winEventLevelModel"
              :input-id="id"
              :options="WINEVENT_LEVELS"
              option-label="label"
              option-value="value"
              placeholder="All levels"
              :max-selected-labels="3"
              class="field-input"
            />
          </FormField>
          <FormField class="detail-field" label="Log name" v-slot="{ id }">
            <InputText :id="id" v-model="local.logName" class="field-input" placeholder="Any" />
          </FormField>
        </template>

        <template v-else-if="parserType === 'opentelemetry'">
          <FormField class="detail-field" label="Service name" v-slot="{ id }">
            <InputText :id="id" v-model="local.source" class="field-input" placeholder="Any" />
          </FormField>
          <FormField class="detail-field" label="Severity number" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="local.id"
              class="field-input"
              placeholder="Any (17 or 17-24)"
            />
          </FormField>
          <FormField class="detail-field" label="Severity" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="local.level"
              class="field-input"
              placeholder="Any (e.g. 0xFF)"
            />
          </FormField>
          <FormField class="detail-field" label="Scope name" v-slot="{ id }">
            <InputText :id="id" v-model="local.logName" class="field-input" placeholder="Any" />
          </FormField>
        </template>
      </DetailCard>

      <DetailCard title="Action">
        <FormField class="detail-field" label="Event" v-slot="{ id }">
          <div class="field-input inline-row">
            <InputText
              :id="id"
              v-model="local.event"
              class="field-input mono"
              placeholder="Event name or code"
              spellcheck="false"
              autocomplete="off"
            />
            <Button
              label="Select..."
              icon="pi pi-list"
              size="small"
              severity="secondary"
              outlined
              @click="eventPickerVisible = true"
            />
          </div>
        </FormField>
        <FormField class="detail-field" label="Event tag" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="local.eventTag"
            class="field-input"
            :disabled="!local.event"
          />
        </FormField>
        <FormField
          class="detail-field"
          :class="{ 'detail-field--check-top': !processAll }"
          label="Break"
          group
        >
          <div class="field-input field-with-hint">
            <label class="checkbox-label" :class="{ 'is-disabled': !processAll }">
              <Checkbox v-model="local.breakOnMatch" binary :disabled="!processAll" />
              <span>Stop processing further rules</span>
            </label>
            <small v-if="!processAll" class="hint-text break-hint">
              No effect: "Always process all rules" is off in Parser settings
            </small>
          </div>
        </FormField>
        <FormField class="detail-field" label="Storage" group>
          <label class="checkbox-label">
            <Checkbox v-model="local.doNotSaveToDatabase" binary />
            <span>Do not save to database</span>
          </label>
        </FormField>
      </DetailCard>
    </div>

    <EventPickerDialog
      :visible="eventPickerVisible"
      @update:visible="eventPickerVisible = $event"
      @update:model-value="onEventPicked"
    />
  </div>
</template>

<style scoped>
.rule-form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
}

.rule-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-shrink: 0;
  min-height: 2.75rem;
  padding: 0.375rem 0.75rem 0.375rem 1.5rem;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
}

.rule-form-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.rule-form-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.rule-form-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.detail-cards-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

@container (max-width: 52rem) {
  .detail-cards-grid {
    grid-template-columns: minmax(0, 1fr);
  }
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
  width: 8.5rem;
  flex-shrink: 0;
}

.detail-field--top {
  align-items: flex-start;
}

.detail-field--top > :deep(.form-field__label) {
  padding-top: calc(var(--p-form-field-padding-y) + 1px);
}

.detail-field--check-top {
  align-items: flex-start;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-with-hint {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.inline-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.invert-label {
  flex-shrink: 0;
}

.checkbox-label.is-disabled {
  cursor: default;
  color: var(--p-text-muted-color);
}

.break-hint {
  padding-left: 1.75rem;
}

.absence-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
}

.timing-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.muted-text {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.duration-number {
  width: 6rem;
}

.duration-number :deep(input) {
  width: 100%;
}

.duration-unit {
  width: 8rem;
}
</style>
