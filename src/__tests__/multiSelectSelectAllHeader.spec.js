import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import MultiSelect from 'primevue/multiselect'

/*
 * multiselect.css labels the toggle-all checkbox through a global CSS rule keyed on this markup
 * (PrimeVue has no prop or slot for it). If a PrimeVue upgrade reshapes the header, the label
 * disappears silently and only this test says so.
 */

const options = [
  { label: 'Node', value: 2 },
  { label: 'Subnet', value: 3 },
]

function openPanel(props) {
  const wrapper = mount(MultiSelect, {
    props: { options, optionLabel: 'label', optionValue: 'value', ...props },
    global: { plugins: [PrimeVue] },
    attachTo: document.body,
  })
  return wrapper
    .get('.p-multiselect')
    .trigger('click')
    .then(() => wrapper)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('MultiSelect toggle-all header', () => {
  it('renders a lone checkbox in the header when the MultiSelect has no filter', async () => {
    await openPanel()
    const header = document.querySelector('.p-multiselect-header')
    expect(header).not.toBeNull()
    expect(header.querySelector('.p-checkbox')).not.toBeNull()
    expect(header.querySelector('.p-multiselect-filter-container')).toBeNull()
  })

  it('renders the filter container alongside the checkbox when filtering is on', async () => {
    await openPanel({ filter: true })
    const header = document.querySelector('.p-multiselect-header')
    expect(header.querySelector('.p-checkbox')).not.toBeNull()
    expect(header.querySelector('.p-multiselect-filter-container')).not.toBeNull()
  })

  it('renders no header at all when toggle-all is disabled', async () => {
    await openPanel({ showToggleAll: false })
    expect(document.querySelector('.p-multiselect-header')).toBeNull()
  })
})
