import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const { mutateAsync, updateGroup, toastAdd } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  updateGroup: vi.fn(),
  toastAdd: vi.fn(),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/queries/useObjectQueries', () => ({
  useCreateObject: () => ({ mutateAsync, isPending: ref(false) }),
}))
vi.mock('@/queries/useDataCenterQueries', () => ({
  useUpdateDataCenterGroup: () => ({ mutateAsync: updateGroup }),
}))

const CreateDataCenterObjectDialog = (await import('../CreateDataCenterObjectDialog.vue')).default

const ShellStub = defineComponent({
  props: { visible: Boolean, header: String, isValid: Boolean },
  emits: ['create', 'update:visible'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { class: 'shell' }, [
        h('h2', props.header),
        slots.default?.(),
        h('button', { class: 'create-btn', onClick: () => emit('create') }, 'Create'),
      ])
  },
})

async function mountDialog(objectClass, parentObject = { id: 2090000001, class: 'Facility' }) {
  const wrapper = mount(CreateDataCenterObjectDialog, {
    props: { visible: false, parentObject, objectClass },
    global: { plugins: [PrimeVue], stubs: { CreateDialogShell: ShellStub } },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

async function create(wrapper, name) {
  await wrapper.find('input[type="text"]').setValue(name)
  await wrapper.find('.create-btn').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({ id: 2080000001, class: 'Room' })
  updateGroup.mockReset()
  updateGroup.mockResolvedValue({})
  toastAdd.mockReset()
})

describe('CreateDataCenterObjectDialog', () => {
  it('names the class in the header', async () => {
    const wrapper = await mountDialog('PowerDomain')
    expect(wrapper.find('h2').text()).toBe('Create Power Domain')
  })

  it('posts a room without a size, then gives it a 600 mm grid with A1 labels', async () => {
    const wrapper = await mountDialog('Room')
    expect(wrapper.find('.p-inputnumber').exists()).toBe(false)
    await create(wrapper, ' Hall C ')

    expect(mutateAsync).toHaveBeenCalledWith({
      class: 'Room',
      name: 'Hall C',
      parentId: 2090000001,
      roomType: 'COMPUTER_ROOM',
    })
    expect(updateGroup).toHaveBeenCalledWith({
      id: 2080000001,
      group: 'room',
      payload: { gridTileSize: 600, gridLabels: 'LETTERS_NUMBERS' },
    })
    expect(wrapper.emitted('created')[0]).toEqual([{ id: 2080000001, class: 'Room' }])
  })

  it('still hands over a room whose grid could not be set, with a warning', async () => {
    updateGroup.mockRejectedValue(new Error('Access denied'))
    const wrapper = await mountDialog('Room')
    await create(wrapper, 'Hall D')

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Room created without a floor grid' }),
    )
    expect(wrapper.emitted('created')).toHaveLength(1)
  })

  it('sets no grid on the other classes', async () => {
    mutateAsync.mockResolvedValue({ id: 2080000002, class: 'CoolingZone' })
    const wrapper = await mountDialog('CoolingZone')
    await create(wrapper, 'Zone 2')
    expect(updateGroup).not.toHaveBeenCalled()
    expect(wrapper.emitted('created')).toHaveLength(1)
  })

  it('sends a typed feed tag and leaves an empty one out', async () => {
    const wrapper = await mountDialog('PowerDomain')
    const [, , feedTag] = wrapper.findAll('input[type="text"]')
    await feedTag.setValue('B')
    await create(wrapper, 'PDU-B3')

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      class: 'PowerDomain',
      domainType: 'OTHER',
      feedTag: 'B',
      ratedPower: 0,
    })

    const facility = await mountDialog('Facility', { id: 2, class: 'ServiceRoot' })
    await create(facility, 'DC-Beta')
    expect(mutateAsync.mock.calls[1][0]).toEqual({
      class: 'Facility',
      name: 'DC-Beta',
      parentId: 2,
      settlementLag: 5,
    })
  })

  it('does not post without a name', async () => {
    const wrapper = await mountDialog('CoolingZone')
    await wrapper.find('.create-btn').trigger('click')
    await flushPromises()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
