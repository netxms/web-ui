<script setup>
import Checkbox from 'primevue/checkbox'
import DciListEditor from './shared/DciListEditor.vue'
import ChartOptionsPanel from './shared/ChartOptionsPanel.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <DciListEditor />

  <label class="wpd-check-row" for="wpd-doughnut">
    <span @click.stop>
      <Checkbox input-id="wpd-doughnut" v-model="form.doughnutRendering" :binary="true" />
    </span>
    Doughnut rendering
  </label>

  <label class="wpd-check-row" for="wpd-showtotal">
    <span @click.stop>
      <Checkbox input-id="wpd-showtotal" v-model="form.showTotal" :binary="true" />
    </span>
    Show total in center
  </label>

  <ChartOptionsPanel value-legend />
</template>
