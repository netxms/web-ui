<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import { useZoneNames } from '@/queries/useObjectQueries'
import { useUsers } from '@/queries/useUserQueries'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import {
  COLUMN_KIND,
  LOG_OPERATORS,
  getCodedOptions,
  getColumnKind,
  getOperatorsForType,
} from '@/utils/logColumnTypes'
import { TIME_PRESETS } from '@/utils/logQueryModel'

const props = defineProps({
  condition: { type: Object, required: true },
  column: { type: Object, required: true },
  removable: { type: Boolean, default: true },
})

const emit = defineEmits(['update', 'remove'])

const OBJECT_PICKER_PERSPECTIVES = [
  { id: 'infrastructure', label: 'Infrastructure', rootId: 2 },
  { id: 'business-services', label: 'Business Services', rootId: 9 },
]

const RELATIVE_UNITS = [
  { value: 'minute', label: 'minutes' },
  { value: 'hour', label: 'hours' },
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
]

const CALENDAR_PERIODS = TIME_PRESETS.filter((preset) => preset.period).map((preset) => ({
  value: preset.period,
  label: preset.label,
}))

const { data: users } = useUsers()
const { data: eventTemplates } = useEventTemplates()
const zonesByUin = useZoneNames()

const kind = computed(() => getColumnKind(props.column.type))
const operators = computed(() => getOperatorsForType(props.column.type))
const operator = computed(() => LOG_OPERATORS[props.condition.operatorId] ?? operators.value[0])

const codedOptions = computed(() => getCodedOptions(props.column.type) ?? [])

const userOptions = computed(() =>
  (users.value ?? []).map((user) => ({ value: user.id, label: user.name })),
)

const eventOptions = computed(() =>
  (eventTemplates.value ?? []).map((template) => ({
    value: template.code,
    label: template.name,
  })),
)

const zoneOptions = computed(() =>
  [...zonesByUin.value.entries()].map(([uin, name]) => ({ value: uin, label: `${name} (${uin})` })),
)

const editor = computed(() => {
  switch (kind.value) {
    case COLUMN_KIND.TIME:
      return 'date'
    case COLUMN_KIND.OBJECT:
      return 'object'
    case COLUMN_KIND.SEVERITY:
    case COLUMN_KIND.CODED:
      return 'coded'
    case COLUMN_KIND.USER:
      return 'user'
    case COLUMN_KIND.EVENT:
      return 'event'
    case COLUMN_KIND.ZONE:
      return 'zone'
    case COLUMN_KIND.NUMERIC:
      return 'number'
    default:
      return 'text'
  }
})

const pickerOpen = ref(false)
const pickerField = ref('value')

function patch(changes) {
  emit('update', { ...props.condition, ...changes })
}

function onOperatorChange(operatorId) {
  const next = LOG_OPERATORS[operatorId]
  // Operands are not interchangeable between operator shapes, so start the new one clean.
  const cleared = { operatorId, value: null, from: null, to: null, display: null }
  if (next.value === 'relative') Object.assign(cleared, { value: 1, unit: 'hour' })
  if (next.value === 'period') Object.assign(cleared, { period: 'today' })
  patch(cleared)
}

function openPicker(field) {
  pickerField.value = field
  pickerOpen.value = true
}

function onObjectPicked(object) {
  patch({ [pickerField.value]: object.id, display: object.name })
  pickerOpen.value = false
}

/** Date operands are held as ISO strings in the model and as Date objects in the editor. */
function asDate(value) {
  return value ? new Date(value) : null
}

function toIso(value) {
  const date = Array.isArray(value) ? value[0] : value
  return date instanceof Date ? date.toISOString() : null
}
</script>

