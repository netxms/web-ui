<script setup>
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import FormField from '@/components/common/FormField.vue'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const PROP_ALGS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Unchanged' },
  { value: 2, label: 'Fixed' },
  { value: 3, label: 'Relative' },
  { value: 4, label: 'Severity based' },
]

const CALC_ALGS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Most critical' },
  { value: 2, label: 'Single threshold' },
  { value: 3, label: 'Multiple thresholds' },
]

const STATUSES = [
  { value: 0, label: 'Normal', key: 'normal' },
  { value: 1, label: 'Warning', key: 'warning' },
  { value: 2, label: 'Minor', key: 'minor' },
  { value: 3, label: 'Major', key: 'major' },
  { value: 4, label: 'Critical', key: 'critical' },
]

const CHILD_STATUSES = [
  { index: 0, label: 'Warning', key: 'warning' },
  { index: 1, label: 'Minor', key: 'minor' },
  { index: 2, label: 'Major', key: 'major' },
  { index: 3, label: 'Critical', key: 'critical' },
]
</script>

<template>
  <div class="status-calculation-section">
    <fieldset class="form-fieldset">
      <legend>Propagate status as</legend>
      <div class="form-fields">
        <FormField label="Algorithm" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.propAlg"
            :options="PROP_ALGS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>

        <FormField v-if="draft.propAlg === 2" label="Fixed status" group>
          <Select
            v-model="draft.fixedStatus"
            :options="STATUSES"
            option-label="label"
            option-value="value"
            class="form-input"
          >
            <template #value="{ value }">
              <div class="status-option">
                <span class="status-dot" :class="`status-dot--${STATUSES[value]?.key}`" />
                {{ STATUSES[value]?.label }}
              </div>
            </template>
            <template #option="{ option }">
              <div class="status-option">
                <span class="status-dot" :class="`status-dot--${option.key}`" />
                {{ option.label }}
              </div>
            </template>
          </Select>
        </FormField>

        <FormField v-if="draft.propAlg === 3" label="Offset" group>
          <div class="offset-field">
            <InputNumber
              v-model="draft.shift"
              :min="-4"
              :max="4"
              show-buttons
              class="offset-input"
            />
            <span class="form-hint">
              Positive shifts toward more critical, negative toward less
            </span>
          </div>
        </FormField>

        <div v-if="draft.propAlg === 4" class="form-field full-width">
          <div class="mapping-table">
            <div class="mapping-table__header">
              <span>Child status</span>
              <span>Propagate as</span>
            </div>
            <div v-for="row in CHILD_STATUSES" :key="row.index" class="mapping-table__row">
              <div class="status-label">
                <span class="status-dot" :class="`status-dot--${row.key}`" />
                {{ row.label }}
              </div>
              <Select
                v-model="draft.translation[row.index]"
                :options="STATUSES"
                option-label="label"
                option-value="value"
                class="form-input"
              >
                <template #value="{ value }">
                  <div class="status-option">
                    <span class="status-dot" :class="`status-dot--${STATUSES[value]?.key}`" />
                    {{ STATUSES[value]?.label }}
                  </div>
                </template>
                <template #option="{ option }">
                  <div class="status-option">
                    <span class="status-dot" :class="`status-dot--${option.key}`" />
                    {{ option.label }}
                  </div>
                </template>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Calculate status as</legend>
      <div class="form-fields">
        <FormField label="Algorithm" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.calcAlg"
            :options="CALC_ALGS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>

        <FormField v-if="draft.calcAlg === 2" label="Threshold" group>
          <div class="offset-field">
            <InputNumber
              v-model="draft.singleThreshold"
              :min="0"
              :max="100"
              suffix="%"
              class="threshold-input"
            />
            <span class="form-hint">of children must have problems to raise status</span>
          </div>
        </FormField>

        <div v-if="draft.calcAlg === 3" class="form-field full-width">
          <div class="mapping-table">
            <div class="mapping-table__header">
              <span>Raise to</span>
              <span>When &ge; % of children have problems</span>
            </div>
            <div v-for="row in CHILD_STATUSES" :key="row.index" class="mapping-table__row">
              <div class="status-label">
                <span class="status-dot" :class="`status-dot--${row.key}`" />
                {{ row.label }}
              </div>
              <InputNumber
                v-model="draft.thresholds[row.index]"
                :min="0"
                :max="100"
                suffix="%"
                class="form-input"
              />
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.status-calculation-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-field {
  max-width: 20rem;
}

.form-field.full-width {
  max-width: none;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  align-self: center;
}

.offset-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.offset-input,
.threshold-input {
  width: 7rem;
  flex-shrink: 0;
}
:deep(.offset-input input) {
  max-width: 100%;
}
:deep(.threshold-input input) {
  max-width: 100%;
}

.status-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--normal {
  background: var(--netxms-status-normal);
}
.status-dot--warning {
  background: var(--netxms-status-warning);
}
.status-dot--minor {
  background: var(--netxms-status-minor);
}
.status-dot--major {
  background: var(--netxms-status-major);
}
.status-dot--critical {
  background: var(--netxms-status-critical);
}

.status-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mapping-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius);
  background: var(--p-surface-card);
  overflow: hidden;
}

.mapping-table__header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mapping-table__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.mapping-table__row:last-child {
  border-bottom: none;
}

.status-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
</style>
