import { ref, shallowRef } from 'vue'
import { useActions } from '@/composables/useActions'

/**
 * @param {object} [options]
 * @param {string[]} [options.domains]
 * @param {number} [options.maxPrimary] - max primary actions for the action bar
 */
export function useContextMenu(options = {}) {
  const contextRef = ref(null)
  const menuRef = shallowRef(null)

  const { menuItems, primaryActions } = useActions(contextRef, options)

  /**
   * @param {Event} event
   * @param {object} context - ActionContext ({ object, viewContext, selection? })
   */
  function show(event, context) {
    contextRef.value = context
    menuRef.value?.show(event)
  }

  function hide() {
    menuRef.value?.hide()
  }

  return {
    menuRef,
    menuItems,
    primaryActions,
    contextRef,
    show,
    hide,
  }
}