<template>
  <div class="condition-row">
    <Select
      :model-value="condition.operatorId"
      :options="operators"
      option-label="label"
      option-value="id"
      size="small"
      class="condition-operator"
      @update:model-value="onOperatorChange"
    />

    <div class="condition-operands">
      <template v-if="operator.value === 'relative'">
        <InputNumber
          :model-value="condition.value"
          :min="1"
          :use-grouping="false"
          size="small"
          class="operand-number"
          @update:model-value="(v) => patch({ value: v })"
        />
        <Select
          :model-value="condition.unit"
          :options="RELATIVE_UNITS"
          option-label="label"
          option-value="value"
          size="small"
          class="operand-unit"
          @update:model-value="(v) => patch({ unit: v })"
        />
      </template>

      <Select
        v-else-if="operator.value === 'period'"
        :model-value="condition.period"
        :options="CALENDAR_PERIODS"
        option-label="label"
        option-value="value"
        size="small"
        class="operand-period"
        @update:model-value="(v) => patch({ period: v })"
      />

      <template v-else-if="operator.value === 'range'">
        <DatePicker
          v-if="editor === 'date'"
          :model-value="asDate(condition.from)"
          show-time
          hour-format="24"
          placeholder="From"
          size="small"
          class="operand-date"
          @update:model-value="(v) => patch({ from: toIso(v) })"
        />
        <InputNumber
          v-else-if="editor === 'number'"
          :model-value="condition.from"
          :use-grouping="false"
          size="small"
          class="operand-number"
          @update:model-value="(v) => patch({ from: v })"
        />
        <InputText
          v-else
          :model-value="condition.from"
          size="small"
          class="operand-text"
          @update:model-value="(v) => patch({ from: v })"
        />

        <span class="operand-sep">and</span>

        <DatePicker
          v-if="editor === 'date'"
          :model-value="asDate(condition.to)"
          show-time
          hour-format="24"
          placeholder="To"
          size="small"
          class="operand-date"
          @update:model-value="(v) => patch({ to: toIso(v) })"
        />
        <InputNumber
          v-else-if="editor === 'number'"
          :model-value="condition.to"
          :use-grouping="false"
          size="small"
          class="operand-number"
          @update:model-value="(v) => patch({ to: v })"
        />
        <InputText
          v-else
          :model-value="condition.to"
          size="small"
          class="operand-text"
          @update:model-value="(v) => patch({ to: v })"
        />
      </template>

      <template v-else>
        <Button
          v-if="editor === 'object'"
          :label="
            condition.display ?? (condition.value ? `[${condition.value}]` : 'Select object...')
          "
          icon="pi pi-sitemap"
          size="small"
          severity="secondary"
          outlined
          class="operand-object"
          @click="openPicker('value')"
        />
        <DatePicker
          v-else-if="editor === 'date'"
          :model-value="asDate(condition.value)"
          show-time
          hour-format="24"
          placeholder="Date and time"
          size="small"
          class="operand-date"
          @update:model-value="(v) => patch({ value: toIso(v) })"
        />
        <Select
          v-else-if="editor === 'coded'"
          :model-value="condition.value"
          :options="codedOptions"
          option-label="label"
          option-value="value"
          placeholder="Select value..."
          size="small"
          class="operand-select"
          @update:model-value="(v) => patch({ value: v })"
        />
        <Select
          v-else-if="editor === 'user'"
          :model-value="condition.value"
          :options="userOptions"
          option-label="label"
          option-value="value"
          placeholder="Select user..."
          size="small"
          filter
          class="operand-select"
          @update:model-value="(v) => patch({ value: v })"
        />
        <Select
          v-else-if="editor === 'event'"
          :model-value="condition.value"
          :options="eventOptions"
          option-label="label"
          option-value="value"
          placeholder="Select event..."
          size="small"
          filter
          class="operand-select"
          @update:model-value="(v) => patch({ value: v })"
        />
        <Select
          v-else-if="editor === 'zone'"
          :model-value="condition.value"
          :options="zoneOptions"
          option-label="label"
          option-value="value"
          placeholder="Select zone..."
          size="small"
          filter
          class="operand-select"
          @update:model-value="(v) => patch({ value: v })"
        />
        <InputNumber
          v-else-if="editor === 'number'"
          :model-value="condition.value"
          :use-grouping="false"
          size="small"
          class="operand-number"
          @update:model-value="(v) => patch({ value: v })"
        />
        <InputText
          v-else
          :model-value="condition.value"
          :placeholder="operator.wrap ? 'Text to find' : 'SQL pattern, % and _ as wildcards'"
          size="small"
          class="operand-text"
          @update:model-value="(v) => patch({ value: v })"
        />
      </template>
    </div>

    <Button
      icon="pi pi-times"
      severity="secondary"
      text
      size="small"
      aria-label="Remove condition"
      :disabled="!removable"
      @click="emit('remove')"
    />

    <!-- Mounted on demand: the picker loads object trees. -->
    <ObjectPickerDialog
      v-if="pickerOpen"
      visible
      title="Select object"
      :perspectives="OBJECT_PICKER_PERSPECTIVES"
      show-perspective-root
      @update:visible="pickerOpen = $event"
      @select="onObjectPicked"
    />
  </div>
</template>

<style scoped>
.condition-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.condition-operator {
  flex: 0 0 10rem;
}

.condition-operands {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.operand-text {
  flex: 1;
  min-width: 6rem;
}

.operand-select {
  flex: 1;
  min-width: 8rem;
}

.operand-number {
  width: 7rem;
}

.operand-unit {
  width: 7rem;
}

.operand-period {
  width: 10rem;
}

.operand-date {
  flex: 1;
  min-width: 9rem;
}

.operand-object {
  flex: 1;
  justify-content: flex-start;
  overflow: hidden;
}

.operand-sep {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
