import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import PrimeVue from 'primevue/config'

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

const createMutate = vi.fn()
const updateMutate = vi.fn()

vi.mock('@/queries/useBusinessServiceQueries', () => ({
  useCreateBusinessServiceCheck: () => ({ mutate: createMutate, isPending: ref(false) }),
  useUpdateBusinessServiceCheck: () => ({ mutate: updateMutate, isPending: ref(false) }),
}))
vi.mock('@/queries/useObjectQueries', () => ({
  useObject: () => ({ data: ref({ id: 7, name: 'server1' }) }),
  useDciCurrentValues: () => ({
    data: ref({ values: [{ id: 3, name: 'System.CPU.Usage', description: 'CPU usage' }] }),
    isLoading: ref(false),
  }),
}))

const { default: BusinessServiceCheckDialog } = await import('../BusinessServiceCheckDialog.vue')

/** Renders the picker as a button that "picks" object 8, the way the real one emits. */
const ObjectPickerFieldStub = defineComponent({
  props: { modelValue: { type: Number, default: 0 } },
  emits: ['update:modelValue'],
  setup(_props, { emit }) {
    return () =>
      h('button', { class: 'pick-object', onClick: () => emit('update:modelValue', 8) }, 'pick')
  },
})

const dciCheck = {
  id: 12,
  serviceId: 100,
  type: 'dci',
  description: 'CPU',
  relatedObjectId: 7,
  relatedDciId: 3,
  statusThreshold: 3,
  script: '',
  status: 0,
  failureReason: '',
  prototypeServiceId: 0,
  prototypeCheckId: 0,
  autoCreated: false,
}

function mountDialog(props) {
  return mount(BusinessServiceCheckDialog, {
    props: { visible: true, serviceId: 100, ...props },
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
        NxslScriptEditor: true,
        ObjectPickerField: ObjectPickerFieldStub,
      },
    },
  })
}

const button = (wrapper, label) => wrapper.findAll('button').find((b) => b.text() === label)

beforeEach(() => vi.clearAllMocks())

describe('BusinessServiceCheckDialog', () => {
  it('keeps the DCI of a DCI check it opens, and saves the whole check with PATCH', async () => {
    const wrapper = mountDialog({ check: dciCheck })

    await button(wrapper, 'Save').trigger('click')

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const [{ objectId, checkId, data }] = updateMutate.mock.calls[0]
    expect({ objectId, checkId }).toEqual({ objectId: 100, checkId: 12 })
    expect(data).toEqual({
      type: 'dci',
      description: 'CPU',
      relatedObjectId: 7,
      relatedDciId: 3,
      statusThreshold: 3,
      script: null,
    })
  })

  it('keeps the DCI when reopened on a check of another object', async () => {
    const wrapper = mountDialog({ check: dciCheck })
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({
      check: { ...dciCheck, id: 13, relatedObjectId: 9, relatedDciId: 5 },
      visible: true,
    })

    await button(wrapper, 'Save').trigger('click')

    expect(updateMutate.mock.calls[0][0].data).toMatchObject({
      relatedObjectId: 9,
      relatedDciId: 5,
    })
  })

  it('clears the DCI when another object is picked, and then refuses to save', async () => {
    const wrapper = mountDialog({ check: dciCheck })

    await wrapper.find('.pick-object').trigger('click')
    await button(wrapper, 'Save').trigger('click')

    expect(updateMutate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Select a DCI')
  })

  it('refuses a new object check without an object', async () => {
    const wrapper = mountDialog({ check: null })

    await button(wrapper, 'Create').trigger('click')

    expect(createMutate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Select the object to check')
  })

  it('offers only Close for a check created automatically', () => {
    const wrapper = mountDialog({
      check: { ...dciCheck, autoCreated: true, prototypeServiceId: 100 },
      readonly: true,
      readonlyReason: 'Created by auto-binding',
    })

    expect(button(wrapper, 'Close')).toBeTruthy()
    expect(button(wrapper, 'Save')).toBeUndefined()
    expect(wrapper.text()).toContain('Created by auto-binding')
  })
})
