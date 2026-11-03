<script setup>
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ObjectSelectorField from './shared/ObjectSelectorField.vue'
import { useWidgetEditor } from './editorContext'
import { usePermissions } from '@/composables/usePermissions'
import { useAiOperators } from '@/queries/useAiOperatorQueries'
import { OBSERVATION_MONITOR_MAX_RECORDS } from '@/utils/aiOperatorDisplay'

// Operator instance id 0 means all.
const { form } = useWidgetEditor()

// Listing instances needs "manage AI operators"; without it the instance is entered by id, as in
// legacy.
const { can } = usePermissions()
const canListInstances = computed(() => can.value.manageAiOperators === true)
const { data: operators } = useAiOperators(canListInstances)

const instanceOptions = computed(() => [
  { value: 0, label: 'All instances' },
  ...(operators.value ?? []).map((operator) => ({
    value: operator.id,
    label: operator.name || `Instance ${operator.id}`,
  })),
])
</script>

<template>
  <ObjectSelectorField
    label="Root object"
    placeholder="All objects"
    allow-context
    v-model:object-id="form.objectId"
    v-model:object-name="form.objectName"
  />
  <small class="wpd-hint">Observations about this object and everything below it.</small>

  <div v-if="canListInstances" class="wpd-field">
    <label class="wpd-label" for="wpd-aom-instance">Operator instance</label>
    <Select
      id="wpd-aom-instance"
      v-model="form.instanceId"
      :options="instanceOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="wpd-input"
    />
  </div>
  <div v-else class="wpd-field">
    <label class="wpd-label" for="wpd-aom-instance">Operator instance ID (0 = all)</label>
    <InputNumber
      input-id="wpd-aom-instance"
      v-model="form.instanceId"
      :min="0"
      :use-grouping="false"
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-aom-records">Records to show</label>
    <InputNumber
      input-id="wpd-aom-records"
      v-model="form.maxRecords"
      :min="1"
      :max="OBSERVATION_MONITOR_MAX_RECORDS"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>

  <div class="wpd-field">
    <label class="wpd-label" for="wpd-aom-refresh">Refresh interval (seconds)</label>
    <InputNumber
      input-id="wpd-aom-refresh"
      v-model="form.refreshInterval"
      :min="10"
      :max="3600"
      show-buttons
      size="small"
      class="wpd-input"
    />
  </div>

  <label class="wpd-check-row" for="wpd-aom-new-only">
    <span @click.stop>
      <Checkbox input-id="wpd-aom-new-only" v-model="form.newOnly" :binary="true" />
    </span>
    Show only new observations
  </label>
</template>
