import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/usersApi', () => ({
  getUserDirectory: vi.fn(),
  updateUserGroup: vi.fn(),
}))

const usersApi = await import('@/api/usersApi')
const { userKeys, useUserDirectory, useUpdateUserGroup } = await import('../useUserQueries')

describe('useUserDirectory', () => {
  let queryClient
  let wrapper

  function withComposable(composable) {
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
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('splits the entries into users and groups', async () => {
    usersApi.getUserDirectory.mockResolvedValue([
      { id: 1, name: 'admin', isGroup: false, isDisabled: false },
      { id: 0x40000000, name: 'Everyone', isGroup: true, isDisabled: false },
      { id: 4, name: 'bwilson', isGroup: false, isDisabled: true },
    ])

    const { users, groups } = withComposable(useUserDirectory)
    expect(users.value).toEqual([])
    await flushPromises()

    expect(users.value.map((user) => user.id)).toEqual([1, 4])
    expect(groups.value.map((group) => group.id)).toEqual([0x40000000])
  })

  it('is refetched after a group changes', async () => {
    usersApi.updateUserGroup.mockResolvedValue({})
    queryClient.setQueryData(userKeys.directory(), [])

    const { mutateAsync } = withComposable(useUpdateUserGroup)
    await mutateAsync({ groupId: 0x40000001, data: { name: 'Ops' } })

    expect(queryClient.getQueryState(userKeys.directory()).isInvalidated).toBe(true)
  })
})
