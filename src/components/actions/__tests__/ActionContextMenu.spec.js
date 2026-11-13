import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import { SUBMENU_SWITCH_DELAY_MS } from '@/components/actions/SubmenuDelayContextMenu'

// PrimeVue's overlay listens for a touch-capable media query on mount; jsdom has no
// matchMedia at all.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

/** The menu is opened from a right click, which PrimeVue reads only for its coordinates. */
const openEvent = () => ({
  pageX: 10,
  pageY: 10,
  preventDefault: () => {},
  stopPropagation: () => {},
})

function press(key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

let rename
let remove
let wrapper

function mountMenu(items) {
  return mount(ActionContextMenu, {
    props: { items },
    global: { plugins: [PrimeVue] },
    attachTo: document.body,
  })
}

beforeEach(() => {
  rename = vi.fn()
  remove = vi.fn()
})

describe('ActionContextMenu shortcuts', () => {
  const items = () => [
    { id: 'rename', label: 'Rename', shortcut: 'F2', command: rename },
    { id: 'delete', label: 'Delete', shortcut: 'Del', command: remove },
    { id: 'poll', label: 'Poll', items: [{ id: 'status', label: 'Status', shortcut: 'F2' }] },
  ]

  it('runs the item whose shortcut was pressed while the menu is open', async () => {
    wrapper = mountMenu(items())
    wrapper.vm.show(openEvent())
    await wrapper.vm.$nextTick()

    press('F2')

    expect(rename).toHaveBeenCalledTimes(1)
    expect(rename.mock.calls[0][0].item.id).toBe('rename')
  })

  it('claims the key so nothing else acts on it', async () => {
    wrapper = mountMenu(items())
    wrapper.vm.show(openEvent())
    await wrapper.vm.$nextTick()

    expect(press('Delete').defaultPrevented).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('ignores shortcuts while the menu is closed', () => {
    wrapper = mountMenu(items())

    press('F2')

    expect(rename).not.toHaveBeenCalled()
  })

  it('stops listening once the menu closes', async () => {
    wrapper = mountMenu(items())
    wrapper.vm.show(openEvent())
    await wrapper.vm.$nextTick()
    wrapper.vm.hide()
    await wrapper.vm.$nextTick()

    press('F2')

    expect(rename).not.toHaveBeenCalled()
  })

  it('leaves disabled items alone', async () => {
    wrapper = mountMenu([
      { id: 'rename', label: 'Rename', shortcut: 'F2', disabled: true, command: rename },
    ])
    wrapper.vm.show(openEvent())
    await wrapper.vm.$nextTick()

    press('F2')

    expect(rename).not.toHaveBeenCalled()
  })
})

describe('ActionContextMenu submenu switching', () => {
  const items = () => [
    { id: 'tools', label: 'Tools', items: [{ id: 'ssh', label: 'SSH terminal' }] },
    { id: 'maintenance', label: 'Maintenance', items: [{ id: 'enter', label: 'Enter' }] },
    { id: 'rename', label: 'Rename' },
  ]

  const itemRow = (label) =>
    [...document.querySelectorAll('li[role="menuitem"]')].find(
      (li) => li.querySelector('.p-contextmenu-item-content').textContent.trim() === label,
    )
  const content = (label) => itemRow(label).querySelector('.p-contextmenu-item-content')
  const expanded = (label) => itemRow(label).getAttribute('aria-expanded') === 'true'

  async function hover(label, type = 'mouseenter') {
    content(label).dispatchEvent(new MouseEvent(type))
    await wrapper.vm.$nextTick()
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    wrapper = mountMenu(items())
    wrapper.vm.show(openEvent())
    await wrapper.vm.$nextTick()
    await hover('Tools')
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('opens the first submenu at once', () => {
    expect(expanded('Tools')).toBe(true)
  })

  it('keeps the open submenu while the pointer brushes a sibling', async () => {
    await hover('Maintenance')
    expect(expanded('Tools')).toBe(true)
    expect(expanded('Maintenance')).toBe(false)

    await vi.advanceTimersByTimeAsync(SUBMENU_SWITCH_DELAY_MS)
    expect(expanded('Maintenance')).toBe(true)
    expect(expanded('Tools')).toBe(false)
  })

  it('does not switch when the pointer reaches the open submenu first', async () => {
    await hover('Maintenance')
    await hover('Maintenance', 'mouseleave')
    await hover('SSH terminal')

    await vi.advanceTimersByTimeAsync(SUBMENU_SWITCH_DELAY_MS)
    expect(expanded('Tools')).toBe(true)
    expect(expanded('Maintenance')).toBe(false)
  })

  it('closes the open submenu only after resting on a plain item', async () => {
    await hover('Rename')
    expect(expanded('Tools')).toBe(true)

    await vi.advanceTimersByTimeAsync(SUBMENU_SWITCH_DELAY_MS)
    expect(expanded('Tools')).toBe(false)
  })
})
