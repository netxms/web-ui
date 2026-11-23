import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import EppKeyTable from '@/components/epp/EppKeyTable.vue'

function mountTable(props) {
  return mount(EppKeyTable, {
    props: { itemName: 'entry', ...props },
    global: { plugins: [PrimeVue] },
  })
}

const lastValue = (wrapper) => wrapper.emitted('update:modelValue').at(-1)[0]
const bodyRows = (wrapper) =>
  wrapper.findAll('tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()))
const footInputs = (wrapper) => wrapper.findAll('tfoot input')
const addButton = (wrapper) => wrapper.find('button[aria-label="Add entry"]')

describe('EppKeyTable with values', () => {
  const pairs = [{ key: 'site', value: 'riga' }]

  it('lists each key with its value', () => {
    const wrapper = mountTable({ modelValue: pairs, valueLabel: 'Value' })
    expect(bodyRows(wrapper)).toEqual([['site', 'riga', '']])
  })

  it('adds a key and value from the footer and clears it', async () => {
    const wrapper = mountTable({ modelValue: pairs, valueLabel: 'Value' })
    const [key, value] = footInputs(wrapper)
    await key.setValue(' rack ')
    await value.setValue('B4')
    await value.trigger('keyup', { key: 'Enter' })
    expect(lastValue(wrapper)).toEqual([...pairs, { key: 'rack', value: 'B4' }])
    expect(key.element.value).toBe('')
    expect(value.element.value).toBe('')
  })

  it('gives a key already listed the new value in place', async () => {
    const wrapper = mountTable({
      modelValue: [...pairs, { key: 'rack', value: 'A1' }],
      valueLabel: 'Value',
    })
    const [key, value] = footInputs(wrapper)
    await key.setValue('site')
    await value.setValue('tallinn')
    await addButton(wrapper).trigger('click')
    expect(lastValue(wrapper)).toEqual([
      { key: 'site', value: 'tallinn' },
      { key: 'rack', value: 'A1' },
    ])
  })

  it('does not add on Enter in the key field, so the value can follow', async () => {
    const wrapper = mountTable({ modelValue: pairs, valueLabel: 'Value' })
    const [key] = footInputs(wrapper)
    await key.setValue('rack')
    await key.trigger('keyup', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('removes a row', async () => {
    const wrapper = mountTable({ modelValue: pairs, valueLabel: 'Value' })
    await wrapper.find('button[aria-label="Remove entry site"]').trigger('click')
    expect(lastValue(wrapper)).toEqual([])
  })
})

describe('EppKeyTable with keys only', () => {
  it('adds a key on Enter', async () => {
    const wrapper = mountTable({ modelValue: ['a'] })
    const [key] = footInputs(wrapper)
    await key.setValue('b')
    await key.trigger('keyup', { key: 'Enter' })
    expect(lastValue(wrapper)).toEqual(['a', 'b'])
  })

  it('ignores a key already listed and keeps it in the field', async () => {
    const wrapper = mountTable({ modelValue: ['a'] })
    const [key] = footInputs(wrapper)
    await key.setValue('a')
    await key.trigger('keyup', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(key.element.value).toBe('a')
  })

  it('cannot add a blank key', async () => {
    const wrapper = mountTable({ modelValue: [] })
    await footInputs(wrapper)[0].setValue('   ')
    expect(addButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('removes a key', async () => {
    const wrapper = mountTable({ modelValue: ['a', 'b'] })
    await wrapper.find('button[aria-label="Remove entry a"]').trigger('click')
    expect(lastValue(wrapper)).toEqual(['b'])
  })

  it('names the table after its title', () => {
    const wrapper = mountTable({ modelValue: [], title: 'Delete on match' })
    const table = wrapper.find('table')
    const title = wrapper.find(`[id="${table.attributes('aria-labelledby')}"]`)
    expect(title.text()).toBe('Delete on match')
  })
})
