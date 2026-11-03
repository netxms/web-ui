<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import GeoAreaPickerDialog from './GeoAreaPickerDialog.vue'
import { useGeographicalAreas } from '@/queries/useGeographicalAreaQueries'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const pickerVisible = ref(false)

const { data: areas } = useGeographicalAreas()

const selectedAreas = computed(() => {
  const ids = props.modelValue ?? []
  if (!ids.length || !areas.value) return []
  return areas.value.filter((a) => ids.includes(a.id))
})

function clearAll() {
  emit('update:modelValue', [])
}
</script>

<template>
  <div class="geo-area-picker-btn">
    <div v-if="selectedAreas.length > 0" class="geo-area-picker-btn__preview">
      <i class="pi pi-map-marker geo-area-picker-btn__icon" />
      <span class="geo-area-picker-btn__label">
        {{ selectedAreas.length }}
        area{{ selectedAreas.length !== 1 ? 's' : '' }}
        selected
      </span>
      <Button
        aria-label="Choose area"
        icon="pi pi-pencil"
        size="small"
        text
        severity="secondary"
        class="geo-area-picker-btn__action"
        @click="pickerVisible = true"
      />
      <Button
        aria-label="Clear area"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        class="geo-area-picker-btn__action"
        @click="clearAll"
      />
    </div>
    <Button
      v-else
      label="Add areas"
      icon="pi pi-plus"
      size="small"
      outlined
      severity="secondary"
      @click="pickerVisible = true"
    />

    <GeoAreaPickerDialog
      v-model:visible="pickerVisible"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.geo-area-picker-btn__preview {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.25rem 0.25rem 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
}

.geo-area-picker-btn__icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.geo-area-picker-btn__label {
  font-size: 0.8125rem;
  flex: 1;
}

.geo-area-picker-btn__action {
  flex-shrink: 0;
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}
</style>
