<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import EventPickerDialog from '@/components/epp/EventPickerDialog.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  threshold: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'save'])

const FUNCTION_OPTIONS = [
  { value: 'last', label: 'Last value' },
  { value: 'average', label: 'Average' },
  { value: 'meanDeviation', label: 'Mean deviation' },
  { value: 'diff', label: 'Difference' },
  { value: 'error', label: 'Error' },
  { value: 'sum', label: 'Sum' },
  { value: 'script', label: 'Script' },
  { value: 'absoluteDeviation', label: 'Absolute deviation' },
  { value: 'anomaly', label: 'Anomaly' },
]

const CONDITION_OPTIONS = [
  { value: 'less', label: '< Less than' },
  { value: 'lessOrEqual', label: '<= Less than or equal' },
  { value: 'equal', label: '= Equal' },
  { value: 'greaterOrEqual', label: '>= Greater than or equal' },
  { value: 'greater', label: '> Greater than' },
  { value: 'notEqual', label: '!= Not equal' },
  { value: 'like', label: 'Like (pattern)' },
  { value: 'notLike', label: 'Not like (pattern)' },
  { value: 'iLike', label: 'Like (case-insensitive)' },
  { value: 'iNotLike', label: 'Not like (case-insensitive)' },
]

function buildForm(t) {
  return {
    id: t?.id ?? 0,
    function: t?.function ?? 'last',
    condition: t?.condition ?? 'greaterOrEqual',
    value: t?.value ?? '',
    script: t?.script ?? '',
    sampleCount: t?.sampleCount ?? 1,
    deactivationSampleCount: t?.deactivationSampleCount ?? 1,
    activationEvent: t?.activationEvent ?? 'SYS_THRESHOLD_REACHED',
    deactivationEvent: t?.deactivationEvent ?? 'SYS_THRESHOLD_REARMED',
    repeatInterval: t?.repeatInterval ?? -1,
    regenerateOnValueChange: t?.regenerateOnValueChange ?? false,
    disabled: t?.disabled ?? false,
  }
}

const form = ref(buildForm(props.threshold))

watch(
  () => [props.visible, props.threshold],
  ([v]) => {
    if (v) form.value = buildForm(props.threshold)
  },
)

const showConditionValue = computed(
  () => !['script', 'error', 'anomaly'].includes(form.value.function),
)

// DciThreshold activation/deactivation events are event names, while EventPickerDialog works
// with codes, so translate both ways through the event template list.
const { data: eventTemplatesData } = useEventTemplates()
const eventNameByCode = computed(() => {
  const map = new Map()
  for (const t of eventTemplatesData.value ?? []) map.set(t.code, t.name)
  return map
})
const eventCodeByName = computed(() => {
  const map = new Map()
  for (const t of eventTemplatesData.value ?? []) map.set(t.name, t.code)
  return map
})

function codeFieldFor(fieldName) {
  return computed({
    get: () => eventCodeByName.value.get(form.value[fieldName]) ?? 0,
    set: (code) => {
      form.value[fieldName] = code ? (eventNameByCode.value.get(code) ?? '') : ''
    },
  })
}

const activationEventCode = codeFieldFor('activationEvent')
const deactivationEventCode = codeFieldFor('deactivationEvent')

const showActivationEventPicker = ref(false)
const showDeactivationEventPicker = ref(false)

function save() {
  const result = { ...form.value }
  if (!result.id) delete result.id
  emit('save', result)
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="threshold !== null ? 'Edit Threshold' : 'Add Threshold'"
    modal
    :style="{ width: '640px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="threshold-form">
      <div class="form-row-inline">
        <FormField label="Function" v-slot="{ id }">
          <Select
            autofocus
            :input-id="id"
            v-model="form.function"
            :options="FUNCTION_OPTIONS"
            option-label="label"
            option-value="value"
            size="small"
            class="full-width"
          />
        </FormField>
        <FormField label="Sample Count" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.sampleCount"
            :min="1"
            :max="100"
            size="small"
            class="full-width"
          />
        </FormField>
      </div>

      <div v-if="showConditionValue" class="form-row-inline">
        <FormField label="Condition" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.condition"
            :options="CONDITION_OPTIONS"
            option-label="label"
            option-value="value"
            size="small"
            class="full-width"
          />
        </FormField>
        <FormField label="Value" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.value"
            size="small"
            class="full-width"
            placeholder="Threshold value"
          />
        </FormField>
      </div>

      <FormField v-if="form.function === 'script'" label="Script" group>
        <NxslScriptEditor
          v-model="form.script"
          hint-key="dci-threshold-script"
          show-compile
          :rows="5"
        />
      </FormField>

      <div class="form-row-inline">
        <FormField label="Deactivation Samples" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.deactivationSampleCount"
            :min="1"
            :max="100"
            size="small"
            class="full-width"
          />
        </FormField>
        <FormField label="Repeat Every" v-slot="{ id }">
          <div class="inline-with-hint">
            <InputNumber
              :input-id="id"
              v-model="form.repeatInterval"
              :min="-1"
              size="small"
              class="repeat-input"
            />
            <span class="field-hint">seconds (-1 = no repeat)</span>
          </div>
        </FormField>
      </div>

      <div class="form-row-inline">
        <FormField label="Activation Event" group>
          <div class="event-picker-field">
            <span v-if="form.activationEvent" class="event-picker-value">{{
              form.activationEvent
            }}</span>
            <span v-else class="event-picker-empty">(none)</span>
            <Button
              label="Select..."
              icon="pi pi-list"
              size="small"
              severity="secondary"
              outlined
              @click="showActivationEventPicker = true"
            />
          </div>
        </FormField>
        <FormField label="Deactivation Event" group>
          <div class="event-picker-field">
            <span v-if="form.deactivationEvent" class="event-picker-value">{{
              form.deactivationEvent
            }}</span>
            <span v-else class="event-picker-empty">(none)</span>
            <Button
              label="Select..."
              icon="pi pi-list"
              size="small"
              severity="secondary"
              outlined
              @click="showDeactivationEventPicker = true"
            />
          </div>
        </FormField>
      </div>

      <FormField label="Options" group>
        <div class="checkboxes">
          <div class="checkbox-row">
            <Checkbox v-model="form.regenerateOnValueChange" input-id="thr-regen" binary />
            <label for="thr-regen">Regenerate event on value change</label>
          </div>
          <div class="checkbox-row">
            <Checkbox v-model="form.disabled" input-id="thr-disabled" binary />
            <label for="thr-disabled">Disable this threshold</label>
          </div>
        </div>
      </FormField>
    </div>

    <EventPickerDialog v-model:visible="showActivationEventPicker" v-model="activationEventCode" />
    <EventPickerDialog
      v-model:visible="showDeactivationEventPicker"
      v-model="deactivationEventCode"
    />

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="cancel" />
      <Button label="Save" severity="primary" icon="pi pi-check" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.threshold-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.full-width {
  width: 100%;
}

.checkboxes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-row label {
  width: auto;
  color: var(--p-text-color);
  font-weight: normal;
  cursor: pointer;
}

.inline-with-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

:deep(.inline-with-hint input) {
  max-width: 100%;
}

.repeat-input {
  width: 6rem;
}

.field-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.event-picker-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.event-picker-value {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.event-picker-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
