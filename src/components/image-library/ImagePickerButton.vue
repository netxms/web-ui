<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import ImagePickerDialog from './ImagePickerDialog.vue'
import { useImageLibraryItem } from '@/queries/useImageLibraryQueries'

const props = defineProps({
  modelValue: { type: String, default: null },
  label: { type: String, default: 'Select image' },
  /** Forwarded to the picker dialog. */
  sizeFilter: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

const selectedId = computed(() => props.modelValue ?? null)
const { data: selectedImage } = useImageLibraryItem(selectedId)

function onSelect(guid) {
  emit('update:modelValue', guid)
}

function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="image-picker-btn">
    <div v-if="selectedImage" class="image-picker-btn__preview">
      <img
        v-if="selectedImage.dataUrl"
        :src="selectedImage.dataUrl"
        :alt="selectedImage.name"
        class="image-picker-btn__thumb"
      />
      <span class="image-picker-btn__name">{{ selectedImage.name }}</span>
      <Button
        aria-label="Clear image"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        class="image-picker-btn__clear"
        @click="clear"
      />
    </div>
    <button type="button" v-else class="image-picker-btn__empty" @click="pickerVisible = true">
      <i class="pi pi-image image-picker-btn__icon" />
      <span class="image-picker-btn__placeholder">{{ label }}</span>
      <i class="pi pi-chevron-down image-picker-btn__chevron" />
    </button>

    <ImagePickerDialog
      v-model:visible="pickerVisible"
      :size-filter="sizeFilter"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
.image-picker-btn__preview,
.image-picker-btn__empty {
  /* Undo the button chrome. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  min-height: 2.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
}

.image-picker-btn__empty {
  cursor: pointer;
}

.image-picker-btn__empty:hover {
  border-color: var(--p-primary-color);
}

.image-picker-btn__icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.image-picker-btn__placeholder {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-picker-btn__chevron {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.image-picker-btn__thumb {
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
  border-radius: 2px;
}

.image-picker-btn__name {
  font-size: 0.8125rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-picker-btn__clear {
  flex-shrink: 0;
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}
</style>
