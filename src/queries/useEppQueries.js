import { computed, unref } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as eppApi from '@/api/eppApi'
import { buildCallGraph } from '@/utils/eppChains'
import { MODERATE_TIER } from './config'

export const eppKeys = {
  all: () => ['epp'],
  chains: () => ['epp', 'chains'],
  chain: (chainId) => ['epp', 'chain', chainId],
  callers: (chainId) => ['epp', 'chain', chainId, 'callers'],
}

/** Every chain without its rules, with `ruleCount`, `callerCount` and `version`. */
export function useEppChains(options = {}) {
  return useQuery({
    ...MODERATE_TIER,
    queryKey: eppKeys.chains(),
    queryFn: () => eppApi.getEppChains(),
    // 403 means no chain is readable at all: a permanent answer.
    retry: (failureCount, error) => error?.status !== 403 && failureCount < 2,
    enabled: computed(() => unref(options.enabled ?? true)),
  })
}

/** The query idles while `chainId` is null/undefined. */
export function useEppChain(chainId) {
  const id = computed(() => unref(chainId))
  return useQuery({
    queryKey: computed(() => eppKeys.chain(id.value)),
    queryFn: () => eppApi.getEppChain(id.value),
    enabled: computed(() => id.value !== null && id.value !== undefined),
    ...MODERATE_TIER,
  })
}

/**
 * `chain id → called chain ids`. Calls live on the rules, so this loads every chain: opt-in
 * (`enabled`) for the rule editor's chain-call picker.
 */
export function useEppCallGraph(chains, options = {}) {
  const enabled = computed(() => unref(options.enabled ?? true))
  const chainIds = computed(() => (enabled.value ? (unref(chains) ?? []).map((c) => c.id) : []))

  const results = useQueries({
    queries: computed(() =>
      chainIds.value.map((id) => ({
        queryKey: eppKeys.chain(id),
        queryFn: () => eppApi.getEppChain(id),
        ...MODERATE_TIER,
      })),
    ),
  })

  /** Rules included: the Flow view needs the rules behind each edge. */
  const chainsWithRules = computed(() => results.value.map((r) => r.data).filter(Boolean))
  const callGraph = computed(() => buildCallGraph(chainsWithRules.value))
  const isLoading = computed(() => results.value.some((r) => r.isPending))

  return { callGraph, chainsWithRules, isLoading }
}

/** Rules in any chain that call the given chain. */
export function useEppChainCallers(chainId, options = {}) {
  const id = computed(() => unref(chainId))
  return useQuery({
    queryKey: computed(() => eppKeys.callers(id.value)),
    queryFn: () => eppApi.getEppChainCallers(id.value),
    enabled: computed(
      () => id.value !== null && id.value !== undefined && unref(options.enabled ?? true),
    ),
    ...MODERATE_TIER,
  })
}

/** 409 conflicts are handled by the component, which owns the local working copy. */
export function useUpdateEppChainRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ chainId, ...payload }) => eppApi.updateEppChainRules(chainId, payload),
    // The registry carries ruleCount.
    onSuccess: (_result, { chainId }) => {
      queryClient.invalidateQueries({ queryKey: eppKeys.chain(chainId) })
      queryClient.invalidateQueries({ queryKey: eppKeys.chains() })
    },
  })
}

export function useCreateEppChain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => eppApi.createEppChain(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eppKeys.chains() }),
  })
}

export function useUpdateEppChain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ chainId, ...payload }) => eppApi.updateEppChain(chainId, payload),
    onSuccess: (_result, { chainId }) => {
      queryClient.invalidateQueries({ queryKey: eppKeys.chain(chainId) })
      queryClient.invalidateQueries({ queryKey: eppKeys.chains() })
    },
  })
}

/**
 * Every chain in the response's `updatedChains` lost its calls to the deleted chain and has a
 * new version.
 */
export function useDeleteEppChain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chainId) => eppApi.deleteEppChain(chainId),
    onSuccess: (result, chainId) => {
      queryClient.removeQueries({ queryKey: eppKeys.chain(chainId) })
      queryClient.invalidateQueries({ queryKey: eppKeys.chains() })
      for (const updated of result?.updatedChains ?? []) {
        queryClient.invalidateQueries({ queryKey: eppKeys.chain(updated.chainId) })
        queryClient.invalidateQueries({ queryKey: eppKeys.callers(updated.chainId) })
      }
    },
  })
}
