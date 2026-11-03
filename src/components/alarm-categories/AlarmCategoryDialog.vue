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
  category: {
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

const isEdit = computed(() => !!props.category)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Alarm Category' : 'Add Alarm Category'))

const form = ref({ name: '', description: '' })
const nameError = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nameError.value = false
    if (props.category) {
      form.value = {
        name: props.category.name ?? '',
        description: props.category.description ?? '',
      }
    } else {
      form.value = { name: '', description: '' }
    }
  },
  { immediate: true },
)

function onSave() {
  nameError.value = !form.value.name.trim()
  if (nameError.value) return
  emit('save', {
    name: form.value.name.trim(),
    description: form.value.description.trim(),
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
    :style="{ width: '32rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="category-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="category-name"
          v-model="form.name"
          :disabled="saving"
          placeholder="e.g. Network Infrastructure"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="form-field">
        <label for="category-description">Description</label>
        <Textarea
          id="category-description"
          v-model="form.description"
          :disabled="saving"
          :rows="3"
          :maxlength="255"
          placeholder="Optional description"
          class="w-full"
          auto-resize
        />
        <small class="char-count" :class="{ 'char-count--limit': form.description.length >= 255 }">
          {{ form.description.length }} / 255
        </small>
      </div>
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
  gap: 1.25rem;
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

.char-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-align: right;
}

.char-count--limit {
  color: var(--p-red-500);
}
</style>
