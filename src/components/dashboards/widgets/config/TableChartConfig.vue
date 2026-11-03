<script setup>
import { computed } from 'vue'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import TableDciSelector from './shared/TableDciSelector.vue'
import { useWidgetEditor } from './editorContext'
import { useDciTableValue } from '@/queries/useObjectQueries'
import { tableDataToGrid } from '@/utils/tableData'

const { form } = useWidgetEditor()

const nodeId = computed(() => form.nodeId || null)
const dciId = computed(() => form.dciId || null)

// Read the table once so the column pickers list the columns it actually returns.
const { data: tableValue, isLoading } = useDciTableValue(nodeId, dciId)

const columnOptions = computed(() =>
  tableDataToGrid(tableValue.value?.table).columns.map((c) => ({
    label: c.label === c.id ? c.id : `${c.label} (${c.id})`,
    value: c.id,
  })),
)

const noColumns = computed(
  () => !!dciId.value && !isLoading.value && columnOptions.value.length === 0,
)
</script>

<template>
  <TableDciSelector
    object-label="Node"
    v-model:object-id="form.nodeId"
    v-model:object-name="form.nodeName"
    v-model:dci-id="form.dciId"
  />

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-tc-instance">Instance column</label>
    <Select
      id="wpd-tc-instance"
      v-model="form.instanceColumn"
      :options="columnOptions"
      option-label="label"
      option-value="value"
      placeholder="Select the column naming each series..."
      :disabled="!dciId"
      :loading="isLoading"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-tc-data">Data column</label>
    <Select
      id="wpd-tc-data"
      v-model="form.dataColumn"
      :options="columnOptions"
      option-label="label"
      option-value="value"
      placeholder="Select the column holding the value..."
      :disabled="!dciId"
      :loading="isLoading"
      class="wpd-input"
    />
  </div>
  <small v-if="noColumns" class="wpd-hint">
    This table DCI has no value collected yet, so its columns are not known. Pick it again once it
    has polled.
  </small>

  <div class="wpd-field wpd-field--check">
    <Checkbox v-model="form.showLegend" input-id="wpd-tc-legend" binary />
    <label for="wpd-tc-legend">Show legend</label>
  </div>

  <div class="wpd-field wpd-field--check">
    <Checkbox v-model="form.ignoreZeroValues" input-id="wpd-tc-zero" binary />
    <label for="wpd-tc-zero">Ignore zero values</label>
  </div>

  <div class="wpd-field wpd-field--check">
    <Checkbox v-model="form.sortOnDataColumn" input-id="wpd-tc-sort" binary />
    <label for="wpd-tc-sort">Sort by value</label>
  </div>

  <div v-if="form.sortOnDataColumn" class="wpd-field wpd-field--check">
    <Checkbox v-model="form.sortDescending" input-id="wpd-tc-sortdesc" binary />
    <label for="wpd-tc-sortdesc">Descending</label>
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-tc-refresh">Refresh interval (s)</label>
    <InputNumber
      id="wpd-tc-refresh"
      v-model="form.refreshRate"
      :min="5"
      :max="3600"
      show-buttons
      class="wpd-input"
    />
  </div>
</template>
