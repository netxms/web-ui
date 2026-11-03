import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import PrimeVue from 'primevue/config'
import AppTable from '@/components/common/AppTable.vue'

const columns = [{ id: 'name', field: 'name', label: 'Name' }]
const rows = [{ id: 1, name: 'router1' }]

function mountTable(props) {
  return mount(AppTable, {
    props: { columns, rows: [], ...props },
    global: { plugins: [PrimeVue] },
  })
}

describe('AppTable error state', () => {
  it('shows the error message and Retry button instead of the empty state', () => {
    const wrapper = mountTable({ error: { message: 'Request failed: 500' } })
    expect(wrapper.text()).toContain('Request failed: 500')
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('No data')
  })

  it('prioritizes loading over error', () => {
    const wrapper = mountTable({ error: { message: 'Request failed: 500' }, loading: true })
    expect(wrapper.text()).toContain('Loading')
    expect(wrapper.text()).not.toContain('Request failed: 500')
  })

  it('shows rows normally when there is no error', () => {
    const wrapper = mountTable({ rows })
    expect(wrapper.text()).toContain('router1')
  })

  it('emits retry when the Retry button is clicked', async () => {
    const wrapper = mountTable({ error: { message: 'Request failed: 500' } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})

describe('AppTable cells', () => {
  const twoColumns = [
    { id: 'name', field: 'name', label: 'Name' },
    { id: 'size', field: 'size', label: 'Size' },
  ]

  it('shows the field, or "--" without one, when there is no cell slot', () => {
    const wrapper = mountTable({ columns: twoColumns, rows: [{ id: 1, name: 'router1' }] })

    expect(wrapper.findAll('tbody td').map((td) => td.text())).toEqual(['router1', '--'])
  })

  it('shows the field for a column the cell slot renders nothing for', () => {
    const Host = defineComponent({
      components: { AppTable },
      setup: () => ({ columns: twoColumns, rows: [{ id: 1, name: 'router1', size: 42 }] }),
      template: `
        <AppTable :columns="columns" :rows="rows">
          <template #cell="{ col, row }"><b v-if="col.id === 'name'">{{ row.name }}!</b></template>
        </AppTable>
      `,
    })
    const wrapper = mount(Host, { global: { plugins: [PrimeVue] } })

    expect(wrapper.findAll('tbody td').map((td) => td.text())).toEqual(['router1!', '42'])
  })
})

describe('AppTable pagination on live data refresh', () => {
  const columns2 = [{ id: 'name', field: 'name', label: 'Name' }]

  function makeRows(count) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `row${i + 1}` }))
  }

  function goToPage2(wrapper) {
    const paginator = wrapper.findComponent({ name: 'Paginator' })
    return paginator.vm.$emit('update:first', 20)
  }

  it('does not reset to page 0 when a same-length rows array is passed with a new reference', async () => {
    const wrapper = mount(AppTable, {
      props: { columns: columns2, rows: makeRows(40), pageSize: 20, compact: true },
      global: { plugins: [PrimeVue] },
    })

    await goToPage2(wrapper)
    expect(wrapper.text()).toContain('row21')
    expect(wrapper.text()).not.toContain('row1 ')

    // Simulates a polling refetch with unchanged data.
    await wrapper.setProps({ rows: makeRows(40) })

    expect(wrapper.text()).toContain('row21')
  })

  it('clamps back to a valid page instead of blanking when rows shrink below the current page', async () => {
    const wrapper = mount(AppTable, {
      props: { columns: columns2, rows: makeRows(40), pageSize: 20, compact: true },
      global: { plugins: [PrimeVue] },
    })

    await goToPage2(wrapper)
    expect(wrapper.text()).toContain('row21')

    await wrapper.setProps({ rows: makeRows(5) })

    expect(wrapper.text()).toContain('row1')
    expect(wrapper.text()).not.toContain('No data')
  })
})

