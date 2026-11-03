<script setup>
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form, widgetType } = useWidgetEditor()

const isPie = widgetType === 'scripted-pie-chart'

const LEGEND_POSITION_OPTIONS = [
  { label: 'Bottom', value: 'bottom' },
  { label: 'Top', value: 'top' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
]
</script>

<template>
  <!-- Legacy calls the empty selection "<dashboard>". -->
  <ObjectSelectorField
    label="Object"
    placeholder="Dashboard (default)"
    allow-context
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />

  <FormField class="wpd-field wpd-field--column" label="Script" group>
    <NxslScriptEditor
      id="wpd-script"
      v-model="form.script"
      hint-key="dashboard-script"
      show-compile
      :rows="6"
    />
    <small class="wpd-hint">
      The server runs the saved script, so changes take effect after the dashboard is saved.
    </small>
  </FormField>

  <template v-if="isPie">
    <label class="wpd-check-row" for="wpd-sc-doughnut">
      <span @click.stop>
        <Checkbox input-id="wpd-sc-doughnut" v-model="form.doughnutRendering" :binary="true" />
      </span>
      Doughnut rendering
    </label>
    <label class="wpd-check-row" for="wpd-sc-total">
      <span @click.stop>
        <Checkbox input-id="wpd-sc-total" v-model="form.showTotal" :binary="true" />
      </span>
      Show total in center
    </label>
  </template>
  <template v-else>
    <label class="wpd-check-row" for="wpd-sc-transp">
      <span @click.stop>
        <Checkbox input-id="wpd-sc-transp" v-model="form.transposed" :binary="true" />
      </span>
      Horizontal bars (transposed)
    </label>
  </template>

  <label class="wpd-check-row" for="wpd-sc-legend">
    <span @click.stop>
      <Checkbox input-id="wpd-sc-legend" v-model="form.showLegend" :binary="true" />
    </span>
    Show legend
  </label>

  <div v-if="form.showLegend" class="wpd-field">
    <label class="wpd-label" for="wpd-sc-legend-pos">Legend position</label>
    <Select
      id="wpd-sc-legend-pos"
      v-model="form.legendPosition"
      :options="LEGEND_POSITION_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <label v-if="form.showLegend" class="wpd-check-row" for="wpd-sc-extended-legend">
    <span @click.stop>
      <Checkbox input-id="wpd-sc-extended-legend" v-model="form.extendedLegend" :binary="true" />
    </span>
    Extended legend (value per item)
  </label>

  <label
    v-if="!isPie && form.showLegend && form.extendedLegend"
    class="wpd-check-row"
    for="wpd-sc-percent-legend"
  >
    <span @click.stop>
      <Checkbox
        input-id="wpd-sc-percent-legend"
        v-model="form.showPercentInLegend"
        :binary="true"
      />
    </span>
    Show percent in legend
  </label>
</template>
