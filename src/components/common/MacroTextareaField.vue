<script setup>
import { ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import { useMacroAutocomplete } from '@/composables/useMacroAutocomplete'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  /** MacroDef objects to offer as suggestions. */
  macros: {
    type: Array,
    default: () => [],
  },
  id: {
    type: String,
    default: undefined,
  },
  placeholder: {
    type: String,
    default: undefined,
  },
  rows: {
    type: Number,
    default: 4,
  },
})

const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const suggestionsEnabled = ref(true)

const {
  showDropdown,
  filteredMacros,
  activeIndex,
  dropdownRef,
  onInput,
  onKeydown,
  selectMacro,
  closeDropdown,
  openDropdown,
  comboboxBindings,
  listboxBindings,
  optionId,
} = useMacroAutocomplete(
  inputRef,
  computed(() => props.macros),
  (val) => emit('update:modelValue', val),
)

watch(
  () => props.modelValue,
  (val) => {
    const el = inputRef.value
    if (el && el.value !== val) {
      el.value = val
    }
  },
)

function onBlur() {
  setTimeout(() => {
    if (document.activeElement !== inputRef.value) {
      closeDropdown()
    }
  }, 150)
}

function onNativeInput() {
  emit('update:modelValue', inputRef.value?.value ?? '')
  if (suggestionsEnabled.value) onInput()
}

function onTriggerClick() {
  suggestionsEnabled.value = !suggestionsEnabled.value
  if (suggestionsEnabled.value) {
    openDropdown()
    inputRef.value?.focus()
  } else {
    closeDropdown()
  }
}
</script>

<template>
  <div class="macro-textarea-field" v-bind="$attrs">
    <div class="editor-container">
      <textarea
        ref="inputRef"
        :id="id"
        :value="modelValue"
        :placeholder="placeholder"
        :rows="rows"
        class="macro-textarea"
        autocomplete="off"
        spellcheck="false"
        v-bind="comboboxBindings"
        @input="onNativeInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />

      <div class="editor-overlay">
        <div class="editor-toolbar">
          <div class="toolbar-buttons">
            <Button
              label="%"
              size="small"
              severity="secondary"
              text
              rounded
              :class="{ 'btn-active': showDropdown, 'btn-suppressed': !suggestionsEnabled }"
              v-tooltip.bottom="
                suggestionsEnabled
                  ? 'Macro suggestions on (click to disable)'
                  : 'Macro suggestions off (click to enable)'
              "
              @mousedown.prevent="onTriggerClick"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showDropdown && filteredMacros.length > 0"
      ref="dropdownRef"
      class="macro-dropdown"
      v-bind="listboxBindings"
    >
      <template v-for="(macro, i) in filteredMacros" :key="macro.trigger">
        <div
          v-if="i === 0 || macro.group !== filteredMacros[i - 1].group"
          class="macro-dropdown-header"
          role="presentation"
        >
          {{ macro.group ?? 'Macros' }}
        </div>
        <div
          class="macro-suggestion"
          :class="{ 'is-highlighted': i === activeIndex }"
          role="option"
          tabindex="-1"
          :id="optionId(i)"
          :aria-selected="i === activeIndex"
          @mousedown.prevent="selectMacro(macro)"
        >
          <span class="macro-suggestion-key">{{ macro.label }}</span>
          <span v-if="macro.description" class="macro-suggestion-desc">{{
            macro.description
          }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.macro-textarea-field {
  position: relative;
  width: 100%;
}

.editor-container {
  position: relative;
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius, 6px);
  overflow: hidden;
  transition:
    border-color var(--p-inputtext-transition-duration, 0.2s),
    box-shadow var(--p-inputtext-transition-duration, 0.2s);
}

.editor-container:hover {
  border-color: var(--p-inputtext-hover-border-color, var(--p-primary-color));
}

.editor-container:focus-within {
  border-color: var(--p-inputtext-focus-border-color, var(--p-primary-color));
  box-shadow:
    var(--p-inputtext-focus-ring-shadow, 0 0 0 1px var(--p-primary-color)),
    var(--p-inputtext-shadow, none);
}

/* No own border: the container provides it */
.macro-textarea {
  width: 100%;
  border: none;
  outline: none;
  border-radius: 0;
  background: var(--p-inputtext-background, var(--p-surface-card));
  color: var(--p-inputtext-color, var(--p-text-color));
  font-family: inherit;
  font-size: var(--p-inputtext-font-size, 1rem);
  padding: 0.5rem 0.75rem 0.5rem;
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
  display: block;
}

.macro-textarea::placeholder {
  color: var(--p-inputtext-placeholder-color, var(--p-text-muted-color));
}

/* Passes clicks through in transparent areas */
.editor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

.editor-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0.375rem;
}

/* Same as NxslScriptEditor */
.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.125rem;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--p-surface-900) 12%, transparent);
  pointer-events: auto;
}

.btn-active {
  color: var(--p-primary-color) !important;
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent) !important;
}

.btn-suppressed {
  opacity: 0.4;
}

/* Same visual language as MacroInputField */
.macro-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--p-surface-overlay, var(--p-surface-card));
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius, 6px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  max-height: 16rem;
  overflow-y: auto;
}

.macro-dropdown-header {
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-surface-border);
}

.macro-suggestion {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}

.macro-suggestion:hover,
.macro-suggestion.is-highlighted {
  background: var(--p-surface-hover);
}

.macro-suggestion-key {
  font-size: 0.8125rem;
  font-weight: 500;
  font-family: var(--font-mono);
  color: var(--p-text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.macro-suggestion-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
