import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import * as aiApi from '@/api/aiApi'
import { aiKeys, useDeleteAiMessage, useSetAiMessageStatus } from '@/queries/useAiQueries'

vi.mock('@/api/aiApi')

const list = [
  { id: 1, status: 'pending' },
  { id: 2, status: 'read' },
]

let queryClient

function setup(useHook) {
  let result
  const Host = defineComponent({
    setup() {
      result = useHook()
      return () => h('div')
    },
  })
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  queryClient = new QueryClient()
  queryClient.setQueryData(aiKeys.messages(), list)
})

describe('AI message mutations', () => {
  it('writes the answer into the list, without refetching it', async () => {
    aiApi.setAiMessageStatus.mockResolvedValue({ id: 1, status: 'approved' })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { mutateAsync } = setup(useSetAiMessageStatus)

    await mutateAsync({ messageId: 1, status: 'approved' })
    await flushPromises()

    expect(aiApi.setAiMessageStatus).toHaveBeenCalledWith(1, 'approved')
    expect(queryClient.getQueryData(aiKeys.messages())).toEqual([
      { id: 1, status: 'approved' },
      { id: 2, status: 'read' },
    ])
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refetches after a failure, which means the list is out of date', async () => {
    aiApi.setAiMessageStatus.mockRejectedValue(Object.assign(new Error('Gone'), { status: 404 }))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { mutateAsync } = setup(useSetAiMessageStatus)

    await expect(mutateAsync({ messageId: 1, status: 'read' })).rejects.toThrow('Gone')
    await flushPromises()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: aiKeys.messages() })
    expect(queryClient.getQueryData(aiKeys.messages())).toEqual(list)
  })

  it('takes a deleted message out of the list', async () => {
    aiApi.deleteAiMessage.mockResolvedValue(null)
    const { mutateAsync } = setup(useDeleteAiMessage)

    await mutateAsync({ messageId: 1 })
    await flushPromises()

    expect(aiApi.deleteAiMessage).toHaveBeenCalledWith(1)
    expect(queryClient.getQueryData(aiKeys.messages())).toEqual([{ id: 2, status: 'read' }])
  })
})
