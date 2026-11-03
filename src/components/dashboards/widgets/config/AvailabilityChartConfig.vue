<script setup>
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'
import { AVAILABILITY_PERIOD, AVAILABILITY_PERIOD_OPTIONS } from '@/utils/availabilityPeriod'

// Not ChartOptionsPanel: the legacy config has no DCI list, Y scale or refresh rate, and those
// fields would round-trip unread.
const { form } = useWidgetEditor()

const LEGEND_POSITION_OPTIONS = [
  { label: 'Bottom', value: 'bottom' },
  { label: 'Top', value: 'top' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
]

/** Availability is only recorded for business services, so the picker starts in their tree. */
const PERSPECTIVES = [{ id: 'business-services', label: 'Business Services', rootId: 9 }]
</script>

<template>
  <ObjectSelectorField
    label="Business service"
    :perspectives="PERSPECTIVES"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-av-period">Period</label>
    <Select
      id="wpd-av-period"
      v-model="form.period"
      :options="AVAILABILITY_PERIOD_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <div v-if="form.period === AVAILABILITY_PERIOD.CUSTOM" class="wpd-field">
    <label class="wpd-label" for="wpd-av-days">Number of days</label>
    <InputNumber
      input-id="wpd-av-days"
      v-model="form.numberOfDays"
      :min="1"
      :max="3650"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>

  <label class="wpd-check-row" for="wpd-av-doughnut">
    <span @click.stop>
      <Checkbox input-id="wpd-av-doughnut" v-model="form.doughnutRendering" :binary="true" />
    </span>
    Doughnut rendering
  </label>

  <label class="wpd-check-row" for="wpd-av-legend">
    <span @click.stop>
      <Checkbox input-id="wpd-av-legend" v-model="form.showLegend" :binary="true" />
    </span>
    Show legend
  </label>

  <div v-if="form.showLegend" class="wpd-field">
    <label class="wpd-label" for="wpd-av-legend-pos">Legend position</label>
    <Select
      id="wpd-av-legend-pos"
      v-model="form.legendPosition"
      :options="LEGEND_POSITION_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <label v-if="form.showLegend" class="wpd-check-row" for="wpd-av-legend-ext">
    <span @click.stop>
      <Checkbox input-id="wpd-av-legend-ext" v-model="form.extendedLegend" :binary="true" />
    </span>
    Extended legend (value per item)
  </label>
</template>