describe('AppTable clickable rows', () => {
  const clickableClass = 'app-table--clickable-rows'

  it('does not mark rows clickable when nothing happens on click', () => {
    const wrapper = mountTable({ rows })
    expect(wrapper.find('table').classes()).not.toContain(clickableClass)
  })

  it('marks rows clickable when a row-click listener is bound', () => {
    const wrapper = mountTable({ rows, onRowClick: () => {} })
    expect(wrapper.find('table').classes()).toContain(clickableClass)
  })

  it('marks rows clickable when rows navigate or expand', () => {
    expect(
      mountTable({ rows, targetFor: () => ({ name: 'logs' }) })
        .find('table')
        .classes(),
    ).toContain(clickableClass)
    expect(mountTable({ rows, expandable: true }).find('table').classes()).toContain(clickableClass)
  })
})

describe('AppTable accessibility', () => {
  const sortableColumns = [
    { id: 'name', field: 'name', label: 'Name', sortable: true },
    { id: 'ip', field: 'ip', label: 'IP' },
  ]
  const manyRows = [
    { id: 1, name: 'router1' },
    { id: 2, name: 'router2' },
    { id: 3, name: 'router3' },
  ]

  it('marks sortable headers as focusable and reports the sort direction', async () => {
    const wrapper = mountTable({ columns: sortableColumns, rows: manyRows })
    const [sortable, plain] = wrapper.findAll('thead th')

    expect(sortable.attributes('scope')).toBe('col')
    expect(sortable.attributes('tabindex')).toBe('0')
    expect(sortable.attributes('aria-sort')).toBe('none')

    expect(plain.attributes('tabindex')).toBeUndefined()
    expect(plain.attributes('aria-sort')).toBeUndefined()

    await sortable.trigger('click')
    expect(sortable.attributes('aria-sort')).toBe('ascending')
    await sortable.trigger('click')
    expect(sortable.attributes('aria-sort')).toBe('descending')
  })

  it('sorts from the keyboard', async () => {
    const wrapper = mountTable({ columns: sortableColumns, rows: manyRows })
    const header = wrapper.find('thead th')

    await header.trigger('keydown.enter')
    expect(header.attributes('aria-sort')).toBe('ascending')

    await header.trigger('keydown.space')
    expect(header.attributes('aria-sort')).toBe('descending')
  })

  it('gives clickable rows a single roving tab stop', () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })
    const bodyRows = wrapper.findAll('tbody tr')

    expect(bodyRows.map((r) => r.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('leaves non-clickable rows out of the tab order', () => {
    const wrapper = mountTable({ rows: manyRows })
    expect(wrapper.find('tbody tr').attributes('tabindex')).toBeUndefined()
  })

  it('moves the tab stop with the arrow keys', async () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })

    await wrapper.findAll('tbody tr')[0].trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.findAll('tbody tr').map((r) => r.attributes('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ])

    await wrapper.findAll('tbody tr')[1].trigger('keydown', { key: 'End' })
    expect(wrapper.findAll('tbody tr').map((r) => r.attributes('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
    ])
  })

  it('does not wrap past the ends of the page', async () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })

    await wrapper.findAll('tbody tr')[0].trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.findAll('tbody tr')[0].attributes('tabindex')).toBe('0')
  })

  it('reports expansion state on expandable rows', async () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })
    const row = wrapper.find('tbody tr')

    expect(row.attributes('aria-expanded')).toBe('false')
    await row.trigger('click')
    expect(wrapper.find('tbody tr').attributes('aria-expanded')).toBe('true')
  })

  it('opens a row from outside with expandRow, leaving other open rows alone', async () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })
    await wrapper.find('tbody tr').trigger('click')

    wrapper.vm.expandRow(manyRows[2].id)
    await wrapper.vm.$nextTick()

    const expanded = wrapper
      .findAll('tbody tr[aria-expanded]')
      .map((r) => r.attributes('aria-expanded'))
    expect(expanded).toEqual(['true', 'false', 'true'])
  })

  it('activates a row from the keyboard', async () => {
    const wrapper = mountTable({ rows: manyRows, expandable: true })
    await wrapper.find('tbody tr').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('row-click')).toHaveLength(1)
  })

  it('reports a focused row as hovered, and clears it on blur', async () => {
    const wrapper = mountTable({ rows: manyRows, onRowClick: () => {} })
    const [first, second] = wrapper.findAll('tbody tr')

    await first.trigger('focus')
    expect(wrapper.emitted('row-mouseenter')?.at(-1)).toEqual([manyRows[0]])

    await first.trigger('blur')
    expect(wrapper.emitted('row-mouseleave')?.at(-1)).toEqual([manyRows[0]])

    await second.trigger('focus')
    expect(wrapper.findAll('tbody tr').map((r) => r.attributes('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ])
  })
})

describe('AppTable opening and closing many rows', () => {
  const namedRows = [
    { id: 1, name: 'charlie' },
    { id: 2, name: 'alpha' },
    { id: 3, name: 'bravo' },
  ]

  const collapseAllButton = (wrapper) => wrapper.find('.app-table__collapse-all')
  const expandedNames = (wrapper) =>
    wrapper.findAll('tbody tr[aria-expanded="true"]').map((tr) => tr.findAll('td').at(-1).text())

  it('offers collapse all only while a row on the page is open', async () => {
    const wrapper = mountTable({ rows: namedRows, expandable: true })
    expect(collapseAllButton(wrapper).exists()).toBe(false)

    await wrapper.findAll('tbody tr')[0].trigger('click')

    expect(collapseAllButton(wrapper).attributes('aria-label')).toBe('Collapse all rows')
  })

  it('closes every open row with collapse all', async () => {
    const wrapper = mountTable({ rows: namedRows, expandable: true })
    wrapper.vm.expandRows([1, 2, 3])
    await wrapper.vm.$nextTick()

    await collapseAllButton(wrapper).trigger('click')

    expect(expandedNames(wrapper)).toEqual([])
    expect(collapseAllButton(wrapper).exists()).toBe(false)
  })

  it('opens the first rows the table shows, up to the limit', async () => {
    const wrapper = mountTable({ rows: namedRows, expandable: true, sortField: 'name' })

    const opened = wrapper.vm.expandRows([1, 2, 3], 2)
    await wrapper.vm.$nextTick()

    expect(opened).toBe(2)
    expect(expandedNames(wrapper)).toEqual(['alpha', 'bravo'])
  })
})

describe('AppTable revealRow', () => {
  // The Paginator binds a matchMedia listener once attached to the document; jsdom has none.
  window.matchMedia =
    window.matchMedia ??
    (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))

  function makeRows(count) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `row${i + 1}` }))
  }

  function mountRevealable(props) {
    return mount(AppTable, {
      props: {
        columns,
        rows: makeRows(60),
        pageSize: 25,
        onRowClick: () => {},
        ...props,
      },
      global: { plugins: [PrimeVue] },
      attachTo: document.body,
    })
  }

  const bodyRows = (wrapper) => wrapper.findAll('tbody tr')

  it('switches to the page holding the row and flags it', async () => {
    const wrapper = mountRevealable()

    expect(wrapper.vm.revealRow(55)).toBe(true)
    await wrapper.vm.$nextTick()

    const rows = bodyRows(wrapper)
    expect(rows[0].text()).toBe('row51')
    expect(rows[4].text()).toBe('row55')
    expect(rows[4].classes()).toContain('app-table__row--revealed')
    expect(rows.filter((r) => r.classes().includes('app-table__row--revealed'))).toHaveLength(1)
    wrapper.unmount()
  })

  it('gives the row the tab stop and the focus', async () => {
    const wrapper = mountRevealable()

    wrapper.vm.revealRow(30)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const rows = bodyRows(wrapper)
    expect(rows.map((r) => r.attributes('tabindex')).indexOf('0')).toBe(4)
    expect(document.activeElement).toBe(rows[4].element)
    wrapper.unmount()
  })

  it('leaves the focus in a filter the user is typing in', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const wrapper = mountRevealable()

    wrapper.vm.revealRow(30)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(input)
    wrapper.unmount()
    input.remove()
  })

  it('reports a row that is not in the table', () => {
    const wrapper = mountRevealable()
    expect(wrapper.vm.revealRow(999)).toBe(false)
    wrapper.unmount()
  })
})

