<script setup>
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import TimeRangeButton from '@/components/common/TimeRangeButton.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { DCI_SYSTEM_TAG_GROUPS } from '@/utils/dciSystemTags'
import { DATA_EXPORT_TIERS, DATA_EXPORT_TIME_PRESETS } from '@/utils/dataExport'

const model = defineModel({ type: Object, required: true })

defineEmits(['submit'])
</script>

<template>
  <div class="export-form">
    <fieldset class="form-group">
      <legend class="group-legend">Metrics</legend>

      <div class="root-picker">
        <span class="field-label">Root object</span>
        <ObjectPickerField
          v-model="model.rootId"
          empty-label="(none)"
          dialog-title="Select Root Object"
        />
      </div>

      <div class="tag-groups" role="group" aria-label="Tag groups">
        <div
          v-for="group in DCI_SYSTEM_TAG_GROUPS"
          :key="group.prefix"
          v-tooltip.bottom="group.tags.join(', ')"
          class="tag-group"
        >
          <Checkbox
            v-model="model.groups"
            :input-id="`export-group-${group.prefix}`"
            :value="group.prefix"
            size="small"
          />
          <label :for="`export-group-${group.prefix}`" class="tag-pattern">{{
            group.pattern
          }}</label>
        </div>
      </div>

      <div class="extra-patterns">
        <label for="export-extra-patterns" class="field-label">Additional tag patterns</label>
        <InputText
          id="export-extra-patterns"
          v-model="model.extraPatterns"
          placeholder="e.g. custom.*, site.power?"
          autocomplete="off"
          size="small"
          aria-describedby="export-extra-patterns-hint"
          class="extra-input"
          @keydown.enter="$emit('submit')"
        />
        <p id="export-extra-patterns-hint" class="group-note">
          Comma-separated; * and ? wildcards. Matched against each DCI's system tag.
        </p>
      </div>
    </fieldset>

    <fieldset class="form-group">
      <legend class="group-legend">Time period</legend>
      <div class="period-field">
        <TimeRangeButton v-model="model.time" :presets="DATA_EXPORT_TIME_PRESETS" />
      </div>
      <div class="period-field">
        <label for="export-tier" class="field-label">History tier</label>
        <Select
          v-model="model.tier"
          input-id="export-tier"
          :options="DATA_EXPORT_TIERS"
          option-label="label"
          option-value="id"
          size="small"
          class="tier-select"
        />
      </div>
      <p class="group-note">
        Aggregates add min, max and count columns. A metric without the requested tier is exported
        as raw samples.
      </p>
    </fieldset>

    <fieldset class="form-group">
      <legend class="group-legend">Options</legend>
      <div class="check-option">
        <Checkbox v-model="model.anonymize" input-id="export-anonymize" binary size="small" />
        <label for="export-anonymize">Anonymize (replace names with pseudonyms)</label>
      </div>
      <div class="check-option">
        <Checkbox
          v-model="model.keepMapping"
          input-id="export-keep-mapping"
          binary
          size="small"
          :disabled="!model.anonymize"
        />
        <label for="export-keep-mapping" :class="{ disabled: !model.anonymize }"
          >Save pseudonym mapping file</label
        >
      </div>
      <p class="group-note">
        The mapping file links pseudonyms back to real names. It is downloaded separately and is
        never part of the archive.
      </p>
    </fieldset>
  </div>
</template>

<style scoped>
.export-form {
  display: grid;
  grid-template-columns: minmax(20rem, 2fr) minmax(14rem, 1fr) minmax(14rem, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (width <= 60rem) {
  .export-form {
    grid-template-columns: 1fr;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0.625rem 0.75rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  min-width: 0;
}

.group-legend {
  padding: 0 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.group-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.field-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.root-picker,
.period-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tag-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.25rem 0.75rem;
}

.tag-group,
.check-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.tag-group label,
.check-option label {
  cursor: pointer;
}

.tag-pattern {
  font-family: var(--font-mono);
}

.check-option label.disabled {
  color: var(--p-text-muted-color);
  cursor: default;
}

.extra-patterns {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.extra-input {
  width: 100%;
}

.tier-select {
  min-width: 11rem;
}
</style>
