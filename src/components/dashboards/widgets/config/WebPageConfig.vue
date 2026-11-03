<script setup>
import InputText from 'primevue/inputtext'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-url">URL</label>
    <InputText
      id="wpd-url"
      v-model="form.url"
      placeholder="https://example.com"
      class="wpd-input"
    />
    <small class="wpd-hint">
      Only http(s) URLs are embedded. Some sites refuse to render inside a frame (X-Frame-Options) —
      use the open-in-new-tab button in that case.
    </small>
  </div>
</template>
