import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectSubTree: () => ({ data: ref([]), isLoading: ref(false), isFetching: ref(false) }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
// The tiles' nav bindings import the app router, which would pull in the whole route table.
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))

const StatusMapView = (await import('@/views/objects/subviews/StatusMapView.vue')).default
const StatusMapToolbar = (await import('@/components/objects/StatusMapToolbar.vue')).default

function mountView() {
  return mount(StatusMapView, {
    props: { object: { id: 7, name: 'Servers' } },
    global: {
      stubs: {
        StatusMapToolbar: true,
        StatusMapFlat: true,
        StatusMapHoneycomb: true,
        StatusMapGrouped: true,
        StatusMapSunburst: true,
        StatusMapTreemap: true,
      },
    },
  })
}

const toolbar = (wrapper) => wrapper.findComponent(StatusMapToolbar)

beforeEach(() => {
  localStorage.clear()
})

describe('StatusMapView', () => {
  it('starts on the flat layout sorted by status', () => {
    expect(toolbar(mountView()).props()).toMatchObject({ layout: 'flat', sortBy: 'status' })
  })

  it('remembers the layout and sort picked', async () => {
    const wrapper = mountView()
    toolbar(wrapper).vm.$emit('update:layout', 'honeycomb')
    toolbar(wrapper).vm.$emit('update:sortBy', 'name')
    await wrapper.vm.$nextTick()
    expect(toolbar(wrapper).props()).toMatchObject({ layout: 'honeycomb', sortBy: 'name' })

    expect(toolbar(mountView()).props()).toMatchObject({ layout: 'honeycomb', sortBy: 'name' })
  })
})
