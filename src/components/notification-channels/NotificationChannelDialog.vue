<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import MutationErrorState from '@/components/common/MutationErrorState.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  channel: {
    type: Object,
    default: null,
  },
  drivers: {
    type: Array,
    default: () => [],
  },
  saving: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.channel)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Channel' : 'Add Channel'))

const form = ref({
  name: '',
  description: '',
  driverName: null,
  configuration: '',
})

const originalName = ref('')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    if (props.channel) {
      form.value = {
        name: props.channel.name ?? '',
        description: props.channel.description ?? '',
        driverName: props.channel.driverName ?? null,
        configuration: props.channel.configuration ?? '',
      }
      originalName.value = props.channel.name ?? ''
    } else {
      form.value = { name: '', description: '', driverName: null, configuration: '' }
      originalName.value = ''
    }
  },
  { immediate: true },
)

const driverOptions = computed(() => props.drivers.map((d) => ({ label: d, value: d })))

const nameError = ref(false)
const driverError = ref(false)

function validate() {
  nameError.value = !form.value.name.trim()
  driverError.value = !form.value.driverName
  return !nameError.value && !driverError.value
}

function onSave() {
  if (!validate()) return

  emit('save', {
    originalName: originalName.value,
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    driverName: form.value.driverName,
    configuration: form.value.configuration,
  })
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
    :style="{ width: '40rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="channel-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="channel-name"
          v-model="form.name"
          :disabled="saving"
          placeholder="e.g. SMTP-Alerts"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="form-field">
        <label for="channel-description">Description</label>
        <Textarea
          id="channel-description"
          v-model="form.description"
          :disabled="saving"
          placeholder="Optional description"
          rows="2"
          class="w-full"
          auto-resize
        />
      </div>

      <div class="form-field" :class="{ 'field-error': driverError }">
        <label for="channel-driver">Driver <span class="required">*</span></label>
        <Select
          id="channel-driver"
          v-model="form.driverName"
          :options="driverOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          placeholder="Select driver"
          class="w-full"
          @change="driverError = false"
        />
        <small v-if="driverError" class="error-text">Driver is required</small>
      </div>

      <div class="form-field">
        <label for="channel-configuration">Configuration</label>
        <Textarea
          id="channel-configuration"
          v-model="form.configuration"
          :disabled="saving"
          placeholder="Driver-specific configuration (XML or NXSL script)"
          rows="8"
          class="w-full configuration-area"
        />
        <small class="hint-text"
          >Driver-specific configuration — format depends on the selected driver</small
        >
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="saving" @click="onHide" />
      <Button
        :label="isEdit ? 'Save' : 'Add'"
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

.form-error {
  margin-bottom: 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.required {
  color: var(--p-red-500);
}

.field-error :deep(.p-inputtext),
.field-error :deep(.p-select) {
  border-color: var(--p-red-500);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.configuration-area :deep(textarea) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  resize: vertical;
}
</style>
