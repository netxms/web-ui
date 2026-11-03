<script setup>
import { ref, watch, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import FormField from '@/components/common/FormField.vue'

// Serves both "Add comment" and "Block incident" (the reason is required: RCC_COMMENT_REQUIRED),
// like the legacy EditIncidentCommentDialog.
const props = defineProps({
  visible: { type: Boolean, default: false },
  header: { type: String, default: 'Add Comment' },
  label: { type: String, default: 'Comment' },
  required: { type: Boolean, default: false },
  confirmLabel: { type: String, default: 'Save' },
  isPending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'submit'])

const text = ref('')

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) text.value = ''
  },
)

const canSubmit = computed(() => !props.required || text.value.trim().length > 0)

function close() {
  emit('update:visible', false)
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', text.value.trim())
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :style="{ width: '32rem' }"
    :draggable="false"
    @update:visible="close"
  >
    <FormField class="comment-field" :label="label" :required="required" v-slot="{ id }">
      <Textarea
        :id="id"
        v-model="text"
        auto-resize
        rows="6"
        class="comment-input"
        :placeholder="label"
        autofocus
      />
    </FormField>
    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="isPending" @click="close" />
      <Button
        :label="confirmLabel"
        icon="pi pi-check"
        :loading="isPending"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.comment-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.comment-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.required {
  color: var(--p-red-500);
  margin-left: 0.15rem;
}

.comment-input {
  width: 100%;
}
</style>
