<script setup>
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
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
  multiline: {
    type: Boolean,
    default: false,
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
    default: 3,
  },
  /** Matches PrimeVue input sizing; only 'small' differs from the default. */
  size: {
    type: String,
    default: undefined,
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

// Teleported and positioned from the input's viewport rect, so it never adds to an
// ancestor's scroll height (a dialog body would grow a scrollbar).
const dropdownStyle = ref({})

const DROPDOWN_MIN_WIDTH = 288
const DROPDOWN_MAX_HEIGHT = 256 // keep in sync with .macro-dropdown max-height
const VIEWPORT_MARGIN = 8

function updateDropdownPosition() {
  const el = inputRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = Math.min(
    Math.max(rect.width, DROPDOWN_MIN_WIDTH),
    window.innerWidth - VIEWPORT_MARGIN * 2,
  )
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
  )
  // Flip above the field when there is not enough room below it
  const spaceBelow = window.innerHeight - rect.bottom
  const flipUp = spaceBelow < DROPDOWN_MAX_HEIGHT && rect.top > spaceBelow

  dropdownStyle.value = flipUp
    ? {
        left: `${left}px`,
        width: `${width}px`,
        bottom: `${window.innerHeight - rect.top + 2}px`,
        maxHeight: `${Math.min(DROPDOWN_MAX_HEIGHT, rect.top - VIEWPORT_MARGIN)}px`,
      }
    : {
        left: `${left}px`,
        width: `${width}px`,
        top: `${rect.bottom + 2}px`,
        maxHeight: `${Math.min(DROPDOWN_MAX_HEIGHT, spaceBelow - VIEWPORT_MARGIN)}px`,
      }
}

// Capturing scroll listener, so scrolling any ancestor repositions the dropdown.
watch(showDropdown, (open) => {
  if (open) {
    nextTick(updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)
  } else {
    window.removeEventListener('scroll', updateDropdownPosition, true)
    window.removeEventListener('resize', updateDropdownPosition)
  }
})

// Filtering changes the height, which can change the flip decision
watch(filteredMacros, () => {
  if (showDropdown.value) nextTick(updateDropdownPosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateDropdownPosition, true)
  window.removeEventListener('resize', updateDropdownPosition)
})

function onBlur() {
  // Delay so mousedown on a dropdown item or the trigger button fires before we close
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
  <div class="macro-field" v-bind="$attrs">
    <textarea
      v-if="multiline"
      ref="inputRef"
      :id="id"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      class="macro-native macro-native--textarea"
      :class="{ 'macro-native--sm': size === 'small' }"
      autocomplete="off"
      spellcheck="false"
      v-bind="comboboxBindings"
      @input="onNativeInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <input
      v-else
      ref="inputRef"
      :id="id"
      :value="modelValue"
      :placeholder="placeholder"
      type="text"
      class="macro-native"
      :class="{ 'macro-native--sm': size === 'small' }"
      autocomplete="off"
      spellcheck="false"
      v-bind="comboboxBindings"
      @input="onNativeInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />

    <button
      class="macro-trigger-btn"
      :class="{
        'is-active': showDropdown,
        'is-top': multiline,
        'is-suppressed': !suggestionsEnabled,
      }"
      type="button"
      tabindex="-1"
      v-tooltip.top="
        suggestionsEnabled
          ? 'Macro suggestions on (click to disable)'
          : 'Macro suggestions off (click to enable)'
      "
      @mousedown.prevent="onTriggerClick"
    >
      %
    </button>

    <Teleport to="body">
      <div
        v-if="showDropdown && filteredMacros.length > 0"
        ref="dropdownRef"
        class="macro-dropdown"
        :style="dropdownStyle"
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
    </Teleport>
  </div>
</template>

<style scoped>
.macro-field {
  position: relative;
  width: 100%;
}

.macro-native {
  width: 100%;
  font-family: inherit;
  font-size: var(--p-inputtext-font-size, 1rem);
  color: var(--p-inputtext-color, var(--p-text-color));
  background: var(--p-inputtext-background, var(--p-surface-card));
  padding-block: var(--p-inputtext-padding-y, 0.5rem);
  padding-left: var(--p-inputtext-padding-x, 0.75rem);
  padding-right: 2.25rem; /* room for the % trigger button */
  border: 1px solid var(--p-inputtext-border-color, var(--p-surface-border));
  border-radius: var(--p-inputtext-border-radius, var(--p-border-radius, 6px));
  box-shadow: var(--p-inputtext-shadow, none);
  outline: none;
  appearance: none;
  box-sizing: border-box;
  transition:
    background var(--p-inputtext-transition-duration, 0.2s),
    border-color var(--p-inputtext-transition-duration, 0.2s),
    box-shadow var(--p-inputtext-transition-duration, 0.2s);
}

.macro-native:hover {
  border-color: var(--p-inputtext-hover-border-color, var(--p-primary-color));
}

.macro-native:focus {
  border-color: var(--p-inputtext-focus-border-color, var(--p-primary-color));
  box-shadow:
    var(--p-inputtext-focus-ring-shadow, 0 0 0 1px var(--p-primary-color)),
    var(--p-inputtext-shadow, none);
  outline: none;
}

.macro-native::placeholder {
  color: var(--p-inputtext-placeholder-color, var(--p-text-muted-color));
}

/* In a disabled fieldset: a read-only form has to look like one. */
.macro-native:disabled {
  background: var(--p-inputtext-disabled-background);
  color: var(--p-inputtext-disabled-color);
}

.macro-trigger-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.macro-native--textarea {
  resize: vertical;
  line-height: 1.5;
}

.macro-native--sm {
  font-size: var(--p-inputtext-sm-font-size, 0.875rem);
  padding-block: var(--p-inputtext-sm-padding-y, 0.375rem);
  padding-left: var(--p-inputtext-sm-padding-x, 0.625rem);
}

.macro-trigger-btn {
  position: absolute;
  right: 0rem;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 100%;
  padding: 0;
  border: none;
  border-left: 1px solid var(--p-surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 1.2rem;
  font-weight: 500;
  font-family: var(--font-mono);
  cursor: pointer;
  line-height: 1;
  transition:
    color 0.1s,
    border-color 0.1s,
    background 0.1s;
}

/* For textarea, anchor to top instead of vertically centered */
.macro-trigger-btn.is-top {
  top: 0.4rem;
  transform: none;
}

.macro-trigger-btn:hover,
.macro-trigger-btn.is-active {
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
}

.macro-trigger-btn.is-suppressed {
  opacity: 0.35;
}

.macro-trigger-btn.is-suppressed:hover {
  opacity: 0.7;
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
}

/* Fixed and teleported; position and size come from inline styles. */
.macro-dropdown {
  position: fixed;
  /* above the PrimeVue modal layer (base z-index 1100) */
  z-index: 1300;
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
