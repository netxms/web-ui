<script setup>
import Checkbox from 'primevue/checkbox'
import DciListEditor from './shared/DciListEditor.vue'
import ChartOptionsPanel from './shared/ChartOptionsPanel.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <DciListEditor />

  <label class="wpd-check-row" for="wpd-transposed">
    <span @click.stop>
      <Checkbox input-id="wpd-transposed" v-model="form.transposed" :binary="true" />
    </span>
    Horizontal bars (transposed)
  </label>

  <ChartOptionsPanel value-legend percent-option />
</template>
