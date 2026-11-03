import { computed, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getMibNode } from '@/api/mibApi'
import { STATIC_TIER } from './config'

export const mibKeys = {
  node: (oid) => ['mib', oid],
}

/**
 * '' is the synthetic root; null disables. Shares cache entries with useMibNode.
 * @param {import('vue').MaybeRefOrGetter<string|null>} oid
 */
export function useMibChildren(oid) {
  return useQuery({
    queryKey: computed(() => mibKeys.node(toValue(oid))),
    queryFn: () => getMibNode(toValue(oid) ?? ''),
    enabled: computed(() => toValue(oid) != null),
    select: (data) =>
      (data?.children ?? []).map((c) => ({
        oid: c.oid,
        name: c.name ?? c.oid,
        hasChildren: c.hasChildren,
      })),
    ...STATIC_TIER,
  })
}

/**
 * Disabled for null or ''.
 * @param {import('vue').MaybeRefOrGetter<string|null>} oid
 */
export function useMibNode(oid) {
  return useQuery({
    queryKey: computed(() => mibKeys.node(toValue(oid))),
    queryFn: () => getMibNode(toValue(oid)),
    enabled: computed(() => !!toValue(oid)),
    ...STATIC_TIER,
  })
}
