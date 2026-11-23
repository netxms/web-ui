import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import EppPickTable from '@/components/epp/EppPickTable.vue'

const items = [
  { key: 28, label: 'SYS_IF_UP' },
  { key: 29, label: 'SYS_IF_DOWN' },
]

function mountTable(props, slots) {
  return mount(EppPickTable, {
    props: {
      items,
      column: 'Event',
      emptyText: 'Any event',
      addLabel: 'Pick events...',
      itemName: 'event',
      ...props,
    },
    slots,
    global: { plugins: [PrimeVue] },
  })
}

const cells = (wrapper) => wrapper.findAll('tbody td').map((td) => td.text())

describe('EppPickTable', () => {
  it('lists each item', () => {
    expect(cells(mountTable())).toEqual(['SYS_IF_UP', '', 'SYS_IF_DOWN', ''])
  })

  it('says what an empty list matches', () => {
    expect(cells(mountTable({ items: [] }))).toEqual(['Any event'])
  })

  it('asks for more from the footer', async () => {
    const wrapper = mountTable()
    const add = wrapper.findAll('tfoot button').find((b) => b.text() === 'Pick events...')
    await add.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('removes an item by its key', async () => {
    const wrapper = mountTable()
    await wrapper.find('button[aria-label="Remove event SYS_IF_DOWN"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[29]])
  })

  it('draws an item through the slot', () => {
    const wrapper = mountTable({}, { item: '<b class="custom">{{ params.item.key }}</b>' })
    expect(wrapper.findAll('.custom').map((b) => b.text())).toEqual(['28', '29'])
  })

  it('names the table after its title', () => {
    const wrapper = mountTable({ title: 'Exclusions' })
    const table = wrapper.find('table')
    const title = wrapper.find(`[id="${table.attributes('aria-labelledby')}"]`)
    expect(title.text()).toBe('Exclusions')
  })
})
