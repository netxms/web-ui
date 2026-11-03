import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/persistentStorageApi', () => ({
  getPersistentStorage: vi.fn(),
  setPersistentStorageEntry: vi.fn(),
  deletePersistentStorageEntry: vi.fn(),
}))

const persistentStorageApi = await import('@/api/persistentStorageApi')
const { persistentStorageKeys, useSetPersistentStorageEntry, useDeletePersistentStorageEntry } =
  await import('../usePersistentStorageQueries')

const entry = (key, value) => ({ id: key, key, value })

describe('persistent storage mutation cache patching', () => {
  let queryClient
  let wrapper

  function withMutation(composable) {
    let api
    wrapper = mount(
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

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(persistentStorageKeys.list(), [
      entry('counter', '1'),
      entry('lastRun', 'never'),
    ])
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('replaces the edited entry in place', async () => {
    persistentStorageApi.setPersistentStorageEntry.mockResolvedValue(entry('counter', '2'))

    const { mutate } = withMutation(useSetPersistentStorageEntry)
    mutate({ key: 'counter', value: '2' })
    await flushPromises()

    const list = queryClient.getQueryData(persistentStorageKeys.list())
    expect(list).toEqual([entry('counter', '2'), entry('lastRun', 'never')])
  })

  it('appends an entry created by the PUT upsert', async () => {
    persistentStorageApi.setPersistentStorageEntry.mockResolvedValue(entry('fresh', 'x'))

    const { mutate } = withMutation(useSetPersistentStorageEntry)
    mutate({ key: 'fresh', value: 'x' })
    await flushPromises()

    expect(queryClient.getQueryData(persistentStorageKeys.list())).toHaveLength(3)
  })

  it('drops a deleted entry', async () => {
    persistentStorageApi.deletePersistentStorageEntry.mockResolvedValue(undefined)

    const { mutate } = withMutation(useDeletePersistentStorageEntry)
    mutate('counter')
    await flushPromises()

    expect(queryClient.getQueryData(persistentStorageKeys.list())).toEqual([
      entry('lastRun', 'never'),
    ])
  })

  it('leaves an unfetched list alone rather than seeding a partial one', async () => {
    queryClient.removeQueries({ queryKey: persistentStorageKeys.list() })
    persistentStorageApi.setPersistentStorageEntry.mockResolvedValue(entry('counter', '5'))

    const { mutate } = withMutation(useSetPersistentStorageEntry)
    mutate({ key: 'counter', value: '5' })
    await flushPromises()

    expect(queryClient.getQueryData(persistentStorageKeys.list())).toBeUndefined()
  })
})
