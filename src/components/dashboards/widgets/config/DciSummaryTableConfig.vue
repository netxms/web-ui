<script setup>
import { computed } from 'vue'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useSummaryTables } from '@/queries/useSummaryTableQueries'
import { useWidgetEditor } from './editorContext'

const { form } = useWidgetEditor()

const { data: tablesData, isLoading } = useSummaryTables()
const tables = computed(() => tablesData.value ?? [])
</script>

<template>
  <div class="wpd-field">
    <label class="wpd-label" for="wpd-dst-table">Summary table</label>
    <Select
      id="wpd-dst-table"
      v-model="form.tableId"
      :options="tables"
      option-label="title"
      option-value="id"
      placeholder="Select a summary table..."
      :loading="isLoading"
      class="wpd-input"
    />
  </div>

  <ObjectSelectorField
    allow-context
    label="Base object"
    placeholder="Not set"
    v-model:object-id="form.baseObjectId"
    v-model:object-name="form.baseObjectName"
  />
  <small class="wpd-hint">
    The query is executed for this object (typically a Container or Collector).
  </small>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-dst-refresh">Refresh interval (s)</label>
    <InputNumber
      id="wpd-dst-refresh"
      v-model="form.refreshInterval"
      :min="5"
      size="small"
      class="wpd-input"
    />
  </div>
</template>
