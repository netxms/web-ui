import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as aiOperatorsApi from '@/api/aiOperatorsApi'
import { MODERATE_TIER, VOLATILE_TIER } from './config'

export const aiOperatorKeys = {
  all: () => ['aiOperators'],
  list: () => ['aiOperators', 'list'],
  detail: (id) => ['aiOperators', 'detail', id],
  checks: (id) => ['aiOperators', 'checks', id],
  instructionsHistory: (id) => ['aiOperators', 'instructionsHistory', id],
}

/** Not absent, and not the create form's 'new'. */
function isExistingId(id) {
  return id != null && id !== 'new'
}

/**
 * Volatile: `executing`, `tokensUsedToday` and `nextExecutionTime` advance on the server.
 *
 * @param {import('vue').MaybeRefOrGetter} [enabled] - gate on the "manage AI operators" right
 */
export function useAiOperators(enabled) {
  return useQuery({
    queryKey: aiOperatorKeys.list(),
    queryFn: () => aiOperatorsApi.getAiOperators(),
    enabled: computed(() => toValue(enabled) ?? true),
    ...VOLATILE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} operatorId
 */
export function useAiOperator(operatorId) {
  return useQuery({
    queryKey: computed(() => aiOperatorKeys.detail(toValue(operatorId))),
    queryFn: () => aiOperatorsApi.getAiOperator(toValue(operatorId)),
    enabled: computed(() => isExistingId(toValue(operatorId))),
    ...MODERATE_TIER,
  })
}

/**
 * Volatile: the server updates `lastRun`, `lastVerdict` and `runCount` on its own.
 *
 * @param {import('vue').MaybeRefOrGetter} operatorId
 */
export function useAiOperatorChecks(operatorId) {
  return useQuery({
    queryKey: computed(() => aiOperatorKeys.checks(toValue(operatorId))),
    queryFn: () => aiOperatorsApi.getAiOperatorChecks(toValue(operatorId)),
    enabled: computed(() => isExistingId(toValue(operatorId))),
    ...VOLATILE_TIER,
  })
}

/**
 * Newest first.
 *
 * @param {import('vue').MaybeRefOrGetter} operatorId
 */
export function useAiOperatorInstructionsHistory(operatorId) {
  return useQuery({
    queryKey: computed(() => aiOperatorKeys.instructionsHistory(toValue(operatorId))),
    queryFn: () => aiOperatorsApi.getAiOperatorInstructionsHistory(toValue(operatorId)),
    enabled: computed(() => isExistingId(toValue(operatorId))),
    ...MODERATE_TIER,
  })
}

export function useCreateAiOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => aiOperatorsApi.createAiOperator(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiOperatorKeys.all() }),
  })
}

export function useUpdateAiOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ operatorId, data }) => aiOperatorsApi.updateAiOperator(operatorId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiOperatorKeys.all() }),
  })
}

/** Also deletes all its observations. */
export function useDeleteAiOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (operatorId) => aiOperatorsApi.deleteAiOperator(operatorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiOperatorKeys.all() }),
  })
}

/** Clears accumulated adaptive state. */
export function useResetAiOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (operatorId) => aiOperatorsApi.resetAiOperatorMemento(operatorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiOperatorKeys.all() }),
  })
}

/** `{ operatorId, data }` */
export function useCreateAiOperatorCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ operatorId, data }) => aiOperatorsApi.createAiOperatorCheck(operatorId, data),
    onSuccess: (_, { operatorId }) =>
      queryClient.invalidateQueries({ queryKey: aiOperatorKeys.checks(operatorId) }),
  })
}

/** `{ operatorId, checkId, data }` */
export function useUpdateAiOperatorCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ operatorId, checkId, data }) =>
      aiOperatorsApi.updateAiOperatorCheck(operatorId, checkId, data),
    onSuccess: (_, { operatorId }) =>
      queryClient.invalidateQueries({ queryKey: aiOperatorKeys.checks(operatorId) }),
  })
}

/** `{ operatorId, checkId }` */
export function useDeleteAiOperatorCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ operatorId, checkId }) =>
      aiOperatorsApi.deleteAiOperatorCheck(operatorId, checkId),
    onSuccess: (_, { operatorId }) =>
      queryClient.invalidateQueries({ queryKey: aiOperatorKeys.checks(operatorId) }),
  })
}

export const aiObservationKeys = {
  all: () => ['aiObservations'],
  list: (params) => ['aiObservations', 'list', params],
}

/**
 * Newest first. Volatile: a running operator writes these on its own.
 *
 * @param {import('vue').MaybeRefOrGetter<object>} [params] - see aiOperatorsApi.getAiObservations
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {import('vue').MaybeRef<number>} [options.refetchInterval] - ms
 */
export function useAiObservations(params, options = {}) {
  const resolved = computed(() => toValue(params) ?? {})
  return useQuery({
    queryKey: computed(() => aiObservationKeys.list(resolved.value)),
    queryFn: () => aiOperatorsApi.getAiObservations(resolved.value),
    enabled: computed(() => toValue(options.enabled) !== false),
    ...VOLATILE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

/** Every filtered list is invalidated: a state change moves the record between them. */
export function useSetAiObservationState() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ observationId, state }) =>
      aiOperatorsApi.setAiObservationState(observationId, state),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiObservationKeys.all() }),
  })
}
