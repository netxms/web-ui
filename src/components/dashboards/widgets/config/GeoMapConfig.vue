<script setup>
import InputNumber from 'primevue/inputnumber'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    placeholder="Not set"
    v-model:object-id="form.rootObjectId"
    v-model:object-name="form.rootObjectName"
  />
  <small class="wpd-hint">
    Objects under the root object that have a location set are plotted on the map.
  </small>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-geo-lat">Default latitude</label>
    <InputNumber
      id="wpd-geo-lat"
      v-model="form.latitude"
      :min-fraction-digits="0"
      :max-fraction-digits="6"
      size="small"
      class="wpd-input"
    />
  </div>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-geo-lng">Default longitude</label>
    <InputNumber
      id="wpd-geo-lng"
      v-model="form.longitude"
      :min-fraction-digits="0"
      :max-fraction-digits="6"
      size="small"
      class="wpd-input"
    />
  </div>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-geo-zoom">Default zoom</label>
    <InputNumber
      id="wpd-geo-zoom"
      v-model="form.zoom"
      :min="1"
      :max="18"
      size="small"
      class="wpd-input"
    />
  </div>
  <small class="wpd-hint">
    Used as the initial view before the map auto-fits to plotted objects.
  </small>
</template>
