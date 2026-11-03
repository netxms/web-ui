import { ref, computed, watch, toValue } from 'vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'

/**
 * Mirrors the legacy client's collectInheritedAccessRights: entries come from each ancestor's
 * direct access list; the walk continues upward only while that ancestor inherits. First
 * occurrence per userId wins (breadth-first).
 *
 * @param {object|null} object - adapted object
 * @param {(id: number) => object|undefined} resolveObject - undefined while still loading
 * @returns {{ ids: number[], entries: Array<{ userId, access, inherited, sourceObjectId, sourceObjectName }> }}
 *   ids = every ancestor the walk wants fetched, entries = from the ancestors resolved so far
 */
export function collectInheritedAccessEntries(object, resolveObject) {
  const ids = []
  const entries = []
  if (!object) return { ids, entries }

  const visited = new Set([object.id])
  const seenUsers = new Set()
  const queue = [...(object.parents ?? [])]

  while (queue.length > 0) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    ids.push(id)

    const parent = resolveObject(id)
    if (!parent) continue

    for (const e of parent.accessList ?? []) {
      if (seenUsers.has(e.userId)) continue
      seenUsers.add(e.userId)
      entries.push({
        userId: e.userId,
        access: e.access,
        inherited: true,
        sourceObjectId: id,
        sourceObjectName: parent.name,
      })
    }

    if (parent.inheritAccessRights) queue.push(...(parent.parents ?? []))
  }

  return { ids, entries }
}

/**
 * Expands the walk as parents resolve.
 *
 * @param {import('vue').MaybeRefOrGetter<object|null>} object
 * @param {import('vue').MaybeRefOrGetter<boolean>} inheritEnabled
 * @returns {{ inheritedEntries: import('vue').ComputedRef<Array> }}
 */
export function useInheritedAccessRights(object, inheritEnabled) {
  const idsToFetch = ref([])
  const { objectsById } = useObjectsByIds(idsToFetch)

  const walk = computed(() => {
    if (!toValue(inheritEnabled)) return { ids: [], entries: [] }
    return collectInheritedAccessEntries(toValue(object), (id) => objectsById.value.get(id))
  })

  watch(
    () => walk.value.ids,
    (ids) => {
      if (JSON.stringify(ids) !== JSON.stringify(idsToFetch.value)) idsToFetch.value = ids
    },
    { immediate: true },
  )

  const inheritedEntries = computed(() => walk.value.entries)

  return { inheritedEntries }
}
