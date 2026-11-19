import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import AutoComplete from 'primevue/autocomplete'
import Tooltip from 'primevue/tooltip'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// PrimeVue's Select and AutoComplete bind a matchMedia listener on mount; jsdom has none.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const NetworkMapToolbar = (await import('../NetworkMapToolbar.vue')).default

const ENTRIES = [
  { id: 'e2', objectId: 2, name: 'access-switch', objectClass: 'Node', objectStatus: 0 },
  { id: 'e1', objectId: 1, name: 'core-router', objectClass: 'Node', objectStatus: 2 },
]

let wrapper

function mountToolbar(props = {}) {
  wrapper = mount(NetworkMapToolbar, {
    props: { mapData: { id: 9, name: 'Map', mapType: 0 }, objects: ENTRIES, ...props },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
    attachTo: document.body,
  })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function dropdownButton() {
  return wrapper.find('button[aria-label="Show objects on this map"]')
}

function options() {
  return [...document.body.querySelectorAll('[role="option"]')]
}

describe('NetworkMapToolbar search field', () => {
  it('typing still drives the map search', async () => {
    mountToolbar()
    await wrapper.find('input[type="text"]').setValue('rout')
    expect(wrapper.emitted('update:searchTerm').at(-1)).toEqual(['rout'])
  })

  it('stays the target of the / shortcut and names its dropdown button', () => {
    mountToolbar()
    expect(wrapper.find('[data-filter-input] input').exists()).toBe(true)
    expect(dropdownButton().exists()).toBe(true)
  })

  it('the dropdown lists the objects that match the typed text', async () => {
    mountToolbar({ searchTerm: 'rout' })
    await dropdownButton().trigger('click')
    await flushPromises()
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('core-router')])
  })

  it('the dropdown lists every object when nothing is typed', async () => {
    mountToolbar()
    await dropdownButton().trigger('click')
    await flushPromises()
    expect(options()).toHaveLength(2)
  })

  it('picking an object asks the map to focus it and keeps the typed text', async () => {
    mountToolbar({ searchTerm: 'r' })
    await dropdownButton().trigger('click')
    await flushPromises()
    const router = options().find((o) => o.textContent.includes('core-router'))
    router.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('focus-object')).toEqual([['e1']])
    expect(wrapper.emitted('update:searchTerm')).toBeUndefined()
    expect(wrapper.find('input[type="text"]').element.value).toBe('r')
  })

  it('the dropdown opens again right after a pick', async () => {
    mountToolbar()
    await dropdownButton().trigger('click')
    await flushPromises()
    options()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(options()).toHaveLength(0)

    await dropdownButton().trigger('click')
    await flushPromises()
    expect(options()).toHaveLength(2)
  })

  it('virtualizes a long list only', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...ENTRIES[0], id: `m${i}` }))
    mountToolbar({ objects: many })
    expect(wrapper.findComponent(AutoComplete).props('virtualScrollerOptions')).toMatchObject({
      itemSize: expect.any(Number),
    })
    wrapper.unmount()
    mountToolbar()
    expect(wrapper.findComponent(AutoComplete).props('virtualScrollerOptions')).toBeNull()
  })
})
