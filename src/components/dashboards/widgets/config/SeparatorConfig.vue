<script setup>
import InputNumber from 'primevue/inputnumber'
import ColorField from '@/components/common/ColorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-linewidth">Line width (px)</label>
    <InputNumber
      input-id="wpd-linewidth"
      v-model="form.lineWidth"
      :min="1"
      :max="32"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>

  <ColorField label="Line color" v-model="form.foreground" />
  <ColorField label="Background color" v-model="form.background" />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-m-top">Top margin (px)</label>
    <InputNumber
      input-id="wpd-m-top"
      v-model="form.topMargin"
      :min="0"
      :max="200"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-m-bottom">Bottom margin (px)</label>
    <InputNumber
      input-id="wpd-m-bottom"
      v-model="form.bottomMargin"
      :min="0"
      :max="200"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-m-left">Left margin (px)</label>
    <InputNumber
      input-id="wpd-m-left"
      v-model="form.leftMargin"
      :min="0"
      :max="200"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-m-right">Right margin (px)</label>
    <InputNumber
      input-id="wpd-m-right"
      v-model="form.rightMargin"
      :min="0"
      :max="200"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
</template>
