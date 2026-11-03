import { onMounted, onUnmounted, toValue } from 'vue'

/**
 * Binds the keyboard shortcuts declared on resolved actions, so the label the context menu
 * shows is the binding that exists.
 *
 * Object-scoped shortcuts (`F2`) apply anywhere in `outerRef`, because focus moves
 * into the view when an object is opened; row-scoped ones (`Del`, `Enter`) only with focus in
 * `containerRef`, or `Del` would delete the selected object from inside a DCI table.
 *
 * @param {import('vue').Ref<Array>|(() => Array)} menuItems - the items the context menu renders
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.containerRef
 * @param {import('vue').Ref<HTMLElement|null>} [options.outerRef] - the perspective root
 * @param {string[]} [options.rowScopedShortcuts] - labels confined to `containerRef`
 */
export function useActionShortcuts(menuItems, options = {}) {
  const { containerRef, outerRef, rowScopedShortcuts = [] } = options

  function isWithin(ref, event) {
    const container = ref?.value
    if (!container) return false
    return container.contains(event.target) || container.contains(document.activeElement)
  }

  function isInScope(event, shortcut) {
    if (isWithin(containerRef, event)) return true
    if (rowScopedShortcuts.includes(shortcut)) return false
    return isWithin(outerRef, event)
  }

  function handleKeydown(event) {
    if (isTypingTarget(event.target)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const shortcut = normalizeKey(event)
    if (!shortcut) return
    if (!isInScope(event, shortcut)) return

    const action = findByShortcut(toValue(menuItems) ?? [], shortcut)
    if (!action || action.disabled) return

    event.preventDefault()
    action.command?.({ originalEvent: event, item: action })
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
}

/** Maps a keyboard event to the shortcut labels used in the action registry. */
export function shortcutForEvent(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  return normalizeKey(event)
}

function normalizeKey(event) {
  switch (event.key) {
    case 'F2':
      return 'F2'
    case 'Delete':
      return 'Del'
    case 'Enter':
      return 'Enter'
    default:
      return null
  }
}

/** Shortcuts are only honoured at the top level; submenu children are not scanned. */
export function findByShortcut(items, shortcut) {
  return items.find((item) => !item.separator && item.shortcut === shortcut)
}

/** contentEditable covers the inline editors (comments, script editor). */
export function isTypingTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
