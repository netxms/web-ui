<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Password from 'primevue/password'
import Select from 'primevue/select'
import RadioButton from 'primevue/radiobutton'
import Button from 'primevue/button'
import Message from 'primevue/message'
import FormField from '@/components/common/FormField.vue'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import {
  MAX_VARIABLE_NAME_LENGTH,
  MAX_VARIABLE_VALUE_LENGTH,
  defaultValueForDisplay,
  isDefaultValue,
} from '@/utils/serverConfigDisplay'

// The server stores every value as a string, so the form keeps one `value` string and each
// control converts on its own edge.
const props = defineProps({
  visible: { type: Boolean, required: true },
  /** null to create a new one */
  variable: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
  existingNames: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'save', 'reset'])

const isEdit = computed(() => !!props.variable)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Variable' : 'Create Variable'))

const hasDefault = computed(() => isEdit.value && (props.variable.defaultValue ?? '') !== '')
const isAtDefault = computed(() => isEdit.value && isDefaultValue(props.variable))

// The create handler cannot set a type: a new variable is always a STRING.
const dataType = computed(() => (isEdit.value ? (props.variable.dataType ?? 'STRING') : 'STRING'))

const name = ref('')
const value = ref('')
const nameError = ref('')

// INTEGER variables carry their upper bound as the first row of `config_values`.
const integerMax = computed(() => {
  const first = props.variable?.possibleValues?.[0]?.value
  const parsed = Number.parseInt(first ?? '', 10)
  return Number.isNaN(parsed) ? 0x7fffffff : parsed
})

const numericValue = computed({
  get: () => {
    const parsed = Number.parseInt(value.value, 10)
    return Number.isNaN(parsed) ? 0 : parsed
  },
  set: (next) => {
    value.value = String(next ?? 0)
  },
})

const booleanValue = computed({
  get: () => (Number.parseInt(value.value, 10) ? '1' : '0'),
  set: (next) => {
    value.value = next
  },
})

const colorValue = computed({
  get: () => (/^#?[0-9a-f]{6}$/i.test(value.value.trim()) ? value.value.trim() : '#000000'),
  set: (next) => {
    value.value = next
  },
})

const choiceOptions = computed(() =>
  (props.variable?.possibleValues ?? []).map((option) => ({
    value: option.value,
    label: option.description || option.value,
  })),
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nameError.value = ''
    name.value = props.variable?.name ?? ''
    value.value = props.variable?.value ?? ''
  },
  { immediate: true },
)

// The dialog stays open after a reset, so the stored value is mirrored back into the form.
watch(
  () => props.variable?.value,
  (next) => {
    if (props.visible && isEdit.value) value.value = next ?? ''
  },
)

function validateName() {
  const trimmed = name.value.trim()
  if (!trimmed) return 'Name is required'
  if (trimmed.length > MAX_VARIABLE_NAME_LENGTH) {
    return `Name cannot exceed ${MAX_VARIABLE_NAME_LENGTH} characters`
  }
  if (props.existingNames.includes(trimmed)) return 'A variable with this name already exists'
  return ''
}

function onSave() {
  if (!isEdit.value) {
    nameError.value = validateName()
    if (nameError.value) return
  }
  emit('save', { name: name.value.trim(), value: value.value })
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    modal
    :style="{ width: '34rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" />

      <FormField
        label="Name"
        required
        :error="nameError"
        :empty="!isEdit && !name.trim()"
        v-slot="{ id }"
      >
        <InputText
          :id="id"
          v-model="name"
          :disabled="isEdit || saving"
          :maxlength="MAX_VARIABLE_NAME_LENGTH"
          :autofocus="!isEdit"
          spellcheck="false"
          placeholder="e.g. Objects.Nodes.SyncInterval"
          class="w-full"
          @input="nameError = ''"
        />
      </FormField>

      <p v-if="variable?.description" class="variable-description">{{ variable.description }}</p>

      <FormField v-if="dataType === 'BOOLEAN'" label="Value" group>
        <div class="boolean-choice">
          <div class="radio-option">
            <RadioButton v-model="booleanValue" input-id="scv-true" value="1" :disabled="saving" />
            <label for="scv-true">True</label>
          </div>
          <div class="radio-option">
            <RadioButton v-model="booleanValue" input-id="scv-false" value="0" :disabled="saving" />
            <label for="scv-false">False</label>
          </div>
        </div>
      </FormField>

      <FormField v-else-if="dataType === 'CHOICE'" label="Value" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="value"
          :options="choiceOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          placeholder="Select a value"
          class="w-full"
        />
      </FormField>

      <FormField v-else-if="dataType === 'COLOR'" label="Value" group>
        <ColorPickerField v-model="colorValue" :disabled="saving" />
      </FormField>

      <FormField v-else-if="dataType === 'INTEGER'" label="Value" v-slot="{ id }">
        <div class="integer-value">
          <InputNumber
            :input-id="id"
            v-model="numericValue"
            :min="0"
            :max="integerMax"
            :disabled="saving"
            show-buttons
            button-layout="horizontal"
            class="integer-input"
          />
          <span v-if="variable?.units" class="value-units">{{ variable.units }}</span>
        </div>
      </FormField>

      <FormField v-else-if="dataType === 'PASSWORD'" label="Value" v-slot="{ id }">
        <Password
          :input-id="id"
          v-model="value"
          :disabled="saving"
          :feedback="false"
          toggle-mask
          :maxlength="MAX_VARIABLE_VALUE_LENGTH"
          class="w-full"
          input-class="w-full"
        />
      </FormField>

      <FormField v-else label="Value" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="value"
          :disabled="saving"
          :maxlength="MAX_VARIABLE_VALUE_LENGTH"
          :autofocus="isEdit"
          spellcheck="false"
          class="w-full"
        />
      </FormField>

      <div v-if="hasDefault" class="default-row">
        <span class="default-label">Default</span>
        <span class="default-value">{{ defaultValueForDisplay(variable) }}</span>
        <Button
          label="Reset to default"
          icon="pi pi-undo"
          text
          size="small"
          severity="secondary"
          :disabled="saving || isAtDefault"
          @click="emit('reset', variable.name)"
        />
      </div>

      <Message v-if="variable?.needServerRestart" severity="warn" :closable="false">
        Changing this variable takes effect only after the server is restarted.
      </Message>

      <Message v-if="!isEdit" severity="secondary" :closable="false">
        New variables are created as visible text variables with no description, units or default
        value.
      </Message>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="saving" @click="onHide" />
      <Button
        :label="isEdit ? 'Save' : 'Create'"
        icon="pi pi-check"
        :loading="saving"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.variable-description {
  margin: -0.5rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--p-text-muted-color);
}

.boolean-choice {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.radio-option label {
  font-size: 0.875rem;
  cursor: pointer;
}

.integer-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.integer-input {
  flex: 1;
  min-width: 0;
}

.value-units {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.default-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
  background: var(--p-surface-ground);
}

.default-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.default-value {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--p-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
