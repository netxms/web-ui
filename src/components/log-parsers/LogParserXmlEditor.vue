<script setup>
import { computed } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView } from '@codemirror/view'
import { xml } from '@codemirror/lang-xml'
import Skeleton from 'primevue/skeleton'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'

defineProps({
  modelValue: { type: String, required: true },
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { themeExtensions } = useCodeMirrorTheme()

const cmExtensions = computed(() => [xml(), ...themeExtensions.value, EditorView.lineWrapping])
</script>

<template>
  <div class="xml-editor">
    <div v-if="isLoading" class="xml-skeleton">
      <Skeleton v-for="i in 12" :key="i" height="1rem" class="skeleton-line" />
    </div>
    <Codemirror
      v-else
      :model-value="modelValue"
      :extensions="cmExtensions"
      :tab-size="2"
      placeholder="<parser>...</parser>"
      class="cm-wrapper"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.xml-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.xml-skeleton {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.skeleton-line {
  border-radius: 3px;
}

.cm-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
</style>
