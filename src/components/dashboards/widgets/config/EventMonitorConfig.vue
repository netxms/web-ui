<script setup>
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'

const { form } = useWidgetEditor()

const { data: eventTemplates } = useEventTemplates()

const eventOptions = computed(() =>
  (eventTemplates.value ?? []).map((template) => ({
    value: template.code,
    label: template.name,
  })),
)
</script>

<template>
  <ObjectSelectorField
    allow-context
    label="Root object"
    placeholder="Not set (all objects)"
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />
  <small class="wpd-hint">
    Events from this object and everything below it. Leave unset to watch the whole system.
  </small>

  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-event-codes">Event filter</label>
    <MultiSelect
      id="wpd-event-codes"
      v-model="form.eventCodes"
      :options="eventOptions"
      option-label="label"
      option-value="value"
      placeholder="All events"
      display="chip"
      filter
      class="wpd-input"
    />
    <small class="wpd-hint">Leave empty to show every event.</small>
  </div>

  <div class="wpd-field wpd-field--column">
    <label class="wpd-label" for="wpd-event-text">Text filter</label>
    <InputText
      id="wpd-event-text"
      v-model="form.filter"
      size="small"
      placeholder="Any event"
      class="wpd-input"
    />
    <small class="wpd-hint">
      Every word must appear in the message, the event name or the source object name. Case is
      ignored.
    </small>
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-event-max">Events to load (0 to disable)</label>
    <InputNumber
      id="wpd-event-max"
      v-model="form.maxEvents"
      :min="0"
      :max="500"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>
  <small class="wpd-hint">
    History to open with, and how many events the widget keeps. 0 starts empty and shows only what
    arrives from now on.
  </small>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-event-range">Preload window (minutes)</label>
    <InputNumber
      id="wpd-event-range"
      v-model="form.timeRangeMinutes"
      :min="0"
      size="small"
      class="wpd-input"
    />
  </div>
  <small class="wpd-hint">
    How far back the widget looks when it opens. Ignored when the event count is 0.
  </small>
</template>
