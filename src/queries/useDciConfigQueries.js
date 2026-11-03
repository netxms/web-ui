import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as dciConfigApi from '@/api/dciConfigApi'
import * as objectsApi from '@/api/objectsApi'
import { dciSource, resolveDciSourceRoot } from '@/utils/dciSource'
import { MODERATE_TIER, NO_RETRY_STATUSES, STATIC_TIER } from './config'

export const dciConfigKeys = {
  all: (objectId) => ['dci-config', objectId],
  list: (objectId) => ['dci-config', objectId, 'list'],
  detail: (objectId, dciId) => ['dci-config', objectId, 'detail', dciId],
  sourceRoot: (objectId, dciId, templateId, templateItemId) => [
    'dci-config',
    objectId,
    'source-root',
    dciId,
    templateId,
    templateItemId,
  ],
  otlpMetrics: (objectId) => ['dci-config', objectId, 'otlp-metrics'],
  availableMetrics: (objectId, source) => ['dci-config', objectId, 'available-metrics', source],
}

/**
 * For the DCI metric picker's OTLP list.
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<boolean>} [enabled]
 */
export function useOtlpMetrics(objectId, enabled = true) {
  return useQuery({
    queryKey: computed(() => dciConfigKeys.otlpMetrics(toValue(objectId))),
    queryFn: () => dciConfigApi.getOtlpMetrics(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId) && toValue(enabled)),
    ...MODERATE_TIER,
  })
}

/**
 * For the DCI metric picker's agent and device driver lists. They change only at a configuration
 * poll, and a template's merges every node, hence the static tier.
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<'agent'|'device-driver'|null|undefined>} source
 * @param {import('vue').MaybeRefOrGetter<boolean>} [enabled]
 */
export function useAvailableMetrics(objectId, source, enabled = true) {
  return useQuery({
    queryKey: computed(() => dciConfigKeys.availableMetrics(toValue(objectId), toValue(source))),
    queryFn: () => dciConfigApi.getAvailableMetrics(toValue(objectId), toValue(source)),
    enabled: computed(() => !!toValue(objectId) && !!toValue(source) && toValue(enabled)),
    // A 400 is the object's class having no lists, which no retry changes.
    retry: (failureCount, error) =>
      error?.status !== 400 && !NO_RETRY_STATUSES.has(error?.status) && failureCount < 2,
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useDciConfigList(objectId, options = {}) {
  return useQuery({
    queryKey: computed(() => dciConfigKeys.list(toValue(objectId))),
    queryFn: () => dciConfigApi.listDciConfig(toValue(objectId)),
    enabled: computed(() => {
      const e = toValue(options.enabled)
      return e !== false && !!toValue(objectId)
    }),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {import('vue').MaybeRefOrGetter} dciId
 */
export function useDciConfig(objectId, dciId) {
  return useQuery({
    queryKey: computed(() => dciConfigKeys.detail(toValue(objectId), toValue(dciId))),
    queryFn: () => dciConfigApi.getDciConfig(toValue(objectId), toValue(dciId)),
    enabled: computed(() => !!toValue(objectId) && !!toValue(dciId)),
    ...MODERATE_TIER,
  })
}

/**
 * Where an edit to a generated DCI belongs (template, cluster or local prototype); see
 * `resolveDciSourceRoot`. Keyed under the owner's DCI configuration so its invalidation
 * re-resolves it.
 *
 * @param {import('vue').MaybeRefOrGetter<object|null>} dci - the DCI's configuration
 * @param {import('vue').MaybeRefOrGetter<{ id: number }|null>} owner - the object it is on
 */
export function useDciSourceRoot(dci, owner) {
  return useQuery({
    queryKey: computed(() => {
      const d = toValue(dci)
      return dciConfigKeys.sourceRoot(toValue(owner)?.id, d?.id, d?.templateId, d?.templateItemId)
    }),
    queryFn: () =>
      resolveDciSourceRoot(toValue(dci), toValue(owner), {
        getDci: dciConfigApi.getDciConfig,
        getObject: objectsApi.getObject,
      }),
    enabled: computed(() => !!toValue(owner) && !!dciSource(toValue(dci), toValue(owner).id)),
    ...MODERATE_TIER,
  })
}

export function useCreateDci() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, data }) => dciConfigApi.createDci(objectId, data),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: dciConfigKeys.all(objectId) }),
  })
}

/** PATCH. */
export function useUpdateDci() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, dciId, data }) => dciConfigApi.updateDci(objectId, dciId, data),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: dciConfigKeys.all(objectId) }),
  })
}

export function useDeleteDci() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, dciId }) => dciConfigApi.deleteDci(objectId, dciId),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: dciConfigKeys.all(objectId) }),
  })
}