describe('AppTable row selection', () => {
  const selectionColumns = [{ id: 'name', field: 'name', label: 'Name' }]

  function makeRows(count) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `row${i + 1}` }))
  }

  function mountSelectable(props) {
    return mount(AppTable, {
      props: {
        columns: selectionColumns,
        rows: makeRows(4),
        selectable: true,
        selectedIds: new Set(),
        ...props,
      },
      global: { plugins: [PrimeVue] },
    })
  }

  /** Index 0 is the select-all in the header. */
  function rowCheckboxes(wrapper) {
    return wrapper.findAll('.app-table__checkbox-td .app-table__checkbox-wrap')
  }

  function headerCheckbox(wrapper) {
    return wrapper.find('.app-table__checkbox-th .app-table__checkbox-wrap')
  }

  it('renders no checkbox column unless selectable', () => {
    const wrapper = mount(AppTable, {
      props: { columns: selectionColumns, rows: makeRows(2) },
      global: { plugins: [PrimeVue] },
    })
    expect(wrapper.find('.app-table__checkbox-td').exists()).toBe(false)
  })

  it('emits the next selection when a row checkbox is clicked', async () => {
    const wrapper = mountSelectable()

    await rowCheckboxes(wrapper)[1].trigger('click')

    const emitted = wrapper.emitted('selection-change')
    expect(emitted).toHaveLength(1)
    expect([...emitted[0][0]]).toEqual([2])
  })

  it('does not emit row-click when the checkbox is clicked', async () => {
    const wrapper = mountSelectable()

    await rowCheckboxes(wrapper)[0].trigger('click')

    expect(wrapper.emitted('row-click')).toBeUndefined()
  })

  it('marks selected rows and reflects them in the checkbox state', () => {
    const wrapper = mountSelectable({ selectedIds: new Set([2]) })

    const selected = wrapper.findAll('.app-table__row--selected')
    expect(selected).toHaveLength(1)
    expect(rowCheckboxes(wrapper)[1].attributes('aria-checked')).toBe('true')
    expect(rowCheckboxes(wrapper)[0].attributes('aria-checked')).toBe('false')
  })

  it('shift-click selects the range from the previously clicked row', async () => {
    const wrapper = mountSelectable()

    await rowCheckboxes(wrapper)[0].trigger('click')
    await wrapper.setProps({ selectedIds: new Set([1]) })
    await rowCheckboxes(wrapper)[2].trigger('click', { shiftKey: true })

    const emitted = wrapper.emitted('selection-change')
    expect([...emitted[emitted.length - 1][0]].sort()).toEqual([1, 2, 3])
  })

  it('select-all covers the current page only', async () => {
    const wrapper = mountSelectable({ rows: makeRows(10), pageSize: 4, compact: true })

    await headerCheckbox(wrapper).trigger('click')

    const emitted = wrapper.emitted('selection-change')
    expect([...emitted[0][0]].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('select-all clears when everything on the page is already selected', async () => {
    const wrapper = mountSelectable({ selectedIds: new Set([1, 2, 3, 4]) })

    expect(headerCheckbox(wrapper).attributes('aria-checked')).toBe('true')
    await headerCheckbox(wrapper).trigger('click')

    expect([...wrapper.emitted('selection-change')[0][0]]).toEqual([])
  })

  it('reports a mixed header state for a partial selection', () => {
    const wrapper = mountSelectable({ selectedIds: new Set([1]) })
    expect(headerCheckbox(wrapper).attributes('aria-checked')).toBe('mixed')
  })

  it('omits the checkbox for rows rowSelectable rejects', () => {
    const wrapper = mountSelectable({ rowSelectable: (row) => row.id !== 2 })

    expect(rowCheckboxes(wrapper)).toHaveLength(3)
  })

  it('excludes unselectable rows from select-all', async () => {
    const wrapper = mountSelectable({ rowSelectable: (row) => row.id !== 2 })

    await headerCheckbox(wrapper).trigger('click')

    expect([...wrapper.emitted('selection-change')[0][0]].sort()).toEqual([1, 3, 4])
  })

  it('keeps the table to one tab stop by roving the checkbox tabindex', () => {
    const wrapper = mountSelectable()
    const tabbable = rowCheckboxes(wrapper).filter((c) => c.attributes('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
  })

  describe('modifier clicks on the row', () => {
    function bodyRows(wrapper) {
      return wrapper.findAll('tbody tr')
    }

    it('ctrl-click toggles the row instead of expanding it or emitting row-click', async () => {
      const wrapper = mountSelectable({ expandable: true, onRowClick: () => {} })

      await bodyRows(wrapper)[1].trigger('click', { ctrlKey: true })

      expect([...wrapper.emitted('selection-change')[0][0]]).toEqual([2])
      expect(wrapper.emitted('row-click')).toBeUndefined()
      expect(wrapper.find('.app-table__expansion-row').exists()).toBe(false)
    })

    it('cmd-click toggles the row too', async () => {
      const wrapper = mountSelectable({ selectedIds: new Set([2]) })

      await bodyRows(wrapper)[1].trigger('click', { metaKey: true })

      expect([...wrapper.emitted('selection-change')[0][0]]).toEqual([])
    })

    it('shift-click selects the range from the previously toggled row', async () => {
      const wrapper = mountSelectable({ expandable: true })

      await bodyRows(wrapper)[0].trigger('click', { ctrlKey: true })
      await wrapper.setProps({ selectedIds: new Set([1]) })
      await bodyRows(wrapper)[2].trigger('click', { shiftKey: true })

      const emitted = wrapper.emitted('selection-change')
      expect([...emitted[emitted.length - 1][0]].sort()).toEqual([1, 2, 3])
      expect(wrapper.find('.app-table__expansion-row').exists()).toBe(false)
    })

    it('ctrl+Enter on a focused row toggles it', async () => {
      const wrapper = mountSelectable({ expandable: true })

      await bodyRows(wrapper)[0].trigger('keydown', { key: 'Enter', ctrlKey: true })

      expect([...wrapper.emitted('selection-change')[0][0]]).toEqual([1])
    })

    it('ignores the gesture on a row rowSelectable rejects', async () => {
      const wrapper = mountSelectable({
        expandable: true,
        rowSelectable: (row) => row.id !== 2,
        onRowClick: () => {},
      })

      await bodyRows(wrapper)[1].trigger('click', { ctrlKey: true })

      expect(wrapper.emitted('selection-change')).toBeUndefined()
      expect(wrapper.emitted('row-click')).toBeUndefined()
      expect(wrapper.find('.app-table__expansion-row').exists()).toBe(false)
    })

    it('ctrl-click on a row with a targetFor opens a new tab instead of selecting', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const wrapper = mountSelectable({ targetFor: () => ({ name: 'logs' }) })

      await bodyRows(wrapper)[1].trigger('click', { ctrlKey: true })

      expect(open).toHaveBeenCalledOnce()
      expect(wrapper.emitted('selection-change')).toBeUndefined()
      open.mockRestore()
    })

    it('shift-click on a row with a targetFor selects instead of navigating', async () => {
      const wrapper = mountSelectable({
        targetFor: () => ({ name: 'logs' }),
        onRowClick: () => {},
      })

      await bodyRows(wrapper)[1].trigger('click', { shiftKey: true })

      expect([...wrapper.emitted('selection-change')[0][0]]).toEqual([2])
      expect(wrapper.emitted('row-click')).toBeUndefined()
    })

    it('leaves a ctrl-click alone in a table without selection', async () => {
      const wrapper = mountSelectable({ selectable: false, expandable: true })

      await bodyRows(wrapper)[0].trigger('click', { ctrlKey: true })

      expect(wrapper.emitted('row-click')).toHaveLength(1)
      expect(wrapper.emitted('selection-change')).toBeUndefined()
    })
  })
})

describe('AppTable column resize', () => {
  const resizeColumns = [
    { id: 'name', field: 'name', label: 'Name', sortable: true },
    { id: 'ip', field: 'ip', label: 'IP', sortable: true },
  ]

  // Attached, so the click reaches window listeners as in a browser.
  function mountAttached(props = {}) {
    return mount(AppTable, {
      props: { columns: resizeColumns, rows, ...props },
      global: { plugins: [PrimeVue] },
      attachTo: document.body,
    })
  }

  /** jsdom has no pointer capture to take. */
  function dragFirstHandle(wrapper) {
    const handle = wrapper.find('thead th .col-resize-handle').element
    handle.setPointerCapture = () => {}
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }))
    handle.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 180 }))
    handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 180 }))
  }

  // Some browsers send the click that ends the drag to the element under the cursor.
  it.each([false, true])(
    'does not sort the header the drag ends over (resizeFit: %s)',
    async (resizeFit) => {
      const wrapper = mountAttached({ resizeFit })
      dragFirstHandle(wrapper)
      const ipHeader = wrapper.findAll('thead th')[1]
      await ipHeader.trigger('click')

      expect(ipHeader.attributes('aria-sort')).toBe('none')
      wrapper.unmount()
    },
  )

  it('reports the widths a drag changed once, when it ends', () => {
    const wrapper = mountAttached()
    dragFirstHandle(wrapper)

    expect(wrapper.emitted('column-resize')).toEqual([[{ name: 230 }]])
    wrapper.unmount()
  })

  it('reports both columns a resizeFit drag trades width between', () => {
    const wrapper = mountAttached({ resizeFit: true })
    dragFirstHandle(wrapper)

    // jsdom lays nothing out, so the amounts are meaningless here.
    const [[widths]] = wrapper.emitted('column-resize')
    expect(Object.keys(widths)).toEqual(['name', 'ip'])
    wrapper.unmount()
  })

  it('sorts on the next click once the drag is over', async () => {
    const wrapper = mountAttached()
    dragFirstHandle(wrapper)
    await new Promise((resolve) => setTimeout(resolve))
    const ipHeader = wrapper.findAll('thead th')[1]
    await ipHeader.trigger('click')

    expect(ipHeader.attributes('aria-sort')).toBe('ascending')
    wrapper.unmount()
  })

  describe('remembering widths', () => {
    const widthOf = (wrapper, index) => wrapper.findAll('col')[index].attributes('style')
    const storedTables = () => JSON.parse(localStorage.getItem('netxms.tables') ?? '{}')

    beforeEach(() => localStorage.clear())

    it('brings a dragged width back on the next mount, over the column default', () => {
      const columns = [{ ...resizeColumns[0], width: 150 }, resizeColumns[1]]
      const first = mountAttached({ columns, storageKey: 'hosts' })
      dragFirstHandle(first)
      first.unmount()

      const second = mountAttached({ columns, storageKey: 'hosts' })
      expect(widthOf(second, 0)).toBe('width: 230px;')
      second.unmount()
    })

    it('keeps other columns dragged earlier when another one is dragged', () => {
      localStorage.setItem('netxms.tables', JSON.stringify({ 'hosts.widths': { ip: 300 } }))
      const wrapper = mountAttached({ storageKey: 'hosts' })
      dragFirstHandle(wrapper)

      expect(storedTables()['hosts.widths']).toEqual({ ip: 300, name: 230 })
      wrapper.unmount()
    })

    it('does not share widths between tables', () => {
      const first = mountAttached({ storageKey: 'hosts' })
      dragFirstHandle(first)
      first.unmount()

      const second = mountAttached({ storageKey: 'routers' })
      expect(widthOf(second, 0)).toBe('width: 150px;')
      second.unmount()
    })

    it('saves nothing for a table with no storage key', () => {
      const wrapper = mountAttached()
      dragFirstHandle(wrapper)

      expect(storedTables()).toEqual({})
      wrapper.unmount()
    })

    it('gives a column hidden and shown again the width it was dragged to', async () => {
      const wrapper = mountAttached({ storageKey: 'hosts' })
      dragFirstHandle(wrapper)
      await wrapper.setProps({ columns: [resizeColumns[1]] })
      await wrapper.setProps({ columns: resizeColumns })

      expect(widthOf(wrapper, 0)).toBe('width: 230px;')
      wrapper.unmount()
    })

    it.each([
      ['a non-object', 'wide'],
      ['a null width', { name: null }],
      ['a text width', { name: 'wide' }],
      ['a width below the minimum', { name: 5 }],
    ])('falls back to the default on %s', (_label, stored) => {
      localStorage.setItem('netxms.tables', JSON.stringify({ 'hosts.widths': stored }))
      const wrapper = mountAttached({ storageKey: 'hosts' })

      expect(widthOf(wrapper, 0)).toBe('width: 150px;')
      wrapper.unmount()
    })
  })
})

