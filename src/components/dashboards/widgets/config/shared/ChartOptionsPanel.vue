<script setup>
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useWidgetEditor } from '../editorContext'

// Shared chart options (AbstractChartConfig): legend, Y scale, refresh rate.
const { form } = useWidgetEditor()

defineProps({
  /** Bar, tube and pie legends list a value per item; only the wording differs. */
  valueLegend: { type: Boolean, default: false },
  /** Legacy offers it on bar-family charts only; a pie legend always carries the share. */
  percentOption: { type: Boolean, default: false },
})

const LEGEND_POSITION_OPTIONS = [
  { label: 'Bottom', value: 'bottom' },
  { label: 'Top', value: 'top' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
]
</script>

<template>
  <label class="wpd-check-row" for="wpd-show-legend">
    <span @click.stop>
      <Checkbox input-id="wpd-show-legend" v-model="form.showLegend" :binary="true" />
    </span>
    Show legend
  </label>

  <div v-if="form.showLegend" class="wpd-field">
    <label class="wpd-label" for="wpd-legend-pos">Legend position</label>
    <Select
      id="wpd-legend-pos"
      v-model="form.legendPosition"
      :options="LEGEND_POSITION_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <label v-if="form.showLegend" class="wpd-check-row" for="wpd-extended-legend">
    <span @click.stop>
      <Checkbox input-id="wpd-extended-legend" v-model="form.extendedLegend" :binary="true" />
    </span>
    {{
      valueLegend
        ? 'Extended legend (value per item)'
        : 'Extended legend (current / min / max / avg / 95%)'
    }}
  </label>

  <label
    v-if="percentOption && form.showLegend && form.extendedLegend"
    class="wpd-check-row"
    for="wpd-percent-legend"
  >
    <span @click.stop>
      <Checkbox input-id="wpd-percent-legend" v-model="form.showPercentInLegend" :binary="true" />
    </span>
    Show percent in legend
  </label>

  <label class="wpd-check-row" for="wpd-autoscale">
    <span @click.stop>
      <Checkbox input-id="wpd-autoscale" v-model="form.autoScale" :binary="true" />
    </span>
    Automatic Y axis scale
  </label>

  <template v-if="form.autoScale === false">
    <div class="wpd-field">
      <label class="wpd-label" for="wpd-ymin">Y minimum</label>
      <InputNumber
        input-id="wpd-ymin"
        v-model="form.minYScaleValue"
        :max-fraction-digits="4"
        size="small"
        class="wpd-input"
      />
    </div>
    <div class="wpd-field">
      <label class="wpd-label" for="wpd-ymax">Y maximum</label>
      <InputNumber
        input-id="wpd-ymax"
        v-model="form.maxYScaleValue"
        :max-fraction-digits="4"
        size="small"
        class="wpd-input"
      />
    </div>
  </template>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-refresh">Refresh rate (seconds)</label>
    <InputNumber
      input-id="wpd-refresh"
      v-model="form.refreshRate"
      :min="5"
      :max="3600"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
</template>
