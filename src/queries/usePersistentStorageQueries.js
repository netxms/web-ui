// MODERATE_TIER: scripts and EPP rules write entries underneath the view. Mutations patch the
// cached list from the server's answer before invalidating.
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as persistentStorageApi from '@/api/persistentStorageApi'
import { MODERATE_TIER } from './config'

export const persistentStorageKeys = {
  all: () => ['persistentStorage'],
  list: () => ['persistentStorage', 'list'],
}

export function usePersistentStorage() {
  return useQuery({
    queryKey: persistentStorageKeys.list(),
    queryFn: () => persistentStorageApi.getPersistentStorage(),
    ...MODERATE_TIER,
  })
}

/**
 * Creates the entry when the key is new.
 *
 * @returns mutation taking `{ key, value }`
 */
export function useSetPersistentStorageEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => persistentStorageApi.setPersistentStorageEntry(key, value),
    onSuccess: (entry) => {
      patchList(queryClient, (list) =>
        list.some((e) => e.key === entry.key)
          ? list.map((e) => (e.key === entry.key ? entry : e))
          : [...list, entry],
      )
      queryClient.invalidateQueries({ queryKey: persistentStorageKeys.all() })
    },
  })
}

/**
 * @returns mutation taking the key
 */
export function useDeletePersistentStorageEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key) => persistentStorageApi.deletePersistentStorageEntry(key),
    onSuccess: (_result, key) => {
      patchList(queryClient, (list) => list.filter((e) => e.key !== key))
      queryClient.invalidateQueries({ queryKey: persistentStorageKeys.all() })
    },
  })
}

/** A no-op while the list has never been fetched. */
function patchList(queryClient, update) {
  queryClient.setQueryData(persistentStorageKeys.list(), (current) =>
    Array.isArray(current) ? update(current) : current,
  )
}
