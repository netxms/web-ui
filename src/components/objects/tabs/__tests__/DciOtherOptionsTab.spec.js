import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import DciOtherOptionsTab from '../DciOtherOptionsTab.vue'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

function mountTab(systemTag) {
  const form = reactive({ systemTag, flags: 0, multiplier: 0 })
  const wrapper = mount(DciOtherOptionsTab, {
    props: { form },
    global: { plugins: [PrimeVue], stubs: { ObjectPickerField: true } },
  })
  const interpretation = wrapper
    .findAllComponents(Select)
    .find((s) => s.props('options')?.some((o) => o.value === 'power.feed'))
  const qualifier = wrapper.find('input[placeholder="e.g. A"]')
  return { form, interpretation, qualifier }
}

describe('DciOtherOptionsTab interpretation', () => {
  it('reads a qualified tag as its base tag and feed qualifier', () => {
    const { interpretation, qualifier } = mountTab('power.feed/B')
    expect(interpretation.props('modelValue')).toBe('power.feed')
    expect(qualifier.element.value).toBe('B')
  })

  it('writes the qualifier into the tag, trimmed, and drops the slash when blank', async () => {
    const { form, qualifier } = mountTab('power.feed')
    await qualifier.setValue('A ')
    expect(form.systemTag).toBe('power.feed/A')
    await qualifier.setValue('')
    expect(form.systemTag).toBe('power.feed')
  })

  it('keeps the qualifier when the base tag changes, and clears both on Other', async () => {
    const { form, interpretation, qualifier } = mountTab('power.feed/A')
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
    const { interpretation } = mountTab('eed.ren')
    expect(interpretation.props('modelValue')).toBe('eed.ren')
    expect(interpretation.props('options').at(-1)).toEqual({ value: 'eed.ren', label: 'eed.ren' })
  })
})
