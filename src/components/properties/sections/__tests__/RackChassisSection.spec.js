import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
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

const containers = {
  326: { id: 326, class: 'Rack', name: 'Rack A', rackHeight: 42 },
  500: { id: 500, class: 'Chassis', name: 'Chassis A' },
}

vi.mock('@/queries/useObjectQueries', () => ({
  useObject: (id) => ({
    data: ref(containers[typeof id === 'object' ? id.value : id] ?? null),
  }),
  useRackLayout: () => ({
    data: ref({ rackId: 326, name: 'Rack A', height: 42, topBottomNumbering: false, elements: [] }),
  }),
}))

const RackChassisSection = (await import('../RackChassisSection.vue')).default

const ObjectPickerInputStub = {
  name: 'ObjectPickerInput',
  props: [
    'modelValue',
    'label',
    'emptyLabel',
    'dialogTitle',
    'selectable',
    'displayFilter',
    'required',
  ],
  emits: ['update:modelValue'],
  template: '<div class="picker-stub" />',
}

function mountSection(placement, objectClass = 'Node') {
  const draft = { id: 27710, class: objectClass, physicalPlacement: placement }
  const wrapper = mount(RackChassisSection, {
    props: {
      draft,
      object: { id: 27710, class: objectClass, name: 'sw-01' },
      sectionId: 'rack-chassis',
      sectionLabel: 'Rack / Chassis',
    },
    global: {
      plugins: [PrimeVue],
      stubs: { ObjectPickerInput: ObjectPickerInputStub, ImagePickerButton: true },
    },
  })
  return { wrapper, draft }
}

function placement(overrides = {}) {
  return {
    containerId: 0,
    position: 0,
    height: 1,
    orientation: 0,
    imageFront: null,
    imageRear: null,
    chassisPlacement: null,
    ...overrides,
  }
}

describe('RackChassisSection', () => {
  it('shows only the container picker when nothing is placed', () => {
    const { wrapper } = mountSection(placement())
    expect(wrapper.find('.picker-stub').exists()).toBe(true)
    expect(wrapper.find('[data-test="rack-fields"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="chassis-fields"]').exists()).toBe(false)
  })

  it('limits the picker tree to racks and chassis for a node', () => {
    const { wrapper } = mountSection(placement())
    const { displayFilter } = wrapper.findComponent({ name: 'ObjectPickerInput' }).props()
    expect(['Rack', 'Chassis'].filter((c) => displayFilter({ class: c }))).toHaveLength(2)
    for (const c of ['Node', 'Container', 'Collector', 'Subnet']) {
      expect(displayFilter({ class: c })).toBe(false)
    }
  })

  it('limits the picker tree to racks for a chassis', () => {
    const { wrapper } = mountSection(placement(), 'Chassis')
    const { displayFilter } = wrapper.findComponent({ name: 'ObjectPickerInput' }).props()
    expect(displayFilter({ class: 'Rack' })).toBe(true)
    expect(displayFilter({ class: 'Chassis' })).toBe(false)
  })

  it('shows rack fields for a rack container', () => {
    const { wrapper } = mountSection(placement({ containerId: 326, position: 6, height: 2 }))
    expect(wrapper.find('[data-test="rack-fields"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chassis-fields"]').exists()).toBe(false)
  })

  it('draws neither field set until the container object resolves', () => {
    const { wrapper } = mountSection(placement({ containerId: 999, position: 6, height: 2 }))
    expect(wrapper.find('[data-test="rack-fields"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="chassis-fields"]').exists()).toBe(false)
  })

  it('shows chassis geometry fields for a chassis container', () => {
    const { wrapper } = mountSection(
      placement({ containerId: 500, chassisPlacement: { width: 10, height: 1, orientation: 1 } }),
    )
    expect(wrapper.find('[data-test="chassis-fields"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rack-fields"]').exists()).toBe(false)
  })

  it('shows rack fields for a Chassis object, which can only go in a rack', () => {
    const { wrapper } = mountSection(placement({ containerId: 326, position: 4 }), 'Chassis')
    expect(wrapper.find('[data-test="rack-fields"]').exists()).toBe(true)
  })

  it('bounds the position spinner by the rack height and the element height', () => {
    // Bottom-up rack: position names the element's top unit.
    const { wrapper } = mountSection(placement({ containerId: 326, position: 6, height: 2 }))
    expect(wrapper.vm.positionBounds).toEqual({ min: 2, max: 42 })
  })

  it('warns when the element does not fit in the rack', () => {
    // The server rejects the same extent with 400.
    const { wrapper } = mountSection(placement({ containerId: 326, position: 2, height: 4 }))
    expect(wrapper.find('[data-test="extent-warning"]').exists()).toBe(true)
  })

  it('seeds chassis geometry when a node is moved into a chassis', () => {
    const { wrapper, draft } = mountSection(placement())
    wrapper.vm.onContainerChange({ id: 500, class: 'Chassis', name: 'Chassis A' })
    expect(draft.physicalPlacement.containerId).toBe(500)
    expect(draft.physicalPlacement.chassisPlacement).toMatchObject({ orientation: 1 })
  })

  it('clears the container without wiping the stored geometry', () => {
    const { wrapper, draft } = mountSection(placement({ containerId: 326, position: 6, height: 2 }))
    wrapper.vm.onContainerChange(null)
    expect(draft.physicalPlacement.containerId).toBe(0)
    expect(draft.physicalPlacement.height).toBe(2)
  })
})
