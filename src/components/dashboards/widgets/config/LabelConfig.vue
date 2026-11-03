<script setup>
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ColorField from '@/components/common/ColorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const TEXT_ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

const FONT_SIZE_OPTIONS = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
  { label: 'Extra Large', value: 'xl' },
]
</script>

<template>
  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-text">Text</label>
    <Textarea id="wpd-text" v-model="form.text" rows="3" class="wpd-input" />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-align">Alignment</label>
    <Select
      id="wpd-align"
      v-model="form.align"
      :options="TEXT_ALIGN_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-fontsize">Font size</label>
    <Select
      id="wpd-fontsize"
      v-model="form.fontSize"
      :options="FONT_SIZE_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>

  <ColorField label="Text color" v-model="form.foreground" />
  <ColorField label="Background color" v-model="form.background" />
</template>
