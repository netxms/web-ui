<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, useId } from 'vue'

/**
 * Model: { text: string, tokens: Array<{ key: string, value: string|null }> }
 *
 * Filter definition:
 *   key:         string   -- canonical key used in tokens
 *   label:       string
 *   description: string   -- hint in the key-suggestion dropdown
 *   type:        'text' | 'enum' | 'boolean' | 'unary'
 *   options?:    string[] -- for type:'enum'
 *   prefixChar?: string   -- single-char shortcut (e.g. '#' converts to key:'id')
 */

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ text: '', tokens: [] }),
  },
  /** Omit for plain-text mode: a debounced text input emitting { text, tokens: [] }. */
  filterDefs: {
    type: Array,
    default: null,
  },
  placeholder: {
    type: String,
    default: 'Filter...',
  },
  debounce: {
    type: Number,
    default: 200,
  },
  /** 'small' for sidebar use. */
  size: {
    type: String,
    default: 'normal',
  },
})

const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const containerRef = ref(null)
const filterDropdownRef = ref(null)
const inputText = ref(props.modelValue?.text ?? '')
const isFocused = ref(false)
// null = key-selection mode; string = value-selection mode (the pending key)
const pendingKey = ref(null)
const activeIndex = ref(-1)
let debounceTimer = null

const tokens = computed(() => props.modelValue?.tokens ?? [])

const hasContent = computed(
  () => inputText.value.length > 0 || tokens.value.length > 0 || pendingKey.value !== null,
)

const pendingKeyDef = computed(() => {
  if (!pendingKey.value || !props.filterDefs) return null
  return props.filterDefs.find((d) => d.key === pendingKey.value) ?? null
})

const showKeyDropdown = computed(
  () =>
    isFocused.value &&
    props.filterDefs != null &&
    props.filterDefs.length > 0 &&
    pendingKey.value === null,
)

const showValueDropdown = computed(
  () => isFocused.value && pendingKey.value !== null && pendingKeyDef.value?.type === 'enum',
)

const filteredKeySuggestions = computed(() => {
  if (!props.filterDefs) return []
  const search = inputText.value.toLowerCase()
  if (!search) return props.filterDefs
  return props.filterDefs.filter((d) => {
    const label = (d.label ?? d.key).toLowerCase()
    return d.key.toLowerCase().includes(search) || label.includes(search)
  })
})

const filteredValueOptions = computed(() => {
  if (!pendingKeyDef.value?.options) return []
  const search = inputText.value.toLowerCase()
  if (!search) return pendingKeyDef.value.options
  return pendingKeyDef.value.options.filter((o) => o.toLowerCase().includes(search))
})

// Focus never leaves the input; suggestion rows are referenced through
// `aria-activedescendant`, so they keep `@mousedown.prevent` and are not buttons.
const uid = useId()
const listboxId = `${uid}-suggestions`
const headerId = `${uid}-suggestions-header`
const optionId = (index) => `${uid}-option-${index}`

/** The two dropdowns are mutually exclusive. */
const isListOpen = computed(
  () =>
    (showKeyDropdown.value && filteredKeySuggestions.value.length > 0) ||
    (showValueDropdown.value && filteredValueOptions.value.length > 0),
)

const activeOptionId = computed(() =>
  isListOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
)

watch([filteredKeySuggestions, filteredValueOptions, showKeyDropdown, showValueDropdown], () => {
  activeIndex.value = -1
})

watch(activeIndex, () => {
  nextTick(() => {
    const el = filterDropdownRef.value?.querySelector('.filter-suggestion.is-highlighted')
    el?.scrollIntoView({ block: 'nearest' })
  })
})

function focusInput() {
  inputRef.value?.focus()
}

function onFocus() {
  isFocused.value = true
}

function onBlur() {
  // Delay so a mousedown on a dropdown item lands first; skip if the input was re-focused
  // meanwhile (the search icon blurs and re-focuses it).
  setTimeout(() => {
    if (document.activeElement !== inputRef.value) {
      isFocused.value = false
    }
  }, 150)
}

function emitDebounced(text) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', { text, tokens: tokens.value, pendingToken: null })
  }, props.debounce)
}

function emitImmediate(text, newTokens, pendingToken = null) {
  clearTimeout(debounceTimer)
  emit('update:modelValue', {
    text: text ?? props.modelValue?.text ?? '',
    tokens: newTokens ?? tokens.value,
    pendingToken,
  })
}

