import { describe, it, expect, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))

const CustomAttributesSection = (await import('../CustomAttributesSection.vue')).default

function mountSection(customAttributes = []) {
  const draft = reactive({ id: 100, customAttributes })
  const wrapper = mount(CustomAttributesSection, {
    props: {
      draft,
      object: { id: 100, class: 'Node', name: 'sw-01' },
      sectionId: 'custom-attributes',
      sectionLabel: 'Custom Attributes',
    },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
  return { wrapper, draft }
}

const addButton = (wrapper) => wrapper.find('button[aria-label="Add custom attribute"]')
const nameInput = (wrapper) => wrapper.find('tfoot input[placeholder="Name"]')

describe('CustomAttributesSection add row', () => {
  it('flags an empty name and clears the hint once the user types', async () => {
    const { wrapper, draft } = mountSection()

    await addButton(wrapper).trigger('click')
    expect(wrapper.find('.add-error').text()).toBe('Name is required')
    expect(wrapper.find('tfoot').classes()).toContain('has-error')
    expect(draft.customAttributes).toEqual([])

    await nameInput(wrapper).setValue('r')
    expect(wrapper.find('.add-error').exists()).toBe(false)
    expect(wrapper.find('tfoot').classes()).not.toContain('has-error')
  })

  it('adds an own attribute once a name is given', async () => {
    const { wrapper, draft } = mountSection()

    await nameInput(wrapper).setValue('rack')
    await wrapper.find('tfoot input[placeholder="Value"]').setValue('B2')
    await addButton(wrapper).trigger('click')

    expect(draft.customAttributes).toEqual([
      {
        name: 'rack',
        value: 'B2',
        flags: { inheritable: false, redefined: false, conflict: false },
        sourceObject: 0,
      },
    ])
  })
})
