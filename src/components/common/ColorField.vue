<script setup>
import { ref, computed } from 'vue'
import SelectButton from 'primevue/selectbutton'
import ColorPicker from 'primevue/colorpicker'
import FormField from '@/components/common/FormField.vue'

// Stored as '#rrggbb', or null for "Automatic" (server/theme default).
const props = defineProps({
  label: { type: String, default: null },
  modelValue: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue'])

const MODE_OPTIONS = [
  { label: 'Automatic', value: false },
  { label: 'Custom', value: true },
]

// So toggling back to Custom restores the last color instead of black.
const lastCustomColor = ref(props.modelValue ?? '#000000')

const isCustom = computed({
  get: () => props.modelValue != null,
  set: (custom) => emit('update:modelValue', custom ? lastCustomColor.value : null),
})

const pickerValue = computed({
  get: () => (props.modelValue ? props.modelValue.replace(/^#/, '') : null),
  set: (v) => {
    const hex = '#' + String(v).replace(/^#/, '')
    lastCustomColor.value = hex
    emit('update:modelValue', hex)
  },
})
</script>

<template>
  <FormField class="color-field" :label="`${label}`" group>
    <div class="color-field-row">
      <SelectButton
        v-model="isCustom"
        :options="MODE_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
      />
      <template v-if="isCustom">
        <ColorPicker v-model="pickerValue" />
        <span class="color-field-value">{{ modelValue }}</span>
      </template>
    </div>
  </FormField>
</template>

<style scoped>
.color-field {
  display: flex;
  /* This is FormField's root, so `.form-field`'s column direction would apply. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.color-field:last-child {
  border-bottom: none;
}

/* FormField renders the label, so it needs :deep. The width matches the `.wpd-label` column in
   the widget properties dialog. */
.color-field :deep(.form-field__label) {
  width: 11rem;
  flex-shrink: 0;
}

.color-field-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.color-field-value {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
