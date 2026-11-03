import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'

const mutateAsync = vi.fn()
const toastAdd = vi.fn()

vi.mock('@/queries/useObjectQueries', () => ({
  useCreateObject: () => ({ mutateAsync, isPending: ref(false) }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: toastAdd }),
}))

function mountHost({ resetForm = vi.fn(), onError } = {}) {
  let api
  const Host = defineComponent({
    props: { visible: { type: Boolean, default: false } },
    emits: ['update:visible'],
    setup(props, { emit }) {
      api = useCreateObjectDialog({ visible: () => props.visible, resetForm, emit, onError })
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { props: { visible: false } })
  return { wrapper, resetForm, api: () => api }
}

beforeEach(() => {
  mutateAsync.mockReset()
  toastAdd.mockReset()
})

describe('useCreateObjectDialog', () => {
  it('resets the form when the dialog becomes visible', async () => {
    const { wrapper, resetForm } = mountHost()
    expect(resetForm).not.toHaveBeenCalled()
    await wrapper.setProps({ visible: true })
    expect(resetForm).toHaveBeenCalledOnce()
  })

  it('does not reset the form when the dialog closes', async () => {
    const { wrapper, resetForm } = mountHost()
    await wrapper.setProps({ visible: true })
    resetForm.mockClear()
    await wrapper.setProps({ visible: false })
    expect(resetForm).not.toHaveBeenCalled()
  })

  it('onClose emits update:visible with false', () => {
    const { wrapper, api } = mountHost()
    api().onClose()
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  it('submitCreate calls the mutation, toasts success, and returns the created object', async () => {
    const created = { id: 42, name: 'router-1' }
    mutateAsync.mockResolvedValue(created)
    const { api } = mountHost()

    const payload = { class: 'Node', name: 'router-1' }
    const result = await api().submitCreate({ payload, successMessage: 'Node created' })

    expect(mutateAsync).toHaveBeenCalledWith(payload)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Node created' }),
    )
    expect(result).toBe(created)
  })

  it('submitCreate toasts a generic error and returns null on failure', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    const { api } = mountHost()

    const result = await api().submitCreate({
      payload: {},
      successMessage: 'Node created',
      errorMessage: 'Failed to create node',
    })

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: 'Failed to create node',
        detail: 'boom',
      }),
    )
    expect(result).toBeNull()
  })

  it('submitCreate defers to onError instead of the default toast when provided', async () => {
    const err = Object.assign(new Error('conflict'), { status: 409 })
    mutateAsync.mockRejectedValue(err)
    const onError = vi.fn()
    const { api } = mountHost({ onError })

    const result = await api().submitCreate({ payload: {}, successMessage: 'Node created' })

    expect(onError).toHaveBeenCalledWith(err, expect.objectContaining({ add: toastAdd }))
    expect(toastAdd).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})
