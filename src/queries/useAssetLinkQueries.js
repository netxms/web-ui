import { useMutation, useQueryClient } from '@tanstack/vue-query'
import * as assetApi from '@/api/assetApi'
import { adaptObject } from '@/api/objectAdapters'
import { getObject, queryObjects } from '@/api/objectsApi'
import { objectAssetQuery } from '@/utils/assetLink'
import { assetsBySerial, componentAssetQuery } from '@/utils/nodeInventory'
import { assetPropertyKeys } from './useAssetPropertyQueries'
import { ASSET_ROOT_ID, nodeInventoryKeys } from './useNodeInventoryQueries'
import { objectKeys } from './useObjectQueries'

/**
 * Link and unlink. Each refreshes the asset, its properties (a link can write its serial number
 * or MAC address), every object named in `affectedIds` (the previous partners on both sides) and
 * the component assets of every node.
 */
export function useAssetLinkMutations() {
  const queryClient = useQueryClient()

  function refresh(assetId, ids) {
    for (const id of new Set([assetId, ...ids])) {
      if (id) queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    }
    queryClient.invalidateQueries({ queryKey: assetPropertyKeys.all(assetId) })
    queryClient.invalidateQueries({ queryKey: nodeInventoryKeys.componentAssetsAll() })
  }

  const link = useMutation({
    /** @param {{ assetId: number, payload: object, affectedIds?: number[] }} vars */
    mutationFn: ({ assetId, payload }) => assetApi.linkAsset(assetId, payload),
    onSuccess: (_, { assetId, payload, affectedIds = [] }) =>
      refresh(assetId, [payload.objectId, ...affectedIds]),
  })

  const unlink = useMutation({
    /** @param {{ assetId: number, affectedIds?: number[] }} vars */
    mutationFn: ({ assetId }) => assetApi.unlinkAsset(assetId),
    onSuccess: (_, { assetId, affectedIds = [] }) => refresh(assetId, affectedIds),
  })

  return { link, unlink }
}

/**
 * Current link state for the confirmation before a change. Tree rows carry no link fields, and
 * another user may have changed them.
 */
export function useAssetLinkLookups() {
  const queryClient = useQueryClient()

  async function fetchObject(id) {
    const raw = await queryClient.fetchQuery({
      queryKey: objectKeys.detail(id),
      queryFn: () => getObject(id),
      staleTime: 0,
    })
    return adaptObject(raw)
  }

  /** @returns {Promise<string>} the name, or `[id]` when the object cannot be read */
  async function fetchName(id) {
    try {
      return (await fetchObject(id)).name
    } catch {
      return `[${id}]`
    }
  }

  /** @returns {Promise<{ id: number, name: string } | null>} */
  async function fetchObjectAsset(objectId) {
    const results = await queryObjects({
      query: objectAssetQuery(objectId),
      rootObjectId: ASSET_ROOT_ID,
    })
    const asset = results?.[0]?.object
    return asset ? { id: asset.id, name: asset.name } : null
  }

  /** @returns {Promise<{ id: number, name: string } | null>} */
  async function fetchComponentAsset(nodeId, serial) {
    const results = await queryObjects({
      query: componentAssetQuery(nodeId),
      rootObjectId: ASSET_ROOT_ID,
      fields: ['serial'],
    })
    return assetsBySerial(results).get(serial) ?? null
  }

  return { fetchObject, fetchName, fetchObjectAsset, fetchComponentAsset }
}
