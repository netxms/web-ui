import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'

const { mutateAsync, routerPush, zones } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  routerPush: vi.fn(),
  zones: { value: null },
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push: routerPush }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@/queries/useObjectQueries', () => ({
  useObjects: () => ({ data: ref([{ id: 2, class: 'ServiceRoot' }]) }),
  useZones: () => zones.value,
  useCreateObject: () => ({ mutateAsync, isPending: ref(false) }),
}))

const CreateNodeDialog = (await import('../CreateNodeDialog.vue')).default

// The shell is a PrimeVue Dialog; the stub renders its slots in place and a Create button.
const ShellStub = defineComponent({
  props: { visible: Boolean, header: String, isValid: Boolean, isPending: Boolean },
  emits: ['create', 'update:visible'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { class: 'shell', 'data-valid': String(props.isValid) }, [
        h('h2', props.header),
        slots.intro?.(),
        slots.default?.(),
        h('div', { class: 'footer' }, slots['footer-extra']?.()),
        h('button', { class: 'create-btn', onClick: () => emit('create') }, 'Create'),
      ])
  },
})

// Records the value and lets a test pick, the way the tree picker hands back a tree node.
const PickerStub = defineComponent({
  props: { modelValue: Object, dialogTitle: String, label: String },
  emits: ['update:modelValue'],
  setup(props) {
    return () =>
      h('div', {
        class: 'picker',
        'data-title': props.dialogTitle,
        'data-value': props.modelValue?.name ?? '',
      })
  },
})

const DMZ = { id: 520, name: 'DMZ', class: 'Zone', uin: 7 }

async function mountDialog(props = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(CreateNodeDialog, {
    props: { visible: false, parentObject: { id: 2 }, ...props },
    global: {
      plugins: [PrimeVue, pinia],
      stubs: { CreateDialogShell: ShellStub, ObjectPickerInput: PickerStub },
    },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

const zonePicker = (wrapper) =>
  wrapper.findAllComponents(PickerStub).find((p) => p.props('dialogTitle') === 'Select Zone')

async function fillAndCreate(wrapper, { name } = {}) {
  const [nameInput, , primaryInput] = wrapper.findAll('input[type="text"]')
  if (name) await nameInput.setValue(name)
  await primaryInput.setValue('10.0.0.5')
  await wrapper.find('.create-btn').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  zones.value = ref([DMZ])
  mutateAsync.mockResolvedValue({ id: 901 })
})

describe('CreateNodeDialog', () => {
  it('sends the zone UIN, not the object id, for a zone picked from the tree', async () => {
    const wrapper = await mountDialog()
    // Tree nodes carry no UIN.
    zonePicker(wrapper).vm.$emit('update:modelValue', { id: 520, name: 'DMZ', class: 'Zone' })
    await fillAndCreate(wrapper, { name: 'node-a' })

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ zoneUIN: 7 }))
  })

  it('blocks Create while a picked zone has no known UIN', async () => {
    zones.value = ref([])
    const wrapper = await mountDialog()
    zonePicker(wrapper).vm.$emit('update:modelValue', { id: 520, name: 'DMZ', class: 'Zone' })
    await wrapper.findAll('input[type="text"]')[0].setValue('node-a')
    await wrapper.findAll('input[type="text"]')[2].setValue('10.0.0.5')

    expect(wrapper.find('.shell').attributes('data-valid')).toBe('false')
  })

  it('opens with the prefilled name and zone', async () => {
    const wrapper = await mountDialog({ prefill: { name: 'branch-gw-07', zoneUin: 7 } })

    expect(wrapper.findAll('input[type="text"]')[0].element.value).toBe('branch-gw-07')
    expect(zonePicker(wrapper).attributes('data-value')).toBe('DMZ')
  })

  it('applies a prefilled zone once the zone list arrives', async () => {
    zones.value = ref([])
    const list = zones.value
    const wrapper = await mountDialog({ prefill: { name: 'gw', zoneUin: 7 } })
    expect(zonePicker(wrapper).attributes('data-value')).toBe('')

    list.value = [DMZ]
    await flushPromises()
    expect(zonePicker(wrapper).attributes('data-value')).toBe('DMZ')
  })

  it('opens the new node by default', async () => {
    const wrapper = await mountDialog()
    await fillAndCreate(wrapper, { name: 'node-a' })

    expect(routerPush).toHaveBeenCalledWith({
      name: 'infrastructure',
      params: { objectId: 901 },
    })
    expect(mutateAsync.mock.calls[0][0].creationFlags & 0x0008).toBe(0)
  })

  it('in hand-off mode creates unmanaged, emits the node and does not navigate', async () => {
    const wrapper = await mountDialog({
      handOff: true,
      forceUnmanaged: true,
      header: 'Create Node and Bind Tunnel',
    })
    expect(wrapper.find('.footer').text()).toBe('')

    await fillAndCreate(wrapper, { name: 'node-a' })

    expect(mutateAsync.mock.calls[0][0].creationFlags & 0x0008).toBe(0x0008)
    expect(wrapper.emitted('created')[0][0]).toEqual({
      node: { id: 901, name: 'node-a' },
      unmanaged: false,
    })
    expect(routerPush).not.toHaveBeenCalled()
  })
})
