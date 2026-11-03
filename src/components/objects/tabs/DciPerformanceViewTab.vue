<script setup>
import { reactive, watch, computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DetailCard from '@/components/layout/DetailCard.vue'
import ColorField from '@/components/common/ColorField.vue'
import { parsePerfViewSettings, serializePerfViewSettings } from '@/utils/perfViewSettingsXml'
import { parseConfigColor, toApiColor } from '@/utils/colorUtils'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  form: { type: Object, required: true },
})

const TIME_UNITS_OPTIONS = [
  { value: 0, label: 'Minutes' },
  { value: 1, label: 'Hours' },
  { value: 2, label: 'Days' },
]

const CHART_TYPE_OPTIONS = [
  { value: 0, label: 'Line' },
  { value: 1, label: 'Area' },
]

const settings = reactive(parsePerfViewSettings(props.form.perfTabSettings))

// Fires on a reloaded/discarded form (new identity), not on in-place writes to it.
watch(
  () => props.form,
  () => Object.assign(settings, parsePerfViewSettings(props.form.perfTabSettings)),
)

watch(
  settings,
  () => {
    props.form.perfTabSettings = serializePerfViewSettings(settings)
  },
  { deep: true },
)

// modifyYBase applies only to an automatic Y range.
watch(
  () => settings.autoScale,
  (autoScale) => {
    if (!autoScale) settings.modifyYBase = false
  },
)

const colorValue = computed({
  get: () => (settings.automaticColor ? null : parseConfigColor(settings.color)),
  set: (v) => {
    if (v) {
      settings.automaticColor = false
      settings.color = toApiColor(v)
    } else {
      settings.automaticColor = true
    }
  },
})
</script>

<template>
  <div class="perf-view-tab">
    <div class="tab-cards-grid">
      <DetailCard title="General">
        <div class="checkbox-row">
          <Checkbox v-model="settings.enabled" input-id="pv-enabled" binary />
          <label for="pv-enabled">Show in performance view</label>
        </div>
        <FormField label="Title" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="settings.title"
            class="form-input"
            placeholder="Defaults to DCI description"
          />
        </FormField>
        <FormField label="Group" v-slot="{ id }">
          <InputText :id="id" v-model="settings.groupName" class="form-input" />
        </FormField>
        <FormField label="Name in Legend" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="settings.name"
            class="form-input"
            placeholder="Defaults to DCI description"
          />
        </FormField>
        <FormField label="Order" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="settings.order"
            class="form-input"
            :min="0"
            :max="65535"
          />
        </FormField>
      </DetailCard>

      <DetailCard title="Time Period">
        <FormField label="Interval" v-slot="{ id }">
          <InputNumber :input-id="id" v-model="settings.timeRange" class="form-input" :min="1" />
        </FormField>
        <FormField label="Units" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="settings.timeUnits"
            :options="TIME_UNITS_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
      </DetailCard>

      <DetailCard title="Appearance">
        <FormField label="Type" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="settings.type"
            :options="CHART_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <ColorField label="Color" v-model="colorValue" />
        <div class="checkbox-row">
          <Checkbox v-model="settings.showThresholds" input-id="pv-thresholds" binary />
          <label for="pv-thresholds">Show thresholds on graph</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.logScaleEnabled" input-id="pv-log" binary />
          <label for="pv-log">Logarithmic scale</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.stacked" input-id="pv-stacked" binary />
          <label for="pv-stacked">Stacked</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.showLegendAlways" input-id="pv-legend-always" binary />
          <label for="pv-legend-always">Always show legend</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.extendedLegend" input-id="pv-legend-ext" binary />
          <label for="pv-legend-ext">Extended legend</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.useMultipliers" input-id="pv-multipliers" binary />
          <label for="pv-multipliers">Use multipliers</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.invertedValues" input-id="pv-inverted" binary />
          <label for="pv-inverted">Inverted values</label>
        </div>
        <div class="checkbox-row">
          <Checkbox v-model="settings.translucent" input-id="pv-translucent" binary />
          <label for="pv-translucent">Translucent</label>
        </div>
      </DetailCard>

      <DetailCard title="Y-Axis Range">
        <div class="checkbox-row">
          <Checkbox v-model="settings.autoScale" input-id="pv-autoscale" binary />
          <label for="pv-autoscale">Automatic scale</label>
        </div>
        <template v-if="!settings.autoScale">
          <FormField label="Min Value" v-slot="{ id }">
            <InputNumber :input-id="id" v-model="settings.minYScaleValue" class="form-input" />
          </FormField>
          <FormField label="Max Value" v-slot="{ id }">
            <InputNumber :input-id="id" v-model="settings.maxYScaleValue" class="form-input" />
          </FormField>
        </template>
        <div class="checkbox-row" v-if="settings.autoScale">
          <Checkbox v-model="settings.modifyYBase" input-id="pv-ybase" binary />
          <label for="pv-ybase">Use minimum DCI value as Y base</label>
        </div>
        <FormField label="Axis Label" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="settings.yAxisLabel"
            placeholder="Leave empty to hide"
            class="form-input"
          />
        </FormField>
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.perf-view-tab {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.tab-cards-grid {
  columns: 2;
  column-gap: 1rem;
  padding: 1.5rem;
}

.tab-cards-grid :deep(.detail-card) {
  break-inside: avoid;
  margin-bottom: 1rem;
}

.tab-cards-grid :deep(.detail-card--wide) {
  column-span: all;
}

.form-field {
  display: flex;
  /* Overrides `column` from the global .form-field in forms.css. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
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

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}

.checkbox-row label {
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
