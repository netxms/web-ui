<script setup>
import { ref, watch } from 'vue'
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
  channel: {
    type: Object,
    default: null,
  },
  sending: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['update:visible', 'send'])

const form = ref({
  recipient: '',
  subject: '',
  body: '',
})

const recipientError = ref(false)
const bodyError = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = { recipient: '', subject: '', body: '' }
    recipientError.value = false
    bodyError.value = false
  },
)

function validate() {
  recipientError.value = !form.value.recipient.trim()
  bodyError.value = !form.value.body.trim()
  return !recipientError.value && !bodyError.value
}

function onSend() {
  if (!validate()) return

  const payload = {
    recipient: form.value.recipient.trim(),
    body: form.value.body.trim(),
  }
  if (props.channel?.needSubject && form.value.subject.trim()) {
    payload.subject = form.value.subject.trim()
  }
  emit('send', payload)
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Send Test Notification"
    modal
    :style="{ width: '26rem' }"
    :closable="!sending"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': recipientError }">
        <label for="test-recipient">Recipient <span class="required">*</span></label>
        <InputText
          autofocus
          id="test-recipient"
          v-model="form.recipient"
          :disabled="sending"
          placeholder="e.g. admin@example.com"
          class="w-full"
          @input="recipientError = false"
        />
        <small v-if="recipientError" class="error-text">Recipient is required</small>
        <small v-else-if="channel && !channel.needRecipient" class="hint-text">
          This driver may not use the recipient field
        </small>
      </div>

      <Transition name="field-slide">
        <div v-if="channel?.needSubject" class="form-field">
          <label for="test-subject">Subject</label>
          <InputText
            id="test-subject"
            v-model="form.subject"
            :disabled="sending"
            placeholder="Message subject"
            class="w-full"
          />
        </div>
      </Transition>

      <div class="form-field" :class="{ 'field-error': bodyError }">
        <label for="test-body">Message <span class="required">*</span></label>
        <Textarea
          id="test-body"
          v-model="form.body"
          :disabled="sending"
          placeholder="Test message body"
          rows="4"
          class="w-full"
          @input="bodyError = false"
        />
        <small v-if="bodyError" class="error-text">Message is required</small>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="sending" @click="onHide" />
      <Button label="Send" icon="pi pi-send" :loading="sending" @click="onSend" />
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
.field-error :deep(.p-textarea) {
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
