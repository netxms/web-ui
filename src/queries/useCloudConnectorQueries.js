import { useQuery } from '@tanstack/vue-query'
import * as cloudConnectorsApi from '@/api/cloudConnectorsApi'
import { STATIC_TIER } from './config'

export const cloudConnectorKeys = {
  all: () => ['cloudConnectors'],
  list: () => ['cloudConnectors', 'list'],
}

/** Names only. */
export function useCloudConnectors() {
  return useQuery({
    queryKey: cloudConnectorKeys.list(),
    queryFn: () => cloudConnectorsApi.getCloudConnectors(),
    ...STATIC_TIER,
  })
}