describe('AppTable autoWidth', () => {
  const widthColumns = [
    { id: 'name', field: 'name', label: 'Name', width: 200 },
    { id: 'ip', field: 'ip', label: 'IP', width: 100 },
  ]

  function mountWidths(props) {
    return mountTable({ columns: widthColumns, rows, autoWidth: true, ...props })
  }

  it('keeps exact column widths and gives the spare space to a filler column', () => {
    const wrapper = mountWidths()

    expect(wrapper.findAll('col').map((c) => c.attributes('style') ?? '')).toEqual([
      'width: 200px;',
      'width: 100px;',
      '',
    ])
    expect(wrapper.findAll('thead th')).toHaveLength(3)
    expect(wrapper.findAll('tbody td')).toHaveLength(3)
    expect(wrapper.find('table').attributes('style')).toBe('min-width: 300px;')
  })

  it('stretches the columns instead with resizeFit, keeping their widths as the minimum', () => {
    const wrapper = mountWidths({ resizeFit: true })

    expect(wrapper.findAll('col').map((c) => c.attributes('style'))).toEqual([
      'width: 66.66666666666666%;',
      'width: 33.33333333333333%;',
    ])
    expect(wrapper.findAll('thead th')).toHaveLength(2)
    expect(wrapper.findAll('tbody td')).toHaveLength(2)
    expect(wrapper.find('table').attributes('style')).toBe('min-width: 300px;')
    expect(wrapper.find('.app-table-wrap').classes()).not.toContain('app-table-wrap--resize-fit')
  })

  it('counts the expander column in the minimum width', () => {
    const wrapper = mountWidths({ resizeFit: true, expandable: true })

    expect(wrapper.find('table').attributes('style')).toBe('min-width: calc(300px + 2.5rem);')
  })
})

