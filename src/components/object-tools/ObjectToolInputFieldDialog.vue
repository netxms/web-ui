<script setup>
import { ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { INPUT_TYPES } from '@/utils/objectToolUtils'

const INPUT_FIELD_VALIDATE_PASSWORD = 0x0001

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  field: {
    type: Object,
    default: null,
  },
  /** Names already in use (excluding the field being edited). */
  existingNames: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:visible', 'confirm'])

function buildForm(field) {
  return {
    name: field?.name ?? '',
    type: field?.type ?? 0,
    displayName: field?.displayName ?? '',
    defaultValue: field?.defaultValue ?? '',
    flags: field?.flags ?? 0,
    sequence: field?.sequence ?? -1,
  }
}

const form = ref(buildForm(props.field))

watch(
  () => props.field,
  (f) => {
    form.value = buildForm(f)
  },
)

watch(
  () => props.visible,
  (v) => {
    if (v) form.value = buildForm(props.field)
  },
)

function confirm() {
  emit('confirm', { ...form.value })
  emit('update:visible', false)
}

const isDuplicate = computed(() => props.existingNames.includes(form.value.name))

const isPassword = computed(() => form.value.type === 1)
const isDateTime = computed(() => form.value.type === 3)

const validatePassword = computed({
  get: () => (form.value.flags & INPUT_FIELD_VALIDATE_PASSWORD) !== 0,
  set: (val) => {
    form.value.flags = val
      ? form.value.flags | INPUT_FIELD_VALIDATE_PASSWORD
      : form.value.flags & ~INPUT_FIELD_VALIDATE_PASSWORD
  },
})

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="field ? 'Edit Input Field' : 'Add Input Field'"
    modal
    :style="{ width: '28rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="field-form">
      <div class="form-field">
        <label for="if-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="if-name"
          v-model="form.name"
          class="form-input"
          :invalid="isDuplicate"
        />
        <small v-if="isDuplicate" class="error-text">A field with this name already exists.</small>
      </div>
      <div class="form-field">
        <label for="if-type">Type</label>
        <Select
          id="if-type"
          v-model="form.type"
          :options="INPUT_TYPES"
          option-label="label"
          option-value="value"
          class="form-input"
        />
      </div>
      <div class="form-field">
        <label for="if-displayname">Display Name</label>
        <InputText id="if-displayname" v-model="form.displayName" class="form-input" />
      </div>
      <div v-if="!isDateTime" class="form-field">
        <label for="if-default">Default Value</label>
        <InputText id="if-default" v-model="form.defaultValue" class="form-input" />
      </div>
      <label v-if="isPassword" class="check-row">
        <Checkbox v-model="validatePassword" binary input-id="if-validate" />
        <span>Validate password after entry</span>
      </label>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="cancel" />
      <Button
        label="OK"
        severity="primary"
        :disabled="!form.name || isDuplicate"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.field-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.form-input {
  width: 100%;
}

.required {
  color: var(--p-red-400);
}

.error-text {
  color: var(--p-red-400);
  font-size: 0.75rem;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0 0;
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
