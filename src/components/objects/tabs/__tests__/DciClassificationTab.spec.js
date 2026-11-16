import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import DciClassificationTab from '../DciClassificationTab.vue'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const ObjectPickerFieldStub = {
  name: 'ObjectPickerField',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="picker-stub" />',
}

function mountTab(fields, dciType = 'item') {
  const form = reactive({ systemTag: '', userTag: '', aiHint: '', comments: '', ...fields })
  const wrapper = mount(DciClassificationTab, {
    props: { form, dciType },
    global: { plugins: [PrimeVue], stubs: { ObjectPickerField: ObjectPickerFieldStub } },
  })
  const interpretation = wrapper
    .findAllComponents(Select)
    .find((s) => s.props('options')?.some((o) => o.value === 'power.feed'))
  const qualifier = wrapper.find('input[placeholder="e.g. A"]')
  return { form, wrapper, interpretation, qualifier }
}

describe('DciClassificationTab interpretation', () => {
  it('shows "Other" for an untagged DCI', () => {
    for (const systemTag of ['', null, undefined]) {
      const { interpretation } = mountTab({ systemTag })
      expect(interpretation.find('.p-select-label').text()).toBe('Other')
    }
  })

  it('reads a qualified tag as its base tag and feed qualifier', () => {
    const { interpretation, qualifier } = mountTab({ systemTag: 'power.feed/B' })
    expect(interpretation.props('modelValue')).toBe('power.feed')
    expect(interpretation.find('.p-select-label').text()).toBe('Power - Feed power')
    expect(qualifier.element.value).toBe('B')
  })

  it('writes the qualifier into the tag, trimmed, and drops the slash when blank', async () => {
    const { form, qualifier } = mountTab({ systemTag: 'power.feed' })
    await qualifier.setValue('A ')
    expect(form.systemTag).toBe('power.feed/A')
    await qualifier.setValue('')
    expect(form.systemTag).toBe('power.feed')
  })

  it('keeps the qualifier when the base tag changes, and clears both on Other', async () => {
    const { form, interpretation, qualifier } = mountTab({ systemTag: 'power.feed/A' })
    interpretation.vm.$emit('update:modelValue', 'power.in')
    await nextTick()
    expect(form.systemTag).toBe('power.in/A')

    interpretation.vm.$emit('update:modelValue', '')
    await nextTick()
    expect(form.systemTag).toBe('')
    expect(qualifier.element.value).toBe('')
    expect(qualifier.attributes('disabled')).toBeDefined()
  })

  it('offers a base tag outside the vocabulary as itself, so a save keeps it', () => {
    const { interpretation } = mountTab({ systemTag: 'eed.ren' })
    expect(interpretation.props('modelValue')).toBe('eed.ren')
    expect(interpretation.props('options').at(-1)).toEqual({ value: 'eed.ren', label: 'eed.ren' })
  })

  it('has no interpretation for a table DCI, as legacy', () => {
    const { interpretation, qualifier } = mountTab({ systemTag: '' }, 'table')
    expect(interpretation).toBeUndefined()
    expect(qualifier.exists()).toBe(false)
  })
})

describe('DciClassificationTab related object', () => {
  it('edits the related object when the server sends it', async () => {
    const { form, wrapper } = mountTab({ relatedObject: 42 })
    const picker = wrapper.findComponent({ name: 'ObjectPickerField' })
    expect(picker.props('modelValue')).toBe(42)
    picker.vm.$emit('update:modelValue', 7)
    await nextTick()
    expect(form.relatedObject).toBe(7)
    expect(wrapper.text()).not.toContain('Needs a newer server version')
  })

  it('is under construction when the server does not send it', () => {
    const { form, wrapper } = mountTab({})
    expect(wrapper.text()).toContain('Needs a newer server version')
    expect('relatedObject' in form).toBe(false)
  })

  it('is offered for table DCIs too', () => {
    const { wrapper } = mountTab({ relatedObject: 0 }, 'table')
    expect(wrapper.findComponent({ name: 'ObjectPickerField' }).exists()).toBe(true)
  })
})
