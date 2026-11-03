import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/objectToolsApi', () => ({
  getObjectTool: vi.fn(async (id) => (id === 2 ? { id, icon: 'icon-2' } : { id })),
}))

const { useObjectToolIcons } = await import('../useObjectToolQueries')
const { getObjectTool } = await import('@/api/objectToolsApi')

function mountIcons(tools) {
  let result
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mount(
    defineComponent({
      setup() {
        result = useObjectToolIcons(tools)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return result
}

describe('useObjectToolIcons', () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads each listed tool's icon from its detail document while lists lack the field", async () => {
    const { iconByToolId } = mountIcons(
      ref([
        { id: 1, name: 'Ping', type: 'agent-list' },
        { id: 2, name: 'Web', type: 'url' },
        { id: 3, name: 'Local', type: 'command' },
      ]),
    )
    await flushPromises()

    // Command tools never reach a menu, so their documents are not fetched.
    expect(getObjectTool.mock.calls.map(([id]) => id).sort()).toEqual([1, 2])
    expect(iconByToolId.value.get(1)).toBeNull()
    expect(iconByToolId.value.get(2)).toBe('icon-2')
  })

  it('trusts the list once it carries icons, and fetches nothing more', async () => {
    const { iconByToolId } = mountIcons(
      ref([
        { id: 1, name: 'Ping', type: 'agent-list', icon: null },
        { id: 2, name: 'Web', type: 'url', icon: 'icon-2' },
        { id: 4, name: 'Old', type: 'url', icon: '00000000-0000-0000-0000-000000000000' },
      ]),
    )
    await flushPromises()

    expect(getObjectTool).not.toHaveBeenCalled()
    expect(iconByToolId.value.get(2)).toBe('icon-2')
    expect(iconByToolId.value.get(1)).toBeNull()
    expect(iconByToolId.value.get(4)).toBeNull()
  })
})
