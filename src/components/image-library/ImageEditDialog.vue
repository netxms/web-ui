<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useImageData } from '@/queries/useImageLibraryQueries'
const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** null for upload. */
  image: {
    type: Object,
    default: null,
  },
  /** Derived from the image list. */
  categories: {
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

const isEdit = computed(() => !!props.image)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Image' : 'Upload Image'))

const form = ref({ name: '', category: null })
const selectedFile = ref(null)
/** Blob URL for a file the user just picked. */
const filePreviewUrl = ref(null)

const nameError = ref(false)
const categoryError = ref(false)
const fileError = ref(false)

const filteredCategories = ref([])

function onCategoryComplete(event) {
  const q = event.query.trim().toLowerCase()
  filteredCategories.value = q
    ? props.categories.filter((c) => c.toLowerCase().includes(q))
    : [...props.categories]
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nameError.value = false
    categoryError.value = false
    fileError.value = false
    selectedFile.value = null
    if (props.image) {
      form.value = { name: props.image.name ?? '', category: props.image.category ?? null }
      filePreviewUrl.value = null
    } else {
      form.value = { name: '', category: null }
      filePreviewUrl.value = null
    }
  },
  { immediate: true },
)

// The list rows carry metadata only, so the current picture is fetched while the dialog is open.
const existingGuid = computed(() => (props.visible && props.image ? props.image.id : null))
const { data: existingUrl } = useImageData(existingGuid)

/** A freshly picked file wins over the stored image. */
const previewUrl = computed(() => filePreviewUrl.value ?? existingUrl.value ?? null)

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  selectedFile.value = file
  fileError.value = false
  filePreviewUrl.value = URL.createObjectURL(file)
  if (!form.value.name) {
    form.value.name = file.name.replace(/\.[^.]+$/, '')
  }
}

function validate() {
  nameError.value = !form.value.name.trim()
  categoryError.value = !form.value.category
  fileError.value = !isEdit.value && !selectedFile.value
  return !nameError.value && !categoryError.value && !fileError.value
}

function onSave() {
  if (!validate()) return
  emit('save', {
    name: form.value.name.trim(),
    category: form.value.category,
    file: selectedFile.value,
  })
}

function onHide() {
  if (props.saving) return
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
      <MutationErrorState :error="error" />

      <div class="form-field" :class="{ 'field-error': fileError }">
        <span class="upload-caption"
          >Image File <span v-if="!isEdit" class="required">*</span></span
        >
        <label class="upload-area" :class="{ 'has-preview': previewUrl }">
          <img v-if="previewUrl" :src="previewUrl" alt="Preview" class="upload-preview" />
          <span v-else class="upload-placeholder">
            <i class="pi pi-upload upload-icon" />
            <span>Click to choose an image</span>
            <small>PNG, SVG, JPEG, GIF supported</small>
          </span>
          <span v-if="previewUrl" class="upload-replace-hint">
            <i class="pi pi-upload" /> {{ isEdit ? 'Click to replace' : selectedFile?.name }}
          </span>
          <input
            type="file"
            accept="image/*"
            class="upload-input"
            :disabled="saving"
            @change="onFileChange"
          />
        </label>
        <small v-if="fileError" class="error-text">Please select an image file</small>
        <small v-else-if="isEdit" class="hint-text"
          >Leave unchanged to keep the current image</small
        >
      </div>

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="img-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="img-name"
          v-model="form.name"
          :disabled="saving"
          placeholder="e.g. Router Icon"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="form-field" :class="{ 'field-error': categoryError }">
        <label for="img-category">Category <span class="required">*</span></label>
        <AutoComplete
          id="img-category"
          v-model="form.category"
          :suggestions="filteredCategories"
          :disabled="saving"
          placeholder="Select or type a category"
          class="w-full"
          dropdown
          @complete="onCategoryComplete"
          @input="categoryError = false"
        />
        <small v-if="categoryError" class="error-text">Category is required</small>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="saving" @click="onHide" />
      <Button
        :label="isEdit ? 'Save' : 'Upload'"
        :icon="isEdit ? 'pi pi-check' : 'pi pi-upload'"
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

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label:not(.upload-area),
/* A wrapping <label> is the control's name, so the caption is a <span> styled the same. */
.form-field .upload-caption {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.required {
  color: var(--p-red-500);
}

.upload-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 140px;
  border: 2px dashed var(--p-surface-border);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.15s,
    background-color 0.15s;
  background: var(--p-surface-ground);
}

.upload-area:hover {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.field-error .upload-area {
  border-color: var(--p-red-500);
}

.upload-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  pointer-events: none;
}

.upload-placeholder small {
  font-size: 0.75rem;
}

.upload-icon {
  font-size: 1.75rem;
  opacity: 0.5;
}

.upload-area.has-preview {
  min-height: 160px;
}

.upload-preview {
  max-width: 100%;
  max-height: 120px;
  object-fit: contain;
  border-radius: 4px;
  pointer-events: none;
}

.upload-replace-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  pointer-events: none;
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
</style>
