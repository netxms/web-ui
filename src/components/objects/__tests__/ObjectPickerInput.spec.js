import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'

const ObjectPickerDialogStub = {
  name: 'ObjectPickerDialogStub',
  props: ['visible', 'title', 'perspectives', 'selectable', 'displayFilter'],
  emits: ['update:visible', 'select'],
  template: '<div />',
}

function mountPicker(props = {}) {
  return mount(ObjectPickerInput, {
    props,
    global: {
      plugins: [PrimeVue],
      stubs: { ObjectPickerDialog: ObjectPickerDialogStub },
    },
  })
}

describe('ObjectPickerInput', () => {
  it('shows the empty label when nothing is selected', () => {
    const wrapper = mountPicker({ modelValue: null })
    expect(wrapper.find('input').element.value).toBe('None')
  })

  it('supports a custom empty label (e.g. "Default")', () => {
    const wrapper = mountPicker({ modelValue: null, emptyLabel: 'Default' })
    expect(wrapper.find('input').element.value).toBe('Default')
  })

  it('shows the selected object name', () => {
    const wrapper = mountPicker({ modelValue: { id: 5, name: 'router-core-01' } })
    expect(wrapper.find('input').element.value).toBe('router-core-01')
  })

  it('renders the label only when provided', () => {
    expect(mountPicker({ label: 'Gateway node' }).find('.form-label').exists()).toBe(true)
    expect(mountPicker({}).find('.form-label').exists()).toBe(false)
  })

  it('shows the clear button only when something is selected', () => {
    expect(mountPicker({ modelValue: null }).find('.pi-times').exists()).toBe(false)
    expect(
      mountPicker({ modelValue: { id: 1, name: 'x' } })
        .find('.pi-times')
        .exists(),
    ).toBe(true)
  })

  it('clearing emits update:modelValue with null', async () => {
    const wrapper = mountPicker({ modelValue: { id: 1, name: 'x' } })
    await wrapper.find('.pi-times').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
  })

  it('selecting a node in the picker dialog emits update:modelValue with the full node', async () => {
    const wrapper = mountPicker({ modelValue: null })
    const picker = wrapper.findComponent(ObjectPickerDialogStub)
    const node = { id: 7, name: 'switch-01', class: 'Node' }
    await picker.vm.$emit('select', node)
    expect(wrapper.emitted('update:modelValue')).toEqual([[node]])
  })

  it('preserves extra fields on the selected node (e.g. zoneUIN) instead of narrowing to id/name', async () => {
    const wrapper = mountPicker({ modelValue: null })
    const picker = wrapper.findComponent(ObjectPickerDialogStub)
    const zoneNode = { id: 12, name: 'zone-a', class: 'Zone', zoneUIN: 99 }
    await picker.vm.$emit('select', zoneNode)
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(zoneNode)
  })

  it('clicking the input opens the picker dialog', async () => {
    const wrapper = mountPicker({ modelValue: null })
    expect(wrapper.findComponent(ObjectPickerDialogStub).props('visible')).toBe(false)
    await wrapper.find('input').trigger('click')
    expect(wrapper.findComponent(ObjectPickerDialogStub).props('visible')).toBe(true)
  })

  it('forwards perspectives/selectable/displayFilter/title to the picker dialog', () => {
    const selectable = () => true
    const displayFilter = () => true
    const perspectives = [{ id: 'x', label: 'X', rootId: 1 }]
    const wrapper = mountPicker({
      dialogTitle: 'Select Zone',
      perspectives,
      selectable,
      displayFilter,
    })
    const picker = wrapper.findComponent(ObjectPickerDialogStub)
    expect(picker.props('title')).toBe('Select Zone')
    expect(picker.props('perspectives')).toEqual(perspectives)
    expect(picker.props('selectable')).toBe(selectable)
    expect(picker.props('displayFilter')).toBe(displayFilter)
  })
})
