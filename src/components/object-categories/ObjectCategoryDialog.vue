<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import ImagePickerDialog from './ImagePickerDialog.vue'
import { useImageLibrary } from '@/queries/useImageLibraryQueries'
import LibraryImage from '@/components/image-library/LibraryImage.vue'
import FormField from '@/components/common/FormField.vue'
import ObjectIconPreview from '@/components/objects/ObjectIconPreview.vue'
import { useObjectIconStore } from '@/stores/objectIconStore'

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

const toast = useToast()
const iconStore = useObjectIconStore()

const isEdit = computed(() => !!props.category)
const dialogTitle = computed(() => (isEdit.value ? 'Edit Category' : 'Add Category'))

const form = ref({ name: '', iconImageId: null, mapImageId: null })
const nameError = ref(false)

const pickerVisible = ref(false)
const pickerTarget = ref(null) // 'icon' | 'map'
const pickerTitle = computed(() =>
  pickerTarget.value === 'icon' ? 'Choose Icon Image' : 'Choose Map Image',
)
const pickerSelectedId = computed(() =>
  pickerTarget.value === 'icon' ? form.value.iconImageId : form.value.mapImageId,
)

const { data: imagesData } = useImageLibrary()
const images = computed(() => imagesData.value ?? [])
const selectedIconImage = computed(
  () => images.value.find((img) => img.id === form.value.iconImageId) ?? null,
)
const selectedMapImage = computed(
  () => images.value.find((img) => img.id === form.value.mapImageId) ?? null,
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nameError.value = false
    // A category under preview reopens with its draft.
    const draft =
      props.category && iconStore.preview?.categoryId === props.category.id
        ? iconStore.preview
        : null
    if (props.category) {
      form.value = {
        name: draft?.name || props.category.name || '',
        iconImageId: draft ? draft.iconImageId : (props.category.iconImageId ?? null),
        mapImageId: draft ? draft.mapImageId : (props.category.mapImageId ?? null),
      }
    } else {
      form.value = { name: '', iconImageId: null, mapImageId: null }
    }
  },
  { immediate: true },
)

function openPicker(target) {
  pickerTarget.value = target
  pickerVisible.value = true
}

function onImageSelected(image) {
  if (pickerTarget.value === 'icon') {
    form.value.iconImageId = image.id
  } else {
    form.value.mapImageId = image.id
  }
}

function onSave() {
  nameError.value = !form.value.name.trim()
  if (nameError.value) return
  emit('save', {
    name: form.value.name.trim(),
    iconImageId: form.value.iconImageId,
    mapImageId: form.value.mapImageId,
  })
}

function onHide() {
  emit('update:visible', false)
}

function previewInConsole() {
  nameError.value = !form.value.name.trim()
  if (nameError.value) return
  iconStore.startPreview({
    categoryId: props.category.id,
    name: form.value.name.trim(),
    iconImageId: form.value.iconImageId,
    mapImageId: form.value.mapImageId,
  })
  emit('update:visible', false)
  toast.add({
    severity: 'info',
    summary: 'Previewing icons',
    detail: 'Browse the console, then apply or discard the images from the bar at the bottom.',
    life: 5000,
  })
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    modal
    :style="{ width: '52rem', maxWidth: '95vw' }"
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
          placeholder="e.g. Router"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="image-pickers">
        <FormField class="image-picker-slot" label="Icon Image" group>
          <div class="picker-preview">
            <LibraryImage
              v-if="selectedIconImage"
              eager
              :guid="selectedIconImage.id"
              :alt="selectedIconImage.name"
              class="picker-preview-img"
            />
            <i v-else class="pi pi-image picker-preview-placeholder" />
          </div>
          <span v-if="selectedIconImage" class="picker-preview-name">
            {{ selectedIconImage.name }}
          </span>
          <div class="picker-preview-actions">
            <Button
              label="Choose from library..."
              icon="pi pi-images"
              text
              size="small"
              :disabled="saving"
              @click="openPicker('icon')"
            />
            <Button
              v-if="form.iconImageId"
              label="Clear"
              icon="pi pi-times"
              text
              size="small"
              severity="secondary"
              :disabled="saving"
              @click="form.iconImageId = null"
            />
          </div>
        </FormField>

        <FormField class="image-picker-slot" label="Map Image" group>
          <div class="picker-preview">
            <LibraryImage
              v-if="selectedMapImage"
              eager
              :guid="selectedMapImage.id"
              :alt="selectedMapImage.name"
              class="picker-preview-img"
            />
            <i v-else class="pi pi-map picker-preview-placeholder" />
          </div>
          <span v-if="selectedMapImage" class="picker-preview-name">
            {{ selectedMapImage.name }}
          </span>
          <div class="picker-preview-actions">
            <Button
              label="Choose from library..."
              icon="pi pi-images"
              text
              size="small"
              :disabled="saving"
              @click="openPicker('map')"
            />
            <Button
              v-if="form.mapImageId"
              label="Clear"
              icon="pi pi-times"
              text
              size="small"
              severity="secondary"
              :disabled="saving"
              @click="form.mapImageId = null"
            />
          </div>
        </FormField>
      </div>

      <ObjectIconPreview
        :category-id="category?.id ?? 0"
        :icon-image-id="form.iconImageId"
        :map-image-id="form.mapImageId"
        :sample-name="form.name"
        :can-preview-in-console="isEdit && !saving"
        @preview-in-console="previewInConsole"
      />
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

  <ImagePickerDialog
    v-model:visible="pickerVisible"
    :title="pickerTitle"
    :selected-id="pickerSelectedId"
    @select="onImageSelected"
  />
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

.image-pickers {
  display: flex;
  gap: 1.5rem;
}

.image-picker-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.image-picker-slot > label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.picker-preview {
  width: 96px;
  height: 96px;
  border: 2px dashed var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.picker-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.picker-preview-placeholder {
  font-size: 2rem;
  color: var(--p-text-muted-color);
}

.picker-preview-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 100%;
}

.picker-preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.125rem;
  margin-left: -0.5rem;
  margin-top: auto;
}
</style>
