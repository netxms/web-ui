import { ref, computed, watch, nextTick, isRef, useId } from 'vue'

/**
 * Macro autocomplete in text inputs/textareas, triggered by '%'.
 *
 * @param {import('vue').Ref<HTMLInputElement|HTMLTextAreaElement|null>} inputRef
 * @param {import('vue').Ref<import('@/utils/macroDefinitions').MacroDef[]>|import('@/utils/macroDefinitions').MacroDef[]} macros
 * @param {(newValue: string) => void} emitUpdate
 */
export function useMacroAutocomplete(inputRef, macros, emitUpdate) {
  const showDropdown = ref(false)
  const activeIndex = ref(-1)
  const partialText = ref('')
  const dropdownRef = ref(null)

  const macroArray = computed(() => (isRef(macros) ? macros.value : macros))

  const filteredMacros = computed(() => {
    if (!showDropdown.value) return []
    const search = partialText.value.toLowerCase()
    if (!search) return macroArray.value
    return macroArray.value.filter(
      (m) =>
        m.trigger.toLowerCase().includes(search) || m.description.toLowerCase().includes(search),
    )
  })

  watch(activeIndex, () => {
    nextTick(() => {
      const el = dropdownRef.value?.querySelector('.macro-suggestion.is-highlighted')
      el?.scrollIntoView({ block: 'nearest' })
    })
  })

  /**
   * Stops at whitespace: macros are single tokens.
   * @returns {{ start: number, partial: string }|null}
   */
  function findMacroContext() {
    const el = inputRef.value
    if (!el) return null
    const cursor = el.selectionStart ?? 0
    const text = el.value
    let i = cursor - 1
    while (i >= 0) {
      if (text[i] === '%') {
        return { start: i, partial: text.slice(i + 1, cursor) }
      }
      if (/\s/.test(text[i])) break
      i--
    }
    return null
  }

  function onInput() {
    const ctx = findMacroContext()
    if (ctx !== null) {
      partialText.value = ctx.partial
      showDropdown.value = true
    } else {
      showDropdown.value = false
      partialText.value = ''
      activeIndex.value = -1
    }
  }

  function onKeydown(event) {
    if (!showDropdown.value || filteredMacros.value.length === 0) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        activeIndex.value = Math.min(activeIndex.value + 1, filteredMacros.value.length - 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        activeIndex.value = Math.max(activeIndex.value - 1, 0)
        break
      case 'Enter':
        if (activeIndex.value >= 0) {
          event.preventDefault()
          selectMacro(filteredMacros.value[activeIndex.value])
        }
        break
      case 'Escape':
        event.preventDefault()
        closeDropdown()
        break
    }
  }

  async function selectMacro(macro) {
    const el = inputRef.value
    if (!el) return
    const ctx = findMacroContext()
    if (ctx === null) return
    const cursor = el.selectionStart ?? 0
    const before = el.value.slice(0, ctx.start)
    const after = el.value.slice(cursor)
    const newValue = before + macro.trigger + after
    const newCursor = before.length + macro.trigger.length

    emitUpdate(newValue)

    // Wait for parent to update the DOM element's value before repositioning cursor
    await nextTick()
    el.focus()
    el.setSelectionRange(newCursor, newCursor)
    closeDropdown()
  }

  function closeDropdown() {
    showDropdown.value = false
    partialText.value = ''
    activeIndex.value = -1
  }

  function openDropdown() {
    partialText.value = ''
    activeIndex.value = -1
    showDropdown.value = true
  }

  // Focus stays in the field; rows are pointed at by `aria-activedescendant`, which is why they
  // keep `@mousedown.prevent` and never become buttons. The rows' own ARIA stays in the
  // template, where the a11y linter can see it.
  const uid = useId()
  const listboxId = `${uid}-macros`
  const optionId = (index) => `${uid}-macro-${index}`

  const isListOpen = computed(() => showDropdown.value && filteredMacros.value.length > 0)

  const comboboxBindings = computed(() => ({
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    'aria-expanded': isListOpen.value,
    'aria-controls': listboxId,
    'aria-activedescendant':
      isListOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
  }))

  const listboxBindings = { id: listboxId, role: 'listbox', 'aria-label': 'Macro suggestions' }

  return {
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
  }
}
