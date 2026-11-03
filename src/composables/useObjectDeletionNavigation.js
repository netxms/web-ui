import { onMounted, onUnmounted, toValue } from 'vue'
import { findDeletionSuccessor } from '@/utils/objectTreeNavigation'

/**
 * Moves selection to the neighbouring row after the open object is deleted. App.vue dispatches
 * a cancelable `object:deleted` and goes home only if no perspective claims it.
 *
 * @param {object} options
 * @param {import('vue').MaybeRefOrGetter<number|string|null>} options.currentId - open object
 * @param {import('vue').MaybeRefOrGetter<Array<{
 *   nodes: import('vue').MaybeRefOrGetter<Array<object>>,
 *   onSelect: (node: object, path: string) => void,
 *   onSelectRoot: () => void,
 * }>>} options.trees - trees as displayed (sorted + filtered), searched in order
 */
export function useObjectDeletionNavigation({ currentId, trees }) {
  function onObjectDeleted(event) {
    const openId = Number(toValue(currentId))
    if (!openId || Number.isNaN(openId)) return

    const deletedIds = new Set((event.detail?.objects ?? []).map((object) => Number(object.id)))
    if (!deletedIds.has(openId)) return

    for (const tree of toValue(trees) ?? []) {
      const result = findDeletionSuccessor(toValue(tree.nodes) ?? [], openId, deletedIds)
      if (!result) continue

      event.preventDefault()
      if (result.node) tree.onSelect(result.node, result.path.map((node) => node.id).join('-'))
      else tree.onSelectRoot()
      return
    }
  }

  onMounted(() => document.addEventListener('object:deleted', onObjectDeleted))
  onUnmounted(() => document.removeEventListener('object:deleted', onObjectDeleted))
}
