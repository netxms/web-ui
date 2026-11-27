import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { getMibNode } from '@/api/mibApi'
import { createMibNameResolver } from '@/utils/mibNames'
import { normalizeOid, oidError } from '@/utils/snmpOid'
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

/**
 * Resolves walked OIDs to MIB names through the same cache entries as the tree, so a subtree
 * already expanded in the browser costs no requests. Call in setup.
 */
export function useMibNameResolver() {
  const queryClient = useQueryClient()
  return createMibNameResolver((oid) =>
    queryClient.fetchQuery({
      queryKey: mibKeys.node(oid),
      queryFn: () => getMibNode(oid),
      ...STATIC_TIER,
    }),
  )
}

/**
 * OID of the deepest MIB object a typed OID falls under, as legacy's lenient lookup selects it
 * while an OID is typed: `ifInOctets` for `1.3.6.1.2.1.2.2.1.10.3`. Follows the text after a
 * pause; null while it is not an OID or not even its first element is in the MIBs. Call in setup.
 *
 * @param {import('vue').MaybeRefOrGetter<string>} text
 * @param {{ delay?: number }} [options] - ms
 */
export function useClosestMibObject(text, { delay = 250 } = {}) {
  const resolver = useMibNameResolver()
  const closest = ref(null)
  let run = 0
  let timer = null

  watch(
    () => toValue(text),
    (value) => {
      clearTimeout(timer)
      const current = ++run
      if (oidError(value ?? '')) {
        closest.value = null
        return
      }
      timer = setTimeout(async () => {
        const match = await resolver.resolve(normalizeOid(value))
        if (current === run) closest.value = match?.objectOid ?? null
      }, delay)
    },
    { immediate: true },
  )

  onScopeDispose(() => clearTimeout(timer))

  return closest
}
