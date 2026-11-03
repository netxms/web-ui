import { computed, ref } from 'vue'
import { useActions } from '@/composables/useActions'
import { useObject } from '@/queries/useObjectQueries'

/**
 * Object context menu for a surface that only knows an object id (rack, chassis, map): the
 * action registry needs the full object, fetched on right-click.
 *
 * @param {string} viewContext
 * @returns {{
 *   objectId: import('vue').Ref<number|null>,
 *   object: import('vue').Ref<object|undefined>,
 *   buildItems: (options?: { label?: string, before?: object[], after?: object[] }) => object[],
 * }}
 */
export function useObjectActionMenu(viewContext) {
  const objectId = ref(null)
  const { data: object, isLoading } = useObject(objectId)

  const actionContext = computed(() =>
    object.value ? { object: object.value, viewContext } : null,
  )
  const { menuItems } = useActions(actionContext, { domains: ['object'] })

  /**
   * @param {object} [options]
   * @param {string} [options.label]
   * @param {object[]} [options.before]
   * @param {object[]} [options.after]
   */
  function buildItems({ label, before = [], after = [] } = {}) {
    const items = [{ label: label || 'Object', class: 'context-menu-header', disabled: true }]
    if (before.length) items.push({ separator: true }, ...before)
    if (objectId.value != null) {
      items.push({ separator: true })
      items.push(
        ...(isLoading.value
          ? [{ label: 'Loading...', icon: 'pi pi-spin pi-spinner', disabled: true }]
          : menuItems.value),
      )
    }
    if (after.length) items.push({ separator: true }, ...after)
    return items
  }

  return { objectId, object, buildItems }
}
