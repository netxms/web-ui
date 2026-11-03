import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as twoFactorApi from '@/api/twoFactorApi'
import { STATIC_TIER, MODERATE_TIER } from './config'

export const twoFactorKeys = {
  all: () => ['twoFactor'],
  drivers: () => ['twoFactor', 'drivers'],
  methods: () => ['twoFactor', 'methods'],
}

/** e.g. ["TOTP", "Message"] */
export function useTwoFactorDrivers() {
  return useQuery({
    queryKey: twoFactorKeys.drivers(),
    queryFn: () => twoFactorApi.getTwoFactorDrivers(),
    ...STATIC_TIER,
  })
}

export function useTwoFactorMethods() {
  return useQuery({
    queryKey: twoFactorKeys.methods(),
    queryFn: () => twoFactorApi.getTwoFactorMethods(),
    ...MODERATE_TIER,
  })
}

export function useCreateTwoFactorMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => twoFactorApi.createTwoFactorMethod(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorKeys.methods() }),
  })
}

export function useUpdateTwoFactorMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }) => twoFactorApi.updateTwoFactorMethod(name, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorKeys.methods() }),
  })
}

export function useDeleteTwoFactorMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => twoFactorApi.deleteTwoFactorMethod(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorKeys.methods() }),
  })
}
