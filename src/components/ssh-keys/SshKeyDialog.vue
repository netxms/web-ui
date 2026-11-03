<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import MutationErrorState from '@/components/common/MutationErrorState.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** Null for create */
  sshKey: {
    type: Object,
    default: null,
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

const isEdit = computed(() => !!props.sshKey)
const dialogTitle = computed(() => (isEdit.value ? 'Edit SSH Key' : 'Add SSH Key'))

const submitLabel = computed(() => {
  if (isEdit.value) return 'Save'
  const hasKeyData =
    form.value.publicKey.trim().length > 0 || form.value.privateKey.trim().length > 0
  return importMode.value && hasKeyData ? 'Add' : 'Generate'
})

const form = ref({ name: '', publicKey: '', privateKey: '' })
const importMode = ref(false)
const keyEditExpanded = ref(false)
const nameError = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    importMode.value = false
    keyEditExpanded.value = false
    nameError.value = false
    if (props.sshKey) {
      form.value = { name: props.sshKey.name ?? '', publicKey: '', privateKey: '' }
    } else {
      form.value = { name: '', publicKey: '', privateKey: '' }
    }
  },
  { immediate: true },
)

function onSave() {
  nameError.value = !form.value.name.trim()
  if (nameError.value) return

  const payload = { name: form.value.name.trim() }
  if (isEdit.value) {
    if (keyEditExpanded.value) {
      payload.publicKey = form.value.publicKey.trim()
      payload.privateKey = form.value.privateKey.trim()
    }
  } else {
    if (importMode.value && form.value.publicKey.trim()) {
      payload.publicKey = form.value.publicKey.trim()
      payload.privateKey = form.value.privateKey.trim()
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
    :style="{ width: '38rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="key-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="key-name"
          v-model="form.name"
          :disabled="saving"
          placeholder="e.g. Production Server Key"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div v-if="isEdit" class="key-edit-section">
        <button
          type="button"
          class="toggle-btn"
          :disabled="saving"
          @click="keyEditExpanded = !keyEditExpanded"
        >
          <i
            :class="keyEditExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
            class="toggle-icon"
          />
          Replace key pair
        </button>
        <Transition name="field-slide">
          <div v-if="keyEditExpanded" class="key-edit-panel">
            <div class="form-field">
              <label for="key-public">Public key <span class="required">*</span></label>
              <Textarea
                id="key-public"
                v-model="form.publicKey"
                :disabled="saving"
                placeholder="ssh-rsa AAAA..."
                rows="4"
                class="w-full key-textarea"
              />
            </div>
            <div class="form-field">
              <label for="key-private">Private key <span class="required">*</span></label>
              <Textarea
                id="key-private"
                v-model="form.privateKey"
                :disabled="saving"
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                rows="6"
                class="w-full key-textarea"
              />
            </div>
          </div>
        </Transition>
      </div>

      <div v-if="!isEdit" class="import-toggle">
        <button
          type="button"
          class="toggle-btn"
          :disabled="saving"
          @click="importMode = !importMode"
        >
          <i
            :class="importMode ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
            class="toggle-icon"
          />
          Import existing key pair
        </button>
        <p v-if="!importMode" class="hint-text">Leave empty to auto-generate a new RSA key pair.</p>
      </div>

      <Transition name="field-slide">
        <div v-if="importMode && !isEdit" class="import-fields">
          <div class="form-field">
            <label for="key-public">Public key <span class="required">*</span></label>
            <Textarea
              id="key-public"
              v-model="form.publicKey"
              :disabled="saving"
              placeholder="ssh-rsa AAAA..."
              rows="4"
              class="w-full key-textarea"
            />
          </div>
          <div class="form-field">
            <label for="key-private">Private key <span class="required">*</span></label>
            <Textarea
              id="key-private"
              v-model="form.privateKey"
              :disabled="saving"
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
              rows="6"
              class="w-full key-textarea"
            />
          </div>
        </div>
      </Transition>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="saving" @click="onHide" />
      <Button
        :label="submitLabel"
        :icon="submitLabel === 'Generate' ? 'pi pi-refresh' : 'pi pi-check'"
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

.field-error :deep(.p-inputtext) {
  border-color: var(--p-red-500);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin: 0.25rem 0 0;
}

.key-edit-section {
  display: flex;
  flex-direction: column;
}

.key-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-ground);
}

.import-toggle {
  display: flex;
  flex-direction: column;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-primary-color);
  text-align: left;
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-icon {
  font-size: 0.75rem;
}

.import-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

:deep(.key-textarea textarea) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  resize: vertical;
}

.field-slide-enter-active,
.field-slide-leave-active {
  transition:
    opacity 0.2s,
    max-height 0.25s;
  max-height: 20rem;
  overflow: hidden;
}

.field-slide-enter-from,
.field-slide-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
