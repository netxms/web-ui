import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as sshKeysApi from '@/api/sshKeysApi'
import { MODERATE_TIER } from './config'

export const sshKeyKeys = {
  all: () => ['sshKeys'],
  list: () => ['sshKeys', 'list'],
}

/** Includes public key data. */
export function useSshKeys() {
  return useQuery({
    queryKey: sshKeyKeys.list(),
    queryFn: () => sshKeysApi.getSshKeys(true),
    ...MODERATE_TIER,
  })
}

export function useCreateSshKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => sshKeysApi.createSshKey(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshKeyKeys.all() }),
  })
}

export function useUpdateSshKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ keyId, data }) => sshKeysApi.updateSshKey(keyId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshKeyKeys.all() }),
  })
}

/** Pass force=true to delete even if in use by nodes. */
export function useDeleteSshKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ keyId, force = false }) => sshKeysApi.deleteSshKey(keyId, force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshKeyKeys.all() }),
  })
}
