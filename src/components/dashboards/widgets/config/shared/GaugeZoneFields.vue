<script setup>
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useWidgetEditor } from '../editorContext'

/** GaugeConfig fields shared by the DCI gauge and the scripted gauge editors. */
const { form } = useWidgetEditor()

const GAUGE_TYPE_OPTIONS = [
  { label: 'Dial', value: 0 },
  { label: 'Bar', value: 1 },
  { label: 'Text', value: 2 },
]
</script>

<template>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-gaugetype">Gauge type</label>
    <Select
      id="wpd-gaugetype"
      v-model="form.gaugeType"
      :options="GAUGE_TYPE_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-minval">Minimum value</label>
    <InputNumber
      input-id="wpd-minval"
      v-model="form.minValue"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-maxval">Maximum value</label>
    <InputNumber
      input-id="wpd-maxval"
      v-model="form.maxValue"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-lred">Left red zone ends at</label>
    <InputNumber
      input-id="wpd-lred"
      v-model="form.leftRedZone"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-lyellow">Left yellow zone ends at</label>
    <InputNumber
      input-id="wpd-lyellow"
      v-model="form.leftYellowZone"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-ryellow">Right yellow zone starts at</label>
    <InputNumber
      input-id="wpd-ryellow"
      v-model="form.rightYellowZone"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-rred">Right red zone starts at</label>
    <InputNumber
      input-id="wpd-rred"
      v-model="form.rightRedZone"
      :max-fraction-digits="4"
      size="small"
      class="wpd-input"
    />
  </div>
</template>
