<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import InputText from 'primevue/inputtext'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** Existing method to edit, or null for create. */
  method: {
    type: Object,
    default: null,
  },
  drivers: {
    type: Array,
    default: () => [],
  },
  channels: {
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

const isEdit = computed(() => !!props.method)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Method' : 'Add Method'))

const form = ref({
  name: '',
  description: '',
  driver: null,
  notificationChannel: '',
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    if (props.method) {
      form.value = {
        name: props.method.name ?? '',
        description: props.method.description ?? '',
        driver: props.method.driver ?? null,
        notificationChannel: props.method.configuration?.notificationChannelName ?? '',
      }
    } else {
      form.value = { name: '', description: '', driver: null, notificationChannel: '' }
    }
  },
  { immediate: true },
)

const driverOptions = computed(() => props.drivers.map((d) => ({ label: d, value: d })))

const showChannelField = computed(() => form.value.driver === 'Message')

const nameError = ref(false)
const driverError = ref(false)

function validate() {
  nameError.value = !form.value.name.trim()
  driverError.value = !form.value.driver
  return !nameError.value && !driverError.value
}

function onSave() {
  if (!validate()) return

  const payload = {
    name: form.value.name.trim(),
    driver: form.value.driver,
  }
  if (form.value.description.trim()) {
    payload.description = form.value.description.trim()
  }
  if (showChannelField.value && form.value.notificationChannel.trim()) {
    payload.configuration = {
      notificationChannelName: form.value.notificationChannel.trim(),
    }
  }
  emit('save', payload)
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
    :style="{ width: '28rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="method-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="method-name"
          v-model="form.name"
          :disabled="saving"
          placeholder="e.g. TOTP Auth"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="form-field">
        <label for="method-description">Description</label>
        <Textarea
          id="method-description"
          v-model="form.description"
          :disabled="saving"
          placeholder="Optional description"
          rows="2"
          class="w-full"
          auto-resize
        />
      </div>

      <div class="form-field" :class="{ 'field-error': driverError }">
        <label for="method-driver">Driver <span class="required">*</span></label>
        <Select
          id="method-driver"
          v-model="form.driver"
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

      <Transition name="field-slide">
        <div v-if="showChannelField" class="form-field">
          <label for="method-channel">Notification channel <span class="required">*</span></label>
          <Select
            id="method-channel"
            v-model="form.notificationChannel"
            :options="channels"
            option-label="name"
            option-value="name"
            :disabled="saving"
            show-clear
            placeholder="Select channel..."
            class="w-full"
          />
        </div>
      </Transition>
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

.field-slide-enter-active,
.field-slide-leave-active {
  transition:
    opacity 0.2s,
    max-height 0.2s;
  max-height: 6rem;
  overflow: hidden;
}

.field-slide-enter-from,
.field-slide-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
