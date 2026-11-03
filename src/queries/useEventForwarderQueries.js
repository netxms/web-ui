import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as eventForwardersApi from '@/api/eventForwardersApi'
import { serverActionKeys } from './useServerActionQueries'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const eventForwarderKeys = {
  all: () => ['eventForwarders'],
  list: () => ['eventForwarders', 'list'],
  detail: (name) => ['eventForwarders', 'detail', name],
  drivers: () => ['eventForwarders', 'drivers'],
}

export function useEventForwarders() {
  return useQuery({
    queryKey: eventForwarderKeys.list(),
    queryFn: () => eventForwardersApi.getEventForwarders(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} forwarderName
 */
export function useEventForwarder(forwarderName) {
  return useQuery({
    queryKey: computed(() => eventForwarderKeys.detail(toValue(forwarderName))),
    queryFn: () => eventForwardersApi.getEventForwarder(toValue(forwarderName)),
    enabled: computed(() => {
      const name = toValue(forwarderName)
      return !!name && name !== 'new'
    }),
    ...MODERATE_TIER,
  })
}

export function useEventForwarderDrivers() {
  return useQuery({
    queryKey: eventForwarderKeys.drivers(),
    queryFn: () => eventForwardersApi.getEventForwarderDrivers(),
    ...STATIC_TIER,
  })
}

export function useCreateEventForwarder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => eventForwardersApi.createEventForwarder(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventForwarderKeys.all() }),
  })
}

export function useUpdateEventForwarder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }) => eventForwardersApi.updateEventForwarder(name, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventForwarderKeys.all() }),
  })
}

/** The server also rewrites references in server actions. */
export function useRenameEventForwarder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, newName }) => eventForwardersApi.renameEventForwarder(name, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventForwarderKeys.all() })
      queryClient.invalidateQueries({ queryKey: serverActionKeys.all() })
    },
  })
}

/** Fails with 409 when the forwarder is used in a server action. */
export function useDeleteEventForwarder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => eventForwardersApi.deleteEventForwarder(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventForwarderKeys.all() }),
  })
}
