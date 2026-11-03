import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import PrimeVue from 'primevue/config'
import AppTable from '@/components/common/AppTable.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

const columns = [{ id: 'name', field: 'name', label: 'Name', sortable: true }]
const makeRows = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `row${String(i + 1).padStart(2, '0')}`,
  }))

/** Reactive so a test can deliver rows late. */
const table = reactive({
  rows: [],
  loading: false,
  pageSize: 2,
  storageKey: 'probe',
  ownerId: null,
})

const TableView = defineComponent({
  name: 'TableView',
  setup: () => () =>
    h(
      AppTable,
      {
        columns,
        rows: table.rows,
        loading: table.loading,
        pageSize: table.pageSize,
        // Compact: no rows-per-page Select, which needs matchMedia.
        compact: true,
        storageKey: table.storageKey,
        ownerId: table.ownerId,
        expandable: true,
      },
      { expansion: ({ row }) => h('div', { class: 'expansion' }, row.name) },
    ),
})
const Elsewhere = defineComponent({ render: () => h('div', 'elsewhere') })

let wrapper
let router

async function go(path) {
  await router.push(path)
  await flushPromises()
}

async function mountAt(path) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/infrastructure/:objectId?', component: TableView },
      { path: '/alarms', component: Elsewhere },
    ],
  })
  router.push(path)
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router, PrimeVue] } })
  await flushPromises()
}

const names = () =>
  wrapper.findAll('tbody tr[aria-expanded]').map((tr) => tr.find('td:last-child').text())
const scroller = () => wrapper.find('.app-table-wrap').element
const openRows = () => wrapper.findAll('.expansion').map((el) => el.text())

async function sortDescending() {
  const th = wrapper.find('th.app-table__th--sortable')
  await th.trigger('click')
  await th.trigger('click')
}

async function nextPage() {
  wrapper.findComponent({ name: 'Paginator' }).vm.$emit('update:first', 2)
  await flushPromises()
}

beforeEach(() => {
  clearWorkingState()
  localStorage.clear()
  Object.assign(table, {
    rows: makeRows(6),
    loading: false,
    pageSize: 2,
    storageKey: 'probe',
    ownerId: null,
  })
})

describe('AppTable working state', () => {
  it('brings back sort, page, open rows and scroll after leaving the perspective', async () => {
    await mountAt('/infrastructure/1')
    await sortDescending()
    await nextPage()
    expect(names()).toEqual(['row04', 'row03'])
    await wrapper.findAll('tbody tr[aria-expanded]')[0].trigger('click')
    scroller().scrollTop = 40

    await go('/alarms')
    await go('/infrastructure/1')

    expect(names()).toEqual(['row04', 'row03'])
    expect(openRows()).toEqual(['row04'])
    expect(scroller().scrollTop).toBe(40)
  })

  it('keeps the sort on another object, but starts page, open rows and scroll over', async () => {
    await mountAt('/infrastructure/1')
    await sortDescending()
    await nextPage()
    await wrapper.findAll('tbody tr[aria-expanded]')[0].trigger('click')
    scroller().scrollTop = 40

    await go('/alarms')
    await go('/infrastructure/2')

    expect(names()).toEqual(['row06', 'row05'])
    expect(openRows()).toEqual([])
    expect(scroller().scrollTop).toBe(0)
  })

  it('starts the next object over when the table stays on screen', async () => {
    await mountAt('/infrastructure/1')
    await sortDescending()
    await nextPage()
    await wrapper.findAll('tbody tr[aria-expanded]')[0].trigger('click')
    scroller().scrollTop = 40

    await go('/infrastructure/2')

    expect(names()).toEqual(['row06', 'row05'])
    expect(openRows()).toEqual([])
    expect(scroller().scrollTop).toBe(0)
  })

  it('scrolls back only once the rows have arrived', async () => {
    await mountAt('/infrastructure/1')
    scroller().scrollTop = 40

    await go('/alarms')
    Object.assign(table, { rows: [], loading: true })
    await go('/infrastructure/1')
    expect(scroller().scrollTop).toBe(0)

    Object.assign(table, { rows: makeRows(6), loading: false })
    await flushPromises()
    expect(scroller().scrollTop).toBe(40)
  })

  it('reopens at most 20 rows', async () => {
    Object.assign(table, { rows: makeRows(30), pageSize: 50 })
    await mountAt('/infrastructure/1')
    for (const row of wrapper.findAll('tbody tr[aria-expanded]').slice(0, 25)) {
      await row.trigger('click')
    }
    expect(openRows()).toHaveLength(25)

    await go('/alarms')
    await go('/infrastructure/1')

    expect(openRows()).toHaveLength(20)
  })

  it('gives page and scroll back only to the owner they were left on', async () => {
    // An alarm's related events: the route is the same whichever alarm is open.
    table.ownerId = 5
    await mountAt('/infrastructure/1')
    await sortDescending()
    await nextPage()
    scroller().scrollTop = 40

    await go('/alarms')
    table.ownerId = 7
    await go('/infrastructure/1')
    expect(names()).toEqual(['row06', 'row05'])
    expect(scroller().scrollTop).toBe(0)

    await go('/alarms')
    table.ownerId = 5
    await go('/infrastructure/1')
    // Owner 7 was the last one left, so owner 5 starts over too; the sort is the view's.
    expect(names()).toEqual(['row06', 'row05'])
  })

  it('remembers nothing without a storageKey', async () => {
    table.storageKey = null
    await mountAt('/infrastructure/1')
    await sortDescending()
    await nextPage()

    await go('/alarms')
    await go('/infrastructure/1')

    expect(names()).toEqual(['row01', 'row02'])
  })
})
