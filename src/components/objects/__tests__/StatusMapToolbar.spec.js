import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import StatusMapToolbar from '@/components/objects/StatusMapToolbar.vue'
import { prefs } from '@/utils/appStorage'

function mountToolbar(props = {}) {
  return mount(StatusMapToolbar, {
    props: { storageKey: 'widget:w1', ...props },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

const button = (wrapper, label) => wrapper.find(`button[aria-label="${label}"]`)

beforeEach(() => {
  localStorage.clear()
})

describe('StatusMapToolbar', () => {
  it('reports the layout picked', async () => {
    const wrapper = mountToolbar({ layout: 'flat' })
    await button(wrapper, 'Honeycomb').trigger('click')
    expect(wrapper.emitted('update:layout')).toEqual([['honeycomb']])
  })

  it('marks the current layout as pressed', () => {
    const wrapper = mountToolbar({ layout: 'treemap' })
    expect(button(wrapper, 'Treemap').attributes('aria-pressed')).toBe('true')
    expect(button(wrapper, 'Flat').attributes('aria-pressed')).toBe('false')
  })

  it('reports the sort picked', async () => {
    const wrapper = mountToolbar({ layout: 'flat', sortBy: 'status' })
    await button(wrapper, 'Sort by name').trigger('click')
    expect(wrapper.emitted('update:sortBy')).toEqual([['name']])
  })

  it.each(['grouped', 'sunburst', 'treemap'])('offers no sort in the %s layout', (layout) => {
    const wrapper = mountToolbar({ layout })
    expect(button(wrapper, 'Sort by name').exists()).toBe(false)
  })

  it('can leave out the layout picker and keep the sort', () => {
    const wrapper = mountToolbar({ showLayouts: false })
    expect(button(wrapper, 'Flat').exists()).toBe(false)
    expect(button(wrapper, 'Sort by name').exists()).toBe(true)
  })

  it('offers no layout or sort where the host cannot change them', () => {
    const wrapper = mountToolbar({ editable: false, count: 5 })
    expect(button(wrapper, 'Flat').exists()).toBe(false)
    expect(button(wrapper, 'Sort by name').exists()).toBe(false)
    expect(wrapper.text()).toContain('5 objects')
    expect(wrapper.findAll('.smt-divider')).toHaveLength(1)
  })

  it('shows the object count once there is one', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.text()).not.toContain('objects')
    await wrapper.setProps({ count: 119 })
    expect(wrapper.text()).toContain('119 objects')
  })

  it('collapses to a single button and remembers it', async () => {
    const wrapper = mountToolbar()
    await button(wrapper, 'Hide controls').trigger('click')

    expect(button(wrapper, 'Flat').exists()).toBe(false)
    expect(button(wrapper, 'Show controls').exists()).toBe(true)
    expect(mountToolbar().find('button[aria-label="Show controls"]').exists()).toBe(true)
  })

  it('remembers each place separately', async () => {
    await button(mountToolbar(), 'Hide controls').trigger('click')
    const other = mountToolbar({ storageKey: 'widget:w2' })
    expect(button(other, 'Hide controls').exists()).toBe(true)
  })

  it('starts collapsed where that is the default, until expanded', async () => {
    const wrapper = mountToolbar({ defaultCollapsed: true })
    expect(button(wrapper, 'Flat').exists()).toBe(false)

    await button(wrapper, 'Show controls').trigger('click')
    expect(button(mountToolbar({ defaultCollapsed: true }), 'Flat').exists()).toBe(true)
  })

  it('survives a corrupt stored value', () => {
    prefs.set('statusMap.toolbarCollapsed', 'nonsense')
    expect(button(mountToolbar(), 'Flat').exists()).toBe(true)
  })
})
