<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import CategoryPickerDialog from './CategoryPickerDialog.vue'
import { useObjectCategories } from '@/queries/useObjectCategoryQueries'
import { useImageLibraryItem } from '@/queries/useImageLibraryQueries'

const props = defineProps({
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

const { data: categories } = useObjectCategories()

const selectedCategory = computed(() => {
  if (!props.modelValue || !categories.value) return null
  return categories.value.find((c) => c.id === props.modelValue) ?? null
})

const iconId = computed(() => selectedCategory.value?.iconImageId ?? null)
const { data: iconImage } = useImageLibraryItem(iconId)

function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="category-picker-btn">
    <div v-if="selectedCategory" class="category-picker-btn__preview">
      <div class="category-picker-btn__thumb-frame">
        <img
          v-if="iconImage?.dataUrl"
          :src="iconImage.dataUrl"
          :alt="iconImage.name"
          class="category-picker-btn__thumb"
        />
        <i v-else class="pi pi-tag category-picker-btn__thumb-icon" />
      </div>
      <span class="category-picker-btn__name">{{ selectedCategory.name }}</span>
      <Button
        aria-label="Choose category"
        icon="pi pi-pencil"
        size="small"
        text
        severity="secondary"
        class="category-picker-btn__action"
        @click="pickerVisible = true"
      />
      <Button
        aria-label="Clear category"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        class="category-picker-btn__action"
        @click="clear"
      />
    </div>
    <Button
      v-else
      label="Select category"
      icon="pi pi-tag"
      size="small"
      outlined
      severity="secondary"
      @click="pickerVisible = true"
    />

    <CategoryPickerDialog
      v-model:visible="pickerVisible"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.category-picker-btn__preview {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.25rem 0.25rem 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
}

.category-picker-btn__thumb-frame {
  width: 28px;
  height: 28px;
  border-radius: 3px;
  background: var(--p-surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.category-picker-btn__thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.category-picker-btn__thumb-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.category-picker-btn__name {
  font-size: 0.8125rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-picker-btn__action {
  flex-shrink: 0;
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}
</style>
