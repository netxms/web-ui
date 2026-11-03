<script setup>
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DciListEditor from './shared/DciListEditor.vue'
import ChartOptionsPanel from './shared/ChartOptionsPanel.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const TIME_UNIT_OPTIONS = [
  { label: 'Minutes', value: 0 },
  { label: 'Hours', value: 1 },
  { label: 'Days', value: 2 },
]
</script>

<template>
  <DciListEditor />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-timerange">Time range</label>
    <div class="wpd-inline-pair">
      <InputNumber
        input-id="wpd-timerange"
        v-model="form.timeRange"
        :min="1"
        :max="10000"
        show-buttons
        size="small"
        class="wpd-input"
      />
      <Select
        v-model="form.timeUnits"
        :options="TIME_UNIT_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        class="wpd-input"
      />
    </div>
  </div>

  <label class="wpd-check-row" for="wpd-stacked">
    <span @click.stop>
      <Checkbox input-id="wpd-stacked" v-model="form.stacked" :binary="true" />
    </span>
    Stacked
  </label>

  <label class="wpd-check-row" for="wpd-area">
    <span @click.stop>
      <Checkbox input-id="wpd-area" v-model="form.area" :binary="true" />
    </span>
    Area chart
  </label>

  <label class="wpd-check-row" for="wpd-logscale">
    <span @click.stop>
      <Checkbox input-id="wpd-logscale" v-model="form.logScaleEnabled" :binary="true" />
    </span>
    Logarithmic scale
  </label>

  <label class="wpd-check-row" for="wpd-multipliers">
    <span @click.stop>
      <Checkbox input-id="wpd-multipliers" v-model="form.useMultipliers" :binary="true" />
    </span>
    Use multipliers (K / M / G)
  </label>

  <label class="wpd-check-row" for="wpd-showgrid">
    <span @click.stop>
      <Checkbox input-id="wpd-showgrid" v-model="form.showGrid" :binary="true" />
    </span>
    Show grid lines
  </label>

  <ChartOptionsPanel />
</template>
