import { computed, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import * as findApi from '@/api/findApi'
import { MODERATE_TIER } from './config'

export const findKeys = {
  all: () => ['find'],
  macAddress: (macAddress) => ['find', 'mac-address', macAddress],
}

/**
 * Keyed on the submitted address: the server walks switch forwarding databases, far too
 * expensive per keystroke. No refetch on focus for the same reason.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} macAddress - normalized, or null for idle
 */
export function useMacAddressSearch(macAddress) {
  return useQuery({
    queryKey: computed(() => findKeys.macAddress(toValue(macAddress))),
    queryFn: () => findApi.findMacAddress({ macAddress: toValue(macAddress) }),
    enabled: computed(() => !!toValue(macAddress)),
    ...MODERATE_TIER,
    refetchOnWindowFocus: false,
  })
}
