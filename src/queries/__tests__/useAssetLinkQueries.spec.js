import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/assetApi', () => ({
  linkAsset: vi.fn(),
  unlinkAsset: vi.fn(),
}))
vi.mock('@/api/objectsApi', () => ({
  getObject: vi.fn(),
  queryObjects: vi.fn(),
}))

const assetApi = await import('@/api/assetApi')
const objectsApi = await import('@/api/objectsApi')
const { useAssetLinkLookups, useAssetLinkMutations } = await import('../useAssetLinkQueries')
const { objectKeys } = await import('../useObjectQueries')
const { assetPropertyKeys } = await import('../useAssetPropertyQueries')
const { nodeInventoryKeys } = await import('../useNodeInventoryQueries')

let queryClient

function withSetup(composable) {
  let api
  mount(
    defineComponent({
      setup() {
        api = composable()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return api
}

function invalidatedKeys(spy) {
  return spy.mock.calls.map((call) => call[0].queryKey)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
})

afterEach(() => {
  queryClient.clear()
})

describe('useAssetLinkMutations', () => {
  it('links through the asset and refreshes both sides and the previous partners', async () => {
    assetApi.linkAsset.mockResolvedValue({ assetId: 851, linkedObjectId: 502, componentSerial: '' })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { link } = withSetup(useAssetLinkMutations)

    await link.mutateAsync({
      assetId: 851,
      payload: { objectId: 502, updateIdentification: true },
      affectedIds: [516, null, 853],
    })
    await nextTick()

    expect(assetApi.linkAsset).toHaveBeenCalledWith(851, {
      objectId: 502,
      updateIdentification: true,
    })
    const keys = invalidatedKeys(invalidate)
    for (const id of [851, 502, 516, 853]) expect(keys).toContainEqual(objectKeys.detail(id))
    expect(keys).not.toContainEqual(objectKeys.detail(null))
    expect(keys).toContainEqual(assetPropertyKeys.all(851))
    expect(keys).toContainEqual(nodeInventoryKeys.componentAssetsAll())
  })

  it('unlinks and refreshes the object the asset left', async () => {
    assetApi.unlinkAsset.mockResolvedValue(null)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { unlink } = withSetup(useAssetLinkMutations)

    await unlink.mutateAsync({ assetId: 850, affectedIds: [516] })
    await nextTick()

    expect(assetApi.unlinkAsset).toHaveBeenCalledWith(850)
    const keys = invalidatedKeys(invalidate)
    expect(keys).toContainEqual(objectKeys.detail(850))
    expect(keys).toContainEqual(objectKeys.detail(516))
    expect(keys).toContainEqual(nodeInventoryKeys.componentAssetsAll())
  })

  it('refreshes nothing when the server refuses', async () => {
    assetApi.linkAsset.mockRejectedValue(Object.assign(new Error('denied'), { status: 403 }))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { link } = withSetup(useAssetLinkMutations)

    await expect(
      link.mutateAsync({ assetId: 851, payload: { objectId: 502 } }),
    ).rejects.toThrow('denied')
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useAssetLinkLookups', () => {
  it('finds the asset of an object below the asset root', async () => {
    objectsApi.queryObjects.mockResolvedValue([
      { object: { id: 851, name: 'srv-dc-02', class: 'Asset' }, fields: {} },
    ])
    const { fetchObjectAsset } = withSetup(useAssetLinkLookups)

    expect(await fetchObjectAsset(502)).toEqual({ id: 851, name: 'srv-dc-02' })
    const [{ query, rootObjectId }] = objectsApi.queryObjects.mock.calls[0]
    expect(rootObjectId).toBe(5)
    expect(query).toContain('linkedObjectId == 502')
  })

  it('answers null for an object without an asset', async () => {
    objectsApi.queryObjects.mockResolvedValue([])
    const { fetchObjectAsset } = withSetup(useAssetLinkLookups)
    expect(await fetchObjectAsset(502)).toBeNull()
  })

  it('picks the asset of one component by its serial', async () => {
    objectsApi.queryObjects.mockResolvedValue([
      { object: { id: 850, name: 'srv-dc-01' }, fields: { serial: 'CZJ0450ABC' } },
      { object: { id: 853, name: 'spare-ssd-01' }, fields: { serial: 'PHYF0123456' } },
    ])
    const { fetchComponentAsset } = withSetup(useAssetLinkLookups)

    expect(await fetchComponentAsset(516, 'PHYF0123456')).toEqual({
      id: 853,
      name: 'spare-ssd-01',
    })
    expect(await fetchComponentAsset(516, 'MEM-0001')).toBeNull()
  })

  it('reads the object afresh, not from the cache', async () => {
    queryClient.setQueryData(objectKeys.detail(851), { id: 851, class: 'Asset', name: 'old' })
    objectsApi.getObject.mockResolvedValue({
      id: 851,
      class: 'Asset',
      name: 'srv-dc-02',
      linkedObjectId: 502,
      componentSerial: '',
    })
    const { fetchObject } = withSetup(useAssetLinkLookups)

    const asset = await fetchObject(851)
    expect(asset.name).toBe('srv-dc-02')
    expect(asset.linkedObjectId).toBe(502)
  })

  it('names an unreadable object by its id', async () => {
    objectsApi.getObject.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }))
    const { fetchName } = withSetup(useAssetLinkLookups)
    expect(await fetchName(516)).toBe('[516]')
  })
})