function onInput() {
  const val = inputText.value

  // Value entry emits without debounce: filtering is in-memory, and Enter then creates the chip
  // with no visual jump.
  if (pendingKey.value !== null) {
    const pendingVal = inputText.value.trim()
    clearTimeout(debounceTimer)
    emit('update:modelValue', {
      text: props.modelValue?.text ?? '',
      tokens: tokens.value,
      pendingToken: pendingVal ? { key: pendingKey.value, value: pendingVal } : null,
    })
    return
  }

  if (!props.filterDefs) {
    emitDebounced(val)
    return
  }

  // Single-character prefix shortcuts (e.g. '#' for id, '@' for zone)
  if (val.length >= 1) {
    const prefixDef = props.filterDefs.find((d) => d.prefixChar && val.startsWith(d.prefixChar))
    if (prefixDef) {
      const rest = val.slice(prefixDef.prefixChar.length)
      if (prefixDef.type === 'boolean' || prefixDef.type === 'unary') {
        addToken(prefixDef.key, null)
        inputText.value = rest
      } else {
        pendingKey.value = prefixDef.key
        inputText.value = rest
      }
      return
    }
  }

  const colonIdx = val.indexOf(':')
  if (colonIdx > 0) {
    const keyPart = val.slice(0, colonIdx)
    const valuePart = val.slice(colonIdx + 1)
    const matchedDef = props.filterDefs.find(
      (d) =>
        d.key.toLowerCase() === keyPart.toLowerCase() ||
        (d.label ?? d.key).toLowerCase() === keyPart.toLowerCase(),
    )
    if (matchedDef) {
      if (matchedDef.type === 'boolean' || matchedDef.type === 'unary') {
        addToken(matchedDef.key, null)
        inputText.value = valuePart
      } else {
        pendingKey.value = matchedDef.key
        inputText.value = valuePart
        // The text before the colon was only key lookup text.
        emitImmediate('', tokens.value)
      }
      return
    }
  }

  emitDebounced(val)
}

function onKeydown(event) {
  const isShowingKey = showKeyDropdown.value && filteredKeySuggestions.value.length > 0
  const isShowingVal = showValueDropdown.value && filteredValueOptions.value.length > 0
  const isShowingAny = isShowingKey || isShowingVal

  const items = isShowingKey ? filteredKeySuggestions.value : filteredValueOptions.value

  switch (event.key) {
    case 'ArrowDown':
      if (isShowingAny) {
        event.preventDefault()
        activeIndex.value = Math.min(activeIndex.value + 1, items.length - 1)
      }
      break

    case 'ArrowUp':
      if (isShowingAny) {
        event.preventDefault()
        activeIndex.value = Math.max(activeIndex.value - 1, 0)
      }
      break

    case 'Tab':
    case 'Enter':
      if (isShowingAny && activeIndex.value >= 0) {
        event.preventDefault()
        if (isShowingKey) {
          selectKey(filteredKeySuggestions.value[activeIndex.value])
        } else {
          confirmValue(filteredValueOptions.value[activeIndex.value])
        }
      } else if (pendingKey.value !== null && inputText.value.trim()) {
        event.preventDefault()
        confirmValue(inputText.value.trim())
      }
      break

    case 'Escape':
      event.preventDefault()
      if (pendingKey.value !== null) {
        pendingKey.value = null
        inputText.value = ''
        emitImmediate(props.modelValue?.text ?? '', tokens.value, null)
      } else if (hasContent.value) {
        clearAll()
      }
      break

    case 'Backspace':
      if (!inputText.value) {
        if (pendingKey.value !== null) {
          pendingKey.value = null
          emitImmediate(props.modelValue?.text ?? '', tokens.value, null)
        } else if (tokens.value.length > 0) {
          removeToken(tokens.value[tokens.value.length - 1])
        }
      }
      break
  }
}

function selectKey(def) {
  if (def.type === 'boolean' || def.type === 'unary') {
    addToken(def.key, null)
    inputText.value = ''
    return
  }
  pendingKey.value = def.key
  inputText.value = ''
  activeIndex.value = -1
  // The text typed to find this key should no longer filter results.
  emitImmediate('', tokens.value)
  focusInput()
}

function confirmValue(value) {
  if (!pendingKey.value) return
  const val = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!val) return
  addToken(pendingKey.value, val)
  pendingKey.value = null
  inputText.value = ''
  activeIndex.value = -1
  focusInput()
}

function addToken(key, value) {
  emitImmediate(props.modelValue?.text ?? '', [...tokens.value, { key, value }])
}

function removeToken(token) {
  emitImmediate(
    props.modelValue?.text ?? '',
    tokens.value.filter((t) => t !== token),
  )
}

function clearAll() {
  inputText.value = ''
  pendingKey.value = null
  emitImmediate('', [])
  focusInput()
}

watch(
  () => props.modelValue?.text,
  (val) => {
    const newVal = val ?? ''
    if (newVal !== inputText.value) {
      inputText.value = newVal
    }
  },
)

