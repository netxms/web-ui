import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/serverConfigApi', () => ({
  getServerConfigVariables: vi.fn(),
  getServerConfigVariable: vi.fn(),
  setServerConfigVariable: vi.fn(),
  resetServerConfigVariable: vi.fn(),
  deleteServerConfigVariable: vi.fn(),
}))

const serverConfigApi = await import('@/api/serverConfigApi')
const { serverConfigKeys, useSetServerConfigVariable, useResetServerConfigVariable } =
  await import('../useServerConfigQueries')

function variable(name, value, extra = {}) {
  return {
    id: name,
    name,
    value,
    defaultValue: '60',
    dataType: 'STRING',
    description: '',
    units: '',
    needServerRestart: false,
    possibleValues: [],
    ...extra,
  }
}

// The whole list is one request: mutations patch the cached list from the echoed variable
// before invalidating, so an edit does not visibly reload the table.
describe('server config mutation cache patching', () => {
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
    queryClient.setQueryData(serverConfigKeys.list(), [
      variable('Agent.CommandTimeout', '4000'),
      variable('Objects.SyncInterval', '60'),
    ])
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('replaces the edited row in place', async () => {
    const updated = variable('Objects.SyncInterval', '120')
    serverConfigApi.setServerConfigVariable.mockResolvedValue(updated)

    const { mutate } = withMutation(useSetServerConfigVariable)
    mutate({ name: 'Objects.SyncInterval', value: '120' })
    await flushPromises()

    const list = queryClient.getQueryData(serverConfigKeys.list())
    expect(list).toHaveLength(2)
    expect(list.find((v) => v.name === 'Objects.SyncInterval').value).toBe('120')
    expect(list.find((v) => v.name === 'Agent.CommandTimeout').value).toBe('4000')
  })

  it('appends a variable created by the PUT upsert', async () => {
    const created = variable('Custom.Setting', 'on', { defaultValue: '' })
    serverConfigApi.setServerConfigVariable.mockResolvedValue(created)

    const { mutate } = withMutation(useSetServerConfigVariable)
    mutate({ name: 'Custom.Setting', value: 'on' })
    await flushPromises()

    const list = queryClient.getQueryData(serverConfigKeys.list())
    expect(list).toHaveLength(3)
    expect(list.at(-1)).toEqual(created)
  })

  it('patches the row a reset answers with', async () => {
    const reset = variable('Objects.SyncInterval', '60')
    serverConfigApi.resetServerConfigVariable.mockResolvedValue(reset)

    const { mutate } = withMutation(useResetServerConfigVariable)
    mutate('Objects.SyncInterval')
    await flushPromises()

    const list = queryClient.getQueryData(serverConfigKeys.list())
    expect(list.find((v) => v.name === 'Objects.SyncInterval').value).toBe('60')
  })

  it('leaves an unfetched list alone rather than seeding a partial one', async () => {
    queryClient.removeQueries({ queryKey: serverConfigKeys.list() })
    serverConfigApi.setServerConfigVariable.mockResolvedValue(variable('Objects.SyncInterval', '5'))

    const { mutate } = withMutation(useSetServerConfigVariable)
    mutate({ name: 'Objects.SyncInterval', value: '5' })
    await flushPromises()

    expect(queryClient.getQueryData(serverConfigKeys.list())).toBeUndefined()
  })
})
