import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ColumnChooser from '../ColumnChooser.vue'

const COLUMNS = [
  { id: 'state', label: 'State', mandatory: true },
  { id: 'node', label: 'Node' },
  { id: 'address', label: 'IP Address' },
  { id: 'hostname', label: 'Hostname' },
]

function mountChooser(modelValue, extraProps = {}) {
  return mount(ColumnChooser, {
    props: { columns: COLUMNS, modelValue, ...extraProps },
    attachTo: document.body,
    global: { plugins: [PrimeVue] },
  })
}

/** The popover teleports to the body, so its controls are found there. */
function checkbox(label) {
  const labelEl = [...document.body.querySelectorAll('label')].find(
    (l) => l.textContent.trim() === label,
  )
  return document.getElementById(labelEl.getAttribute('for'))
}

/** Option labels in the order the list shows them. */
const listedLabels = () =>
  [...document.body.querySelectorAll('.column-chooser-option label')].map((l) =>
    l.textContent.trim(),
  )

function button(label) {
  return [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
}

async function open(wrapper) {
  await wrapper.find('button').trigger('click')
  await new Promise((resolve) => setTimeout(resolve))
}

describe('ColumnChooser', () => {
  it('counts the shown columns, mandatory ones included', () => {
    const wrapper = mountChooser(['node'])
    expect(wrapper.find('button').text()).toBe('Columns (2)')
    wrapper.unmount()
  })

  it('ignores ids the catalog does not have', () => {
    const wrapper = mountChooser(['node', 'gone'])
    expect(wrapper.find('button').text()).toBe('Columns (2)')
    wrapper.unmount()
  })

  it('stages ticks and emits them only on Apply', async () => {
    const wrapper = mountChooser(['node'])
    await open(wrapper)

    checkbox('Hostname').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    button('Apply').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(['node', 'hostname'])
    wrapper.unmount()
  })

  it('drops staged ticks on Cancel', async () => {
    const wrapper = mountChooser(['node'])
    await open(wrapper)

    checkbox('Hostname').click()
    button('Cancel').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps a mandatory column ticked and disabled', async () => {
    const wrapper = mountChooser([])
    await open(wrapper)

    const state = checkbox('State')
    expect(state.checked).toBe(true)
    expect(state.disabled).toBe(true)
    wrapper.unmount()
  })

  it('Hide all keeps only the mandatory columns', async () => {
    const wrapper = mountChooser(COLUMNS.map((c) => c.id))
    await open(wrapper)

    checkbox('Show all / Hide all').click()
    button('Apply').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(['state'])
    wrapper.unmount()
  })

  it('has no order controls unless the order is bound', async () => {
    const wrapper = mountChooser(['node'])
    await open(wrapper)
    expect(button('Restore default order')).toBeUndefined()
    wrapper.unmount()
  })

  it('lists the columns in the bound order and restores the default on Apply', async () => {
    const wrapper = mountChooser(['node'], { order: ['hostname', 'state', 'node', 'address'] })
    await open(wrapper)
    expect(listedLabels()).toEqual(['Hostname', 'State', 'Node', 'IP Address'])

    button('Restore default order').click()
    await wrapper.vm.$nextTick()
    expect(listedLabels()).toEqual(['State', 'Node', 'IP Address', 'Hostname'])
    expect(wrapper.emitted('update:order')).toBeUndefined()

    button('Apply').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:order')[0][0]).toEqual([])
    wrapper.unmount()
  })

  it('disables Restore default order while the order is the default', async () => {
    const wrapper = mountChooser(['node'], { order: [] })
    await open(wrapper)
    expect(button('Restore default order').disabled).toBe(true)

    button('Apply').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:order')).toBeUndefined()
    wrapper.unmount()
  })
})