describe('AppTable column reorder', () => {
  const reorderColumns = [
    { id: 'name', field: 'name', label: 'Name', sortable: true },
    { id: 'ip', field: 'ip', label: 'IP', sortable: true },
    { id: 'mac', field: 'mac', label: 'MAC', sortable: true },
    { id: 'actions', field: null, label: '', reorderable: false },
  ]

  // Let the post-drag click guard (dropped on the next task) go before the next test clicks.
  afterEach(() => new Promise((resolve) => setTimeout(resolve)))

  function mountAttached(props = {}) {
    const wrapper = mount(AppTable, {
      props: { columns: reorderColumns, rows, reorderable: true, ...props },
      global: { plugins: [PrimeVue] },
      attachTo: document.body,
    })
    // jsdom has no layout: the headers sit side by side, 100px each.
    wrapper.findAll('thead th').forEach((th, i) => {
      th.element.getBoundingClientRect = () => ({ left: i * 100, right: (i + 1) * 100 })
    })
    return wrapper
  }

  const header = (wrapper, label) =>
    wrapper.findAll('thead th').find((th) => th.text().startsWith(label))

  function drag(wrapper, label, fromX, ...xs) {
    header(wrapper, label).element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: fromX }),
    )
    for (const x of xs) window.dispatchEvent(new MouseEvent('pointermove', { clientX: x }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: xs.at(-1) ?? fromX }))
  }

  it('reports a header dropped on the left half of another as going before it', () => {
    const wrapper = mountAttached()
    drag(wrapper, 'MAC', 250, 200, 20)

    expect(wrapper.emitted('column-move')).toEqual([
      [{ id: 'mac', targetId: 'name', after: false }],
    ])
    wrapper.unmount()
  })

  it('reports a drop past the last movable column as going after it', () => {
    const wrapper = mountAttached()
    drag(wrapper, 'Name', 50, 150, 350)

    expect(wrapper.emitted('column-move')).toEqual([[{ id: 'name', targetId: 'mac', after: true }]])
    wrapper.unmount()
  })

  it('marks where the column will land while it is dragged', async () => {
    const wrapper = mountAttached()
    header(wrapper, 'MAC').element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 250 }),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20 }))
    await wrapper.vm.$nextTick()

    expect(header(wrapper, 'Name').classes()).toContain('app-table__th--drop-before')
    expect(header(wrapper, 'MAC').classes()).toContain('app-table__th--dragging')

    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-table__th--drop-before').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reports nothing for a drop that leaves the column where it is', () => {
    const wrapper = mountAttached()
    drag(wrapper, 'IP', 150, 90)

    expect(wrapper.emitted('column-move')).toBeUndefined()
    wrapper.unmount()
  })

  it('still sorts on a click, and does not sort the header a drag ends over', async () => {
    const wrapper = mountAttached()
    drag(wrapper, 'Name', 50, 52)
    await header(wrapper, 'Name').trigger('click')
    expect(header(wrapper, 'Name').attributes('aria-sort')).toBe('ascending')

    drag(wrapper, 'MAC', 250, 120)
    await header(wrapper, 'IP').trigger('click')
    expect(header(wrapper, 'IP').attributes('aria-sort')).toBe('none')
    wrapper.unmount()
  })

  it('does not start a move from the resize handle', () => {
    const wrapper = mountAttached()
    const handle = header(wrapper, 'MAC').find('.col-resize-handle').element
    handle.setPointerCapture = () => {}
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 299 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20 }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20 }))

    expect(wrapper.emitted('column-move')).toBeUndefined()
    wrapper.unmount()
  })

  it('is off unless asked for', () => {
    const wrapper = mountAttached({ reorderable: false })
    drag(wrapper, 'MAC', 250, 200, 20)

    expect(wrapper.emitted('column-move')).toBeUndefined()
    expect(wrapper.find('th[data-reorder-id]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('AppTable re-rendering', () => {
  // Every cell renders through the consumer's slot, so the rows whose slot ran are the rows a
  // change re-rendered.
  const renderColumns = [
    { id: 'name', field: 'name', label: 'Name' },
    { id: 'size', field: 'size', label: 'Size' },
  ]
  const renderRows = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    name: `row${i + 1}`,
    size: i,
  }))

  function mountHost() {
    const rendered = []
    const Host = defineComponent({
      components: { AppTable },
      setup() {
        const selected = ref(new Set())
        const unit = ref('B')
        function track(row) {
          rendered.push(row.id)
          return ''
        }
        return { columns: renderColumns, rows: renderRows, selected, unit, track }
      },
      template: `
        <AppTable
          :columns="columns"
          :rows="rows"
          selectable
          expandable
          :selected-ids="selected"
          @selection-change="selected = $event"
        >
          <template #cell="{ col, row }">{{ track(row) }}{{ row[col.field] }} {{ unit }}</template>
          <template #expansion="{ row }"><div class="expansion">{{ row.name }}</div></template>
        </AppTable>
      `,
    })
    const wrapper = mount(Host, { global: { plugins: [PrimeVue] } })
    function takeRendered() {
      const ids = [...new Set(rendered)]
      rendered.length = 0
      return ids
    }
    takeRendered()
    return { wrapper, takeRendered }
  }

  const dataRows = (wrapper) => wrapper.findAll('tbody tr[aria-expanded]')

  it('re-renders only the row that was selected', async () => {
    const { wrapper, takeRendered } = mountHost()

    await wrapper.findAll('.app-table__checkbox-td .app-table__checkbox-wrap')[2].trigger('click')

    expect(takeRendered()).toEqual([3])
    expect(dataRows(wrapper)[2].classes()).toContain('app-table__row--selected')
  })

  it('re-renders only the row that was expanded', async () => {
    const { wrapper, takeRendered } = mountHost()

    await dataRows(wrapper)[1].trigger('click')

    expect(takeRendered()).toEqual([2])
    expect(wrapper.find('.expansion').text()).toBe('row2')
  })

  it('re-renders only the two rows the tab stop moves between', async () => {
    const { wrapper, takeRendered } = mountHost()

    await dataRows(wrapper)[0].trigger('keydown', { key: 'ArrowDown' })

    expect(takeRendered()).toEqual([1, 2])
    expect(dataRows(wrapper)[1].attributes('tabindex')).toBe('0')
  })

  it('still re-renders every row when state its cells read changes', async () => {
    const { wrapper, takeRendered } = mountHost()

    wrapper.vm.unit = 'KB'
    await wrapper.vm.$nextTick()

    expect(takeRendered()).toEqual([1, 2, 3, 4, 5])
    expect(dataRows(wrapper)[4].text()).toContain('4 KB')
  })
})
