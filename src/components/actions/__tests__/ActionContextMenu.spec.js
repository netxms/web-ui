import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'

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
