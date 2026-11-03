<script setup>
import { ref, computed, watch } from 'vue'
import ColorPicker from 'primevue/colorpicker'
import InputText from 'primevue/inputtext'

// Always a concrete '#rrggbb' (no "automatic" mode; use ColorField for that).
const props = defineProps({
  modelValue: { type: String, default: '#000000' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const HEX_RE = /^#?[0-9a-f]{6}$/i

function normalize(hex) {
  return (
    '#' +
    String(hex ?? '')
      .replace(/^#/, '')
      .toLowerCase()
  )
}

// PrimeVue ColorPicker works with the hex digits only (no leading '#').
const swatch = computed({
  get: () => String(props.modelValue ?? '').replace(/^#/, '') || '000000',
  set: (v) => emit('update:modelValue', normalize(v)),
})

// Local text state so partial/invalid typing doesn't fight the model.
const text = ref(props.modelValue ?? '')
watch(
  () => props.modelValue,
  (v) => {
    text.value = v ?? ''
  },
)

function onTextInput(value) {
  text.value = value
  if (HEX_RE.test(value.trim())) emit('update:modelValue', normalize(value.trim()))
}

function onTextBlur() {
  // Snap back to the last valid color if the field was left half-typed.
  if (!HEX_RE.test(text.value.trim())) text.value = props.modelValue ?? ''
}
</script>

<template>
  <div class="color-picker-field" :class="{ disabled }">
    <ColorPicker v-model="swatch" format="hex" :disabled="disabled" class="color-picker-swatch" />
    <InputText
      :model-value="text"
      :disabled="disabled"
      unstyled
      class="color-picker-hex"
      spellcheck="false"
      @update:model-value="onTextInput"
      @blur="onTextBlur"
    />
  </div>
</template>

<style scoped>
.color-picker-field {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem 0.125rem 0.125rem;
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius);
  background: var(--p-inputtext-background);
  transition: border-color 0.15s;
}

.color-picker-field:focus-within {
  border-color: var(--p-inputtext-focus-border-color);
}

.color-picker-field.disabled {
  opacity: 0.55;
  background: var(--p-inputtext-disabled-background, var(--p-surface-ground));
}

.color-picker-swatch :deep(.p-colorpicker-preview) {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: calc(var(--p-inputtext-border-radius) - 2px);
  border: 1px solid var(--p-surface-border);
  cursor: pointer;
}

.color-picker-field.disabled .color-picker-swatch :deep(.p-colorpicker-preview) {
  cursor: not-allowed;
}

.color-picker-hex {
  width: 5.5rem;
  border: none;
  background: transparent;
  color: var(--p-text-color);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  outline: none;
}

.color-picker-hex:disabled {
  cursor: not-allowed;
}
</style>
