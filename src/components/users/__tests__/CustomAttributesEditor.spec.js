import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import CustomAttributesEditor from '../CustomAttributesEditor.vue'

function mountEditor(modelValue = {}) {
  return mount(CustomAttributesEditor, {
    props: { modelValue },
    global: { plugins: [PrimeVue] },
  })
}

const addButton = (wrapper) => wrapper.find('button[aria-label="Add custom attribute"]')
const nameInput = (wrapper) => wrapper.find('tfoot input[placeholder="Name"]')

describe('CustomAttributesEditor add row', () => {
  it('flags an empty name and clears the hint once the user types', async () => {
    const wrapper = mountEditor()

    await addButton(wrapper).trigger('click')
    expect(wrapper.find('.add-error').text()).toBe('Name is required')
    expect(wrapper.find('tfoot').classes()).toContain('has-error')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await nameInput(wrapper).setValue('l')
    expect(wrapper.find('.add-error').exists()).toBe(false)
    expect(wrapper.find('tfoot').classes()).not.toContain('has-error')
  })

  it('adds the attribute once a name is given', async () => {
    const wrapper = mountEditor({ owner: 'ops' })

    await nameInput(wrapper).setValue('site')
    await wrapper.find('tfoot input[placeholder="Value"]').setValue('riga')
    await addButton(wrapper).trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[{ owner: 'ops', site: 'riga' }]])
    expect(wrapper.find('.add-error').exists()).toBe(false)
  })
})
