<script setup>
import { computed, watch } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '{}' },
  /** Any CSS length; the editor scrolls internally past it. */
  height: { type: String, default: '18rem' },
})

const emit = defineEmits(['update:modelValue', 'valid'])

const { themeExtensions } = useCodeMirrorTheme()

// JSON is a subset of JavaScript, so the JS mode highlights it without @codemirror/lang-json.
const cmExtensions = computed(() => [
  javascript(),
  ...themeExtensions.value,
  EditorView.lineWrapping,
])

/** Blank counts as valid (an empty object). */
const parsed = computed(() => {
  const text = (props.modelValue ?? '').trim()
  if (!text) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

const isValid = computed(() => parsed.value.ok)
const parseError = computed(() => (parsed.value.ok ? null : parsed.value.error))

watch(isValid, (valid) => emit('valid', valid), { immediate: true })

function onInput(value) {
  emit('update:modelValue', value)
}

/** No-op while the text does not parse. */
function format() {
  if (!parsed.value.ok) return false
  emit('update:modelValue', JSON.stringify(parsed.value.value, null, 2))
  return true
}

defineExpose({ format, isValid, parseError })
</script>

<template>
  <div class="json-editor">
    <Codemirror
      :model-value="modelValue"
      :extensions="cmExtensions"
      :tab-size="2"
      :placeholder="placeholder"
      :style="{ height }"
      class="cm-wrapper"
      :class="{ 'cm-wrapper--invalid': !isValid }"
      @update:model-value="onInput"
    />
    <small v-if="parseError" class="json-error">
      <i class="pi pi-exclamation-circle" />
      {{ parseError }}
    </small>
  </div>
</template>

<style scoped>
.json-editor {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  min-width: 0;
}

.cm-wrapper {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
}

.cm-wrapper--invalid {
  border-color: var(--p-red-500);
}

.cm-wrapper :deep(.v-codemirror) {
  height: 100%;
}

.cm-wrapper :deep(.cm-editor) {
  height: 100%;
  font-size: 0.8125rem;
}

.cm-wrapper :deep(.cm-scroller) {
  font-family: var(--font-mono);
}

.json-error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-red-500);
}
</style>
