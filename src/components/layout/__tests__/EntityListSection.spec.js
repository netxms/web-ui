import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AppTable from '@/components/common/AppTable.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import EntityListSection from '@/components/layout/EntityListSection.vue'

const menuShow = vi.fn()

const ContextMenuStub = defineComponent({
  name: 'EntityContextMenu',
  props: { items: { type: Array, required: true } },
  setup(_, { expose }) {
    expose({ show: menuShow })
    return () => h('div')
  },
})

const FilterStub = defineComponent({
  name: 'SmartFilterInput',
  props: { modelValue: Object, placeholder: String },
  emits: ['update:modelValue'],
  setup: () => () => h('input'),
})

const columns = [
  { id: 'name', field: 'name', label: 'Name', width: 180 },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]
const rows = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
]

function mountSection({ props = {}, attrs = {}, slots = {} } = {}) {
  return mount(EntityListSection, {
    props: {
      title: 'Actions',
      filterPlaceholder: 'Filter actions...',
      countNoun: 'action',
      columns,
      rows,
      emptyText: 'No server actions found.',
      menuItems: (row) => [{ label: `Edit ${row.name}` }],
      filter: { text: '', tokens: [] },
      ...props,
    },
    attrs,
    slots: {
      cell: ({ row }) => h('span', { class: 'name-cell' }, row.name),
      ...slots,
    },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, word) => `${n} ${n === 1 ? word : `${word}s`}` },
      stubs: { EntityContextMenu: ContextMenuStub, SmartFilterInput: FilterStub },
    },
  })
}

const buttonLabelled = (wrapper, label) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === label || b.text() === label)

describe('EntityListSection list', () => {
  it('counts the rows it is given', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('2 actions')
  })

  it('offers Add only with a label, and emits add', async () => {
    expect(buttonLabelled(mountSection(), 'Add Action')).toBeUndefined()

    const wrapper = mountSection({ props: { addLabel: 'Add Action' } })
    await buttonLabelled(wrapper, 'Add Action').trigger('click')

    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('emits refresh from the Refresh button and from the table retry', async () => {
    const wrapper = mountSection()

    await buttonLabelled(wrapper, 'Refresh').trigger('click')
    wrapper.findComponent(AppTable).vm.$emit('retry')

    expect(wrapper.emitted('refresh')).toHaveLength(2)
  })

  it('emits row-click with the row', () => {
    const wrapper = mountSection()

    wrapper.findComponent(AppTable).vm.$emit('row-click', rows[1])

    expect(wrapper.emitted('row-click')).toEqual([[rows[1]]])
  })

  it('passes filter changes through v-model:filter', () => {
    const wrapper = mountSection()
    const next = { text: 'al', tokens: [] }

    wrapper.findComponent(FilterStub).vm.$emit('update:modelValue', next)

    expect(wrapper.emitted('update:filter')).toEqual([[next]])
  })

  it('renders the cell slot for its own columns and the menu button for actions', () => {
    const wrapper = mountSection()

    expect(wrapper.findAll('.name-cell').map((c) => c.text())).toEqual(['Alpha', 'Beta'])
    expect(wrapper.findAll('button[aria-label="Actions"]')).toHaveLength(2)
  })

  it('opens the menu with that row’s items from the row button', async () => {
    menuShow.mockClear()
    const wrapper = mountSection()

    await wrapper.findAll('button[aria-label="Actions"]')[1].trigger('click')

    expect(menuShow).toHaveBeenCalledWith(expect.anything(), rows[1])
    expect(wrapper.findComponent(ContextMenuStub).props('items')).toEqual([{ label: 'Edit Beta' }])
    expect(wrapper.emitted('row-click')).toBeUndefined()
  })

  it('opens the menu with that row’s items on right-click', async () => {
    menuShow.mockClear()
    const wrapper = mountSection()
    const event = new MouseEvent('contextmenu')

    wrapper.findComponent(AppTable).vm.$emit('row-contextmenu', { event, row: rows[0] })
    await wrapper.vm.$nextTick()

    expect(menuShow).toHaveBeenCalledWith(event, rows[0])
    expect(wrapper.findComponent(ContextMenuStub).props('items')).toEqual([{ label: 'Edit Alpha' }])
  })

  it('shows a table-shaped placeholder and no table or count while loading', () => {
    const wrapper = mountSection({ props: { loading: true } })

    expect(wrapper.findComponent(TableSkeleton).props('columns')).toEqual([
      'minmax(0, 180fr)',
      'minmax(0, 48fr)',
    ])
    expect(wrapper.findComponent(AppTable).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('2 actions')
  })

  it('hands a load error to the table', () => {
    const error = { message: 'Request failed: 500' }
    const wrapper = mountSection({ props: { error } })

    expect(wrapper.findComponent(AppTable).props('error')).toEqual(error)
    expect(wrapper.text()).toContain('Request failed: 500')
  })

  it('shows the empty text when there are no rows', () => {
    const wrapper = mountSection({ props: { rows: [] } })

    expect(wrapper.text()).toContain('No server actions found.')
  })

  it('lets the empty slot replace the empty text', () => {
    const wrapper = mountSection({
      props: { rows: [] },
      slots: { empty: () => h('span', { class: 'custom-empty' }, 'Nothing matches.') },
    })

    expect(wrapper.find('.custom-empty').text()).toBe('Nothing matches.')
    expect(wrapper.text()).not.toContain('No server actions found.')
  })

  it('forwards undeclared attributes and listeners to the table only, once', () => {
    const onSelectionChange = vi.fn()
    const wrapper = mountSection({
      attrs: { storageKey: 'server-actions', 'data-probe': 'x', onSelectionChange },
    })
    const table = wrapper.findComponent(AppTable)

    expect(table.props('storageKey')).toBe('server-actions')
    expect(wrapper.findAll('[data-probe]')).toHaveLength(1)
    expect(table.find('[data-probe]').exists()).toBe(true)

    table.vm.$emit('selection-change', new Set([1]))
    expect(onSelectionChange).toHaveBeenCalledOnce()
  })

  it('lets the caller override the table defaults', () => {
    const wrapper = mountSection({ attrs: { pageSize: 25 } })

    expect(wrapper.findComponent(AppTable).props('pageSize')).toBe(25)
  })
})

describe('EntityListSection detail', () => {
  it('shows the detail slot and hides the list while detail is set', () => {
    const wrapper = mountSection({
      props: { detail: true },
      slots: { detail: () => h('p', { class: 'editor' }, 'Editor') },
    })
    const list = wrapper.findAll('.entity-section').at(-1)

    expect(wrapper.find('.editor').exists()).toBe(true)
    expect(list.isVisible()).toBe(false)
  })

  it('keeps the same table across list, detail and back', async () => {
    const wrapper = mountSection({ slots: { detail: () => h('p', 'Editor') } })
    const tableUid = () => wrapper.findComponent(AppTable).vm.$.uid
    const uid = tableUid()

    await wrapper.setProps({ detail: true })
    expect(tableUid()).toBe(uid)

    await wrapper.setProps({ detail: false })
    expect(tableUid()).toBe(uid)
    expect(wrapper.find('p').exists()).toBe(false)
  })
})
