import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@/queries/useObjectQueries', () => ({
  useCreateObject: () => ({ mutateAsync, isPending: ref(false) }),
}))

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

const CreateBusinessServicePrototypeDialog = (
  await import('../CreateBusinessServicePrototypeDialog.vue')
).default

const ShellStub = defineComponent({
  props: { visible: Boolean, header: String, isValid: Boolean, isPending: Boolean },
  emits: ['create', 'update:visible'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', [
        slots.default?.(),
        h('button', { class: 'create-btn', onClick: () => emit('create') }, 'Create'),
      ])
  },
})

async function mountDialog() {
  const wrapper = mount(CreateBusinessServicePrototypeDialog, {
    props: { visible: false, parentObject: { id: 9, class: 'BusinessServiceRoot' } },
    global: { plugins: [PrimeVue], stubs: { CreateDialogShell: ShellStub } },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mutateAsync.mockResolvedValue({ id: 10200 })
})

describe('CreateBusinessServicePrototypeDialog', () => {
  it('creates with Agent List unless another method is picked, as legacy does', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('input[type="text"]').setValue('per-site')
    await wrapper.find('.create-btn').trigger('click')
    await flushPromises()

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ class: 'BusinessServiceProto', instanceDiscoveryMethod: 1 }),
    )
  })

  it('offers no None method', async () => {
    const wrapper = await mountDialog()
    const options = wrapper.findComponent({ name: 'Select' }).props('options')

    expect(options.map((option) => option.value)).toEqual([1, 2, 5])
  })
})
