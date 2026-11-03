<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { MAX_KEY_LENGTH, MAX_VALUE_LENGTH, validateKey } from '@/utils/persistentStorage'

// The key is fixed once the entry exists. Create rejects a key already in the list, because
// the PUT is an upsert and would overwrite it silently.
const props = defineProps({
  visible: { type: Boolean, required: true },
  entry: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
  existingKeys: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.entry)

const key = ref('')
const value = ref('')
const keyError = ref('')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    keyError.value = ''
    key.value = props.entry?.key ?? ''
    value.value = props.entry?.value ?? ''
  },
  { immediate: true },
)

function onSave() {
  if (!isEdit.value) {
    keyError.value = validateKey(key.value.trim(), props.existingKeys)
    if (keyError.value) return
  }
  emit('save', { key: isEdit.value ? props.entry.key : key.value.trim(), value: value.value })
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? 'Edit Entry' : 'Create Entry'"
    modal
    :style="{ width: '34rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" />

      <FormField
        label="Key"
        required
        :error="keyError"
        :empty="!isEdit && !key.trim()"
        v-slot="{ id }"
      >
        <InputText
          :id="id"
          v-model="key"
          :disabled="isEdit || saving"
          :maxlength="MAX_KEY_LENGTH"
          :autofocus="!isEdit"
          spellcheck="false"
          placeholder="e.g. Backup.LastRun"
          class="w-full"
          @input="keyError = ''"
        />
      </FormField>

      <FormField
        label="Value"
        :hint="`${value.length} / ${MAX_VALUE_LENGTH}`"
        v-slot="{ id, describedBy }"
      >
        <Textarea
          :id="id"
          v-model="value"
          :aria-describedby="describedBy"
          :disabled="saving"
          :maxlength="MAX_VALUE_LENGTH"
          :autofocus="isEdit"
          :rows="4"
          auto-resize
          spellcheck="false"
          class="w-full entry-value"
        />
      </FormField>
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

.entry-value {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  max-height: 20rem;
}
</style>
