import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppTable from '@/components/epp/EppTable.vue'

const rules = ['a', 'b', 'c', 'd'].map((guid) => ({ guid, comments: `Rule ${guid}`, flags: 0 }))

function mountTable(props) {
  return mount(EppTable, {
    props: { rules, ...props },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

function rowCell(wrapper, guid, selector) {
  return wrapper.find(`tr[data-rule-guid="${guid}"] ${selector}`)
}

function lastEmitted(wrapper, name) {
  const events = wrapper.emitted(name)
  return events ? events[events.length - 1][0] : undefined
}

describe('EppTable row clicks', () => {
  it('expands on a plain click', async () => {
    const wrapper = mountTable()
    await rowCell(wrapper, 'b', '.epp-table__td-desc').trigger('click')
    expect([...lastEmitted(wrapper, 'expansion-change')]).toEqual(['b'])
    expect(wrapper.emitted('selection-change')).toBeUndefined()
  })

  it.each([
    ['description', '.epp-table__td-desc'],
    ['actions', '.epp-table__td-actions'],
    ['expander', '.epp-table__expander-btn'],
  ])('ctrl-click on the %s selects instead of expanding', async (_, selector) => {
    const wrapper = mountTable()
    await rowCell(wrapper, 'b', selector).trigger('click', { ctrlKey: true })
    expect([...lastEmitted(wrapper, 'selection-change')]).toEqual(['b'])
    expect(wrapper.emitted('expansion-change')).toBeUndefined()
  })

  it('cmd-click toggles a selected rule off', async () => {
    const wrapper = mountTable({ selectedIds: new Set(['a', 'b']) })
    await rowCell(wrapper, 'b', '.epp-table__td-desc').trigger('click', { metaKey: true })
    expect([...lastEmitted(wrapper, 'selection-change')]).toEqual(['a'])
  })

  it('shift-click selects the range from the last clicked rule', async () => {
    const wrapper = mountTable()
    await rowCell(wrapper, 'a', '.epp-table__td-desc').trigger('click', { ctrlKey: true })
    await wrapper.setProps({ selectedIds: lastEmitted(wrapper, 'selection-change') })
    await rowCell(wrapper, 'c', '.epp-table__td-desc').trigger('click', { shiftKey: true })
    expect([...lastEmitted(wrapper, 'selection-change')]).toEqual(['a', 'b', 'c'])
    expect(wrapper.emitted('expansion-change')).toBeUndefined()
  })
})