function onDocumentMousedown(event) {
  if (containerRef.value && !containerRef.value.contains(event.target)) {
    isFocused.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentMousedown))
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div
    ref="containerRef"
    class="smart-filter"
    :class="[`smart-filter--${size}`, { 'is-focused': isFocused }]"
  >
    <!-- Click anywhere puts the caret in the input; the input itself is the tab stop. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -->
    <div class="filter-inner" @click="focusInput">
      <i class="pi pi-search filter-icon" />

      <span v-for="(token, i) in tokens" :key="i" class="filter-chip">
        <span class="chip-label">
          {{ token.value != null ? `${token.key}: ${token.value}` : token.key }}
        </span>
        <button
          type="button"
          class="chip-remove"
          :aria-label="`Remove filter ${token.key}`"
          @click.stop="removeToken(token)"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </span>

      <span v-if="pendingKey" class="filter-pending-key">{{ pendingKey }}:</span>

      <!-- `data-filter-input` is what the `/` shortcut looks for (useFilterShortcut). Its value
           says whether the filter narrows anything (it can be down to chips with the box empty),
           which keeps Escape a two-step: clear first, then hand the keyboard back. -->
      <input
        ref="inputRef"
        v-model="inputText"
        :data-filter-input="hasContent ? 'active' : ''"
        class="filter-text-input"
        :placeholder="
          tokens.length === 0 && !pendingKey ? placeholder : pendingKey ? 'type value...' : ''
        "
        :aria-label="placeholder"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="isListOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
        @input="onInput"
      />

      <button
        v-if="hasContent"
        class="filter-clear-btn"
        type="button"
        tabindex="-1"
        @click.stop="clearAll"
      >
        <i class="pi pi-times" />
      </button>
    </div>

    <div
      v-if="showKeyDropdown && filteredKeySuggestions.length > 0"
      :id="listboxId"
      ref="filterDropdownRef"
      class="filter-dropdown"
      role="listbox"
      :aria-labelledby="headerId"
    >
      <div :id="headerId" class="filter-dropdown-header" role="presentation">Available filters</div>
      <div
        v-for="(def, i) in filteredKeySuggestions"
        :id="optionId(i)"
        :key="def.key"
        class="filter-suggestion"
        :class="{ 'is-highlighted': i === activeIndex }"
        role="option"
        tabindex="-1"
        :aria-selected="i === activeIndex"
        @mousedown.prevent="selectKey(def)"
      >
        <span class="suggestion-key">
          {{ def.label ?? def.key }}{{ def.type !== 'boolean' && def.type !== 'unary' ? ':' : '' }}
        </span>
        <span v-if="def.description" class="suggestion-desc">{{ def.description }}</span>
      </div>
    </div>

    <div
      v-else-if="showValueDropdown && filteredValueOptions.length > 0"
      :id="listboxId"
      ref="filterDropdownRef"
      class="filter-dropdown"
      role="listbox"
      :aria-labelledby="headerId"
    >
      <div :id="headerId" class="filter-dropdown-header" role="presentation">
        {{ pendingKey }}
      </div>
      <div
        v-for="(opt, i) in filteredValueOptions"
        :id="optionId(i)"
        :key="opt"
        class="filter-suggestion"
        :class="{ 'is-highlighted': i === activeIndex }"
        role="option"
        tabindex="-1"
        :aria-selected="i === activeIndex"
        @mousedown.prevent="confirmValue(opt)"
      >
        <span class="suggestion-key">{{ opt }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-filter {
  position: relative;
  width: 100%;
}

.filter-inner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  min-height: 2.25rem;
  background: var(--p-inputtext-background, var(--p-surface-card));
  border: 1px solid var(--p-inputtext-border-color, var(--p-surface-border));
  border-radius: var(--p-inputtext-border-radius, var(--p-border-radius, 6px));
  cursor: text;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.smart-filter--small .filter-inner {
  padding: 0.25rem 0.375rem;
  min-height: 1.875rem;
}

.is-focused .filter-inner {
  border-color: var(--p-inputtext-focus-border-color, var(--p-primary-color));
  box-shadow: 0 0 0 var(--p-focus-ring-width, 1px) var(--p-focus-ring-color, var(--p-primary-color));
}

.filter-icon {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  flex-shrink: 0;
}

.smart-filter--small .filter-icon {
  font-size: 0.8125rem;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.25rem 0.125rem 0.5rem;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color, #fff);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  cursor: default;
}

.chip-label {
  line-height: 1;
}

.chip-remove {
  /* Undo the button chrome. */
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 0.1s;
}

.chip-remove:hover {
  opacity: 1;
}

.chip-remove .pi {
  font-size: 0.5625rem;
}

.filter-pending-key {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-primary-color);
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 0.125rem;
}

.smart-filter--small .filter-pending-key {
  font-size: 0.75rem;
}

.filter-text-input {
  flex: 1;
  min-width: 5rem;
  border: none;
  outline: none;
  background: transparent;
  color: var(--p-text-color);
  font-size: var(--p-inputtext-font-size, 1rem);
  font-family: inherit;
  padding: 0;
  line-height: 1.5;
}

.smart-filter--small .filter-text-input {
  font-size: 0.8125rem;
}

.filter-text-input::placeholder {
  color: var(--p-text-muted-color);
}

.filter-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  margin-left: auto;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition:
    color 0.1s,
    background 0.1s;
}

.filter-clear-btn:hover {
  color: var(--p-text-color);
  background: var(--p-surface-hover);
}

.filter-clear-btn .pi {
  font-size: 0.625rem;
  pointer-events: none;
}

.filter-dropdown {
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

.filter-dropdown-header {
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-surface-border);
}

.filter-suggestion {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}

.filter-suggestion:hover,
.filter-suggestion.is-highlighted {
  background: var(--p-surface-hover);
}

.suggestion-key {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.suggestion-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
