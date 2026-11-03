import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as serverConfigApi from '@/api/serverConfigApi'
import { STATIC_TIER } from './config'

export const serverConfigKeys = {
  all: () => ['serverConfig'],
  list: () => ['serverConfig', 'list'],
}

export function useServerConfigVariables() {
  return useQuery({
    queryKey: serverConfigKeys.list(),
    queryFn: () => serverConfigApi.getServerConfigVariables(),
    ...STATIC_TIER,
  })
}

/**
 * Creates the variable when the name is new. The list is patched in place from the stored
 * variable before invalidation, so an edit does not flash the table's loading state.
 *
 * @returns mutation taking `{ name, value }`
 */
export function useSetServerConfigVariable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, value }) => serverConfigApi.setServerConfigVariable(name, value),
    onSuccess: (updated) => {
      patchVariable(queryClient, updated)
      queryClient.invalidateQueries({ queryKey: serverConfigKeys.all() })
    },
  })
}

/**
 * @returns mutation taking the variable name
 */
export function useResetServerConfigVariable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => serverConfigApi.resetServerConfigVariable(name),
    onSuccess: (updated) => {
      patchVariable(queryClient, updated)
      queryClient.invalidateQueries({ queryKey: serverConfigKeys.all() })
    },
  })
}

/**
 * @returns mutation taking the variable name
 */
export function useDeleteServerConfigVariable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => serverConfigApi.deleteServerConfigVariable(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverConfigKeys.all() }),
  })
}

/** The PUT upserts, so a new name is appended. A no-op while the list was never fetched. */
function patchVariable(queryClient, updated) {
  if (!updated?.name) return
  queryClient.setQueryData(serverConfigKeys.list(), (current) => {
    if (!Array.isArray(current)) return current
    if (!current.some((v) => v.name === updated.name)) return [...current, updated]
    return current.map((v) => (v.name === updated.name ? updated : v))
  })
}
