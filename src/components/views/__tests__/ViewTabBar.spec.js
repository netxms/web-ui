import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import ViewTabBar from '@/components/views/ViewTabBar.vue'

// ContextMenu reads a media query on mount; jsdom has no matchMedia.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const views = [
  { id: 'status', label: 'Status' },
  { id: 'alarms', label: 'Alarms' },
  { id: 'properties', label: 'Properties' },
]

function mountBar(props) {
  return mount(ViewTabBar, {
    props: { views, visibleViewIds: views.map((v) => v.id), activeView: 'status', ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

describe('ViewTabBar badges', () => {
  it('shows a nonzero badge beside its label, in the tab name', () => {
    const wrapper = mountBar({
      views: [
        { id: 'status', label: 'Status', badge: 0 },
        { id: 'alarms', label: 'Alarms', badge: 3 },
        { id: 'properties', label: 'Properties' },
      ],
    })

    expect(wrapper.findAll('.view-tab').map((tab) => tab.text())).toEqual([
      'Status',
      'Alarms3',
      'Properties',
    ])
    expect(wrapper.findAll('.view-tab-badge')).toHaveLength(1)
  })
})

describe('ViewTabBar keyboard navigation', () => {
  it('is a single tab stop: only the active tab has tabindex 0', () => {
    const wrapper = mountBar()
    const tabs = wrapper.findAll('.view-tab')
    expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('keeps the scrolling tab strip out of the tab order', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.view-tab-bar-tabs').attributes('tabindex')).toBe('-1')
  })

  it('does not expose the close button as its own tab stop', () => {
    const wrapper = mountBar()
    const close = wrapper.find('.view-tab-close')
    expect(close.attributes('tabindex')).toBe('-1')
    expect(close.attributes('aria-hidden')).toBe('true')
  })

  it('moves focus right and left with arrow keys', async () => {
    const wrapper = mountBar()
    const tabs = wrapper.findAll('.view-tab')

    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[1].element)

    await tabs[1].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[0].element)
  })

  it('wraps around at both ends and supports Home/End', async () => {
    const wrapper = mountBar()
    const tabs = wrapper.findAll('.view-tab')

    await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[2].element)

    await tabs[2].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[0].element)

    await tabs[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(tabs[2].element)

    await tabs[2].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(tabs[0].element)
  })

  it('moves the tab stop with the focused tab', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.findAll('.view-tab').map((t) => t.attributes('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ])
  })

  it('does not switch views on arrow keys', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('still activates on Enter (the spread bindings survive the keydown handler)', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[1].trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toEqual([['alarms']])
  })

  it('closes the focused tab with Delete', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[1].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toEqual([['alarms']])
  })

  it('ignores Delete when the bar does not allow removing tabs', async () => {
    const wrapper = mountBar({ allowAddRemove: false })
    await wrapper.findAll('.view-tab')[1].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('offers no close for a view marked non-closable, by button or Delete', async () => {
    const withContext = [...views, { id: 'dashboard:5', label: 'Ops', closable: false }]
    const wrapper = mountBar({
      views: withContext,
      visibleViewIds: withContext.map((v) => v.id),
    })
    const tabs = wrapper.findAll('.view-tab')
    expect(tabs[3].find('.view-tab-close').exists()).toBe(false)
    expect(tabs[1].find('.view-tab-close').exists()).toBe(true)
    await tabs[3].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('treats tool tabs as part of the same arrow-key sequence', async () => {
    const wrapper = mountBar({
      toolTabs: [{ id: 'exec-1', label: 'Ping', icon: 'pi pi-bolt', status: 'success' }],
    })
    const tabs = wrapper.findAll('.view-tab')
    expect(tabs).toHaveLength(4)

    await tabs[2].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[3].element)

    await tabs[3].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close-tool-tab')).toEqual([['exec-1']])
  })

  it('exposes tablist/tab roles with the active tab selected', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.view-tab-bar-tabs').attributes('role')).toBe('tablist')
    const tabs = wrapper.findAll('.view-tab')
    expect(tabs[0].attributes('role')).toBe('tab')
    expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
  })
})

// jsdom reports zero for every layout box, so overflow is staged by hand.
async function stageOverflow(wrapper, { clientWidth, tabWidth = 100, scrollLeft = 0 }) {
  const strip = wrapper.find('.view-tab-scroll')
  const tabs = wrapper.findAll('[data-tab-key]')
  tabs.forEach((tab, index) => {
    Object.defineProperty(tab.element, 'offsetLeft', {
      value: index * tabWidth,
      configurable: true,
    })
    Object.defineProperty(tab.element, 'offsetWidth', { value: tabWidth, configurable: true })
  })
  Object.defineProperty(strip.element, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(strip.element, 'scrollWidth', {
    value: tabs.length * tabWidth,
    configurable: true,
  })
  strip.element.scrollLeft = scrollLeft
  await strip.trigger('scroll')
  return strip
}

function overflowMenuLabels() {
  return [...document.querySelectorAll('.p-menu-item-label')].map((n) => n.textContent.trim())
}

describe('ViewTabBar overflow', () => {
  it('keeps the scroll container out of the tab order', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.view-tab-scroll').attributes('tabindex')).toBe('-1')
  })

  it('hides the overflow button while every tab fits', async () => {
    const wrapper = mountBar()
    await stageOverflow(wrapper, { clientWidth: 400 })
    expect(wrapper.find('.view-tab-overflow').exists()).toBe(false)
  })

  it('shows the overflow button with a count once tabs no longer fit', async () => {
    const wrapper = mountBar()
    await stageOverflow(wrapper, { clientWidth: 150 })
    const button = wrapper.find('.view-tab-overflow')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('Tabs out of view (2)')
  })

  it('marks the edges the strip can still scroll towards', async () => {
    const wrapper = mountBar()
    const strip = await stageOverflow(wrapper, { clientWidth: 150 })
    expect(strip.classes()).toContain('can-scroll-right')
    expect(strip.classes()).not.toContain('can-scroll-left')

    await stageOverflow(wrapper, { clientWidth: 150, scrollLeft: 150 })
    expect(strip.classes()).toContain('can-scroll-left')
    expect(strip.classes()).not.toContain('can-scroll-right')
  })

  it('lists exactly the hidden tabs in the overflow menu', async () => {
    const wrapper = mountBar()
    await stageOverflow(wrapper, { clientWidth: 150 })
    await wrapper.find('.view-tab-overflow').trigger('click')
    expect(overflowMenuLabels()).toEqual(['Alarms', 'Properties'])
    wrapper.unmount()
  })

  it('selects a view chosen from the overflow menu', async () => {
    const wrapper = mountBar()
    await stageOverflow(wrapper, { clientWidth: 150 })
    await wrapper.find('.view-tab-overflow').trigger('click')
    await document.querySelectorAll('.p-menu-item-link')[1].click()
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['properties'])
    wrapper.unmount()
  })

  it('separates the action buttons from the tabs even without tool tabs', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.view-tab-actions-divider').exists()).toBe(true)
  })
})

describe('ViewTabBar add button', () => {
  const addButton = (wrapper) => wrapper.find('button[aria-label^="Manage views"]')

  it('says how many more views it can add', () => {
    const button = addButton(mountBar({ addableCount: 12 }))
    expect(button.text()).toBe('12 more')
    expect(button.attributes('aria-label')).toBe('Manage views (12 more)')
  })

  it('is a bare icon when every view already has a tab', () => {
    const button = addButton(mountBar())
    expect(button.text()).toBe('')
    expect(button.attributes('aria-label')).toBe('Manage views')
  })

  it('opens the menu on click', async () => {
    const wrapper = mountBar({ addableCount: 3 })
    await addButton(wrapper).trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('is absent when the bar does not allow adding tabs', () => {
    expect(addButton(mountBar({ allowAddRemove: false, addableCount: 3 })).exists()).toBe(false)
  })
})

describe('ViewTabBar active tab pill', () => {
  // The bar reveals the active tab once it has mounted; staging before that would be undone.
  async function mountSettled(props) {
    const wrapper = mountBar(props)
    await flushPromises()
    return wrapper
  }

  it('stays away while the active tab is in view', async () => {
    const wrapper = await mountSettled()
    await stageOverflow(wrapper, { clientWidth: 150 })
    expect(wrapper.find('.view-tab-active-edge').exists()).toBe(false)
  })

  it('points left once the user scrolls the active tab away', async () => {
    const wrapper = await mountSettled()
    await stageOverflow(wrapper, { clientWidth: 150, scrollLeft: 150 })
    expect(wrapper.find('.view-tab-active-edge').classes()).toContain('view-tab-active-edge-left')
  })

  it('points right at an active tab past the right edge, and brings it back', async () => {
    const wrapper = await mountSettled({ activeView: 'properties' })
    const strip = await stageOverflow(wrapper, { clientWidth: 150 })
    const pill = wrapper.find('.view-tab-active-edge')
    expect(pill.classes()).toContain('view-tab-active-edge-right')

    await pill.trigger('click')
    expect(strip.element.scrollLeft).toBe(150)
    expect(wrapper.find('.view-tab-active-edge').exists()).toBe(false)
  })
})

describe('ViewTabBar overflow menu grouping', () => {
  const toolTabs = [{ id: 't1', label: 'IP Config', icon: 'pi pi-cog', status: 'done' }]

  it('separates hidden tool results from hidden views', async () => {
    const wrapper = mountBar({ toolTabs, activeToolTab: null })
    await stageOverflow(wrapper, { clientWidth: 250 })
    await wrapper.find('.view-tab-overflow').trigger('click')
    expect(overflowMenuLabels()).toEqual(['Properties', 'IP Config'])
    expect(document.querySelectorAll('.p-menu-separator').length).toBe(1)
    wrapper.unmount()
  })

  it('does not separate a list that is all views', async () => {
    const wrapper = mountBar()
    await stageOverflow(wrapper, { clientWidth: 150 })
    await wrapper.find('.view-tab-overflow').trigger('click')
    expect(document.querySelectorAll('.p-menu-separator').length).toBe(0)
    wrapper.unmount()
  })
})

describe('ViewTabBar wheel scrolling', () => {
  function wheel(strip, deltaY) {
    const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true })
    strip.element.dispatchEvent(event)
    return event
  }

  it('scrolls the strip sideways on a plain vertical wheel', async () => {
    const wrapper = mountBar()
    const strip = await stageOverflow(wrapper, { clientWidth: 150 })
    const event = wheel(strip, 50)
    expect(strip.element.scrollLeft).toBe(50)
    expect(event.defaultPrevented).toBe(true)
  })

  it('hands the wheel back to the page once the strip is at its end', async () => {
    // The active tab is last, so the bar's reveal-active scroll agrees with the staged position.
    const wrapper = mountBar({ activeView: 'properties' })
    const strip = await stageOverflow(wrapper, { clientWidth: 150, scrollLeft: 150 })
    const event = wheel(strip, 50)
    expect(strip.element.scrollLeft).toBe(150)
    expect(event.defaultPrevented).toBe(false)
  })

  it('hands an upward wheel back to the page at the start of the strip', async () => {
    const wrapper = mountBar()
    const strip = await stageOverflow(wrapper, { clientWidth: 150 })
    const event = wheel(strip, -50)
    expect(strip.element.scrollLeft).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('ViewTabBar locked tabs', () => {
  function tabMenuLabels() {
    return [...document.querySelectorAll('.p-contextmenu-item')].map((item) => ({
      label: item.querySelector('.p-contextmenu-item-label')?.textContent.trim(),
      disabled: item.getAttribute('aria-disabled') === 'true',
    }))
  }

  function tabMenuItem(label) {
    return [...document.querySelectorAll('.p-contextmenu-item')].find(
      (item) => item.querySelector('.p-contextmenu-item-label')?.textContent.trim() === label,
    )
  }

  it('shows a lock instead of the close button on a locked tab', () => {
    const wrapper = mountBar({ lockedViewIds: ['alarms'] })
    const tabs = wrapper.findAll('.view-tab')
    expect(tabs[1].find('.view-tab-close').exists()).toBe(false)
    expect(tabs[1].find('.view-tab-lock').attributes('aria-label')).toBe('Locked')
    expect(tabs[0].find('.view-tab-close').exists()).toBe(true)
    expect(tabs[0].find('.view-tab-lock').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores Delete on a locked tab', async () => {
    const wrapper = mountBar({ lockedViewIds: ['alarms'] })
    await wrapper.findAll('.view-tab')[1].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('offers Lock tab and Close on right click of an unlocked tab', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[1].trigger('contextmenu', { button: 2 })
    expect(tabMenuLabels()).toEqual([
      { label: 'Lock tab', disabled: false },
      { label: 'Close', disabled: false },
    ])

    tabMenuItem('Lock tab').querySelector('.p-contextmenu-item-link').click()
    expect(wrapper.emitted('toggle-lock')).toEqual([['alarms']])
    wrapper.unmount()
  })

  it('offers Unlock tab and a disabled Close on a locked tab', async () => {
    const wrapper = mountBar({ lockedViewIds: ['alarms'] })
    await wrapper.findAll('.view-tab')[1].trigger('contextmenu', { button: 2 })
    expect(tabMenuLabels()).toEqual([
      { label: 'Unlock tab', disabled: false },
      { label: 'Close', disabled: true },
    ])

    // PrimeVue blocks a disabled item by pointer events, not on click, so `aria-disabled` is
    // the real check.
    tabMenuItem('Unlock tab').querySelector('.p-contextmenu-item-link').click()
    expect(wrapper.emitted('toggle-lock')).toEqual([['alarms']])
    wrapper.unmount()
  })

  it('closes the tab from its menu', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[2].trigger('contextmenu', { button: 2 })
    tabMenuItem('Close').querySelector('.p-contextmenu-item-link').click()
    expect(wrapper.emitted('close')).toEqual([['properties']])
    wrapper.unmount()
  })

  it.each([
    ['the ContextMenu key', { key: 'ContextMenu' }],
    ['Shift+F10', { key: 'F10', shiftKey: true }],
  ])('opens the menu from the keyboard with %s', async (_name, keys) => {
    const wrapper = mountBar({ lockedViewIds: ['alarms'] })
    const tab = wrapper.findAll('.view-tab')[1]
    tab.element.focus()
    const event = new KeyboardEvent('keydown', { ...keys, bubbles: true, cancelable: true })
    tab.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(tabMenuLabels().map((item) => item.label)).toEqual(['Unlock tab', 'Close'])
    wrapper.unmount()
  })

  it('hands focus back to the tab when a menu opened from the keyboard closes', async () => {
    // The menu reports closing from its leave transition, which a stubbed one never runs.
    const wrapper = mount(ViewTabBar, {
      props: { views, visibleViewIds: views.map((v) => v.id), activeView: 'status' },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: Tooltip },
        stubs: { transition: false },
      },
    })
    const tab = wrapper.findAll('.view-tab')[1]
    tab.element.focus()
    await tab.trigger('keydown', { key: 'ContextMenu' })
    // In a browser the closing menu drops focus to the body; jsdom's stub cannot hold focus.
    tab.element.blur()
    await tabMenuItem('Lock tab').querySelector('.p-contextmenu-item-link').click()
    await flushPromises()
    expect(wrapper.emitted('toggle-lock')).toEqual([['alarms']])
    expect(document.activeElement).toBe(wrapper.findAll('.view-tab')[1].element)
    wrapper.unmount()
  })

  it('leaves plain F10 alone', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[1].trigger('keydown', { key: 'F10' })
    expect(document.querySelector('.p-contextmenu')).toBeNull()
    wrapper.unmount()
  })

  it('opens the menu for the contextmenu event a key fires', async () => {
    const wrapper = mountBar()
    await wrapper.findAll('.view-tab')[0].trigger('contextmenu', { button: 0 })
    expect(tabMenuLabels().map((item) => item.label)).toEqual(['Lock tab', 'Close'])
    wrapper.unmount()
  })

  it('offers no lock when the bar does not allow removing tabs', async () => {
    const wrapper = mountBar({ allowAddRemove: false, lockedViewIds: ['alarms'] })
    const tab = wrapper.findAll('.view-tab')[1]
    expect(tab.find('.view-tab-lock').exists()).toBe(false)
    await tab.trigger('contextmenu', { button: 2 })
    await tab.trigger('keydown', { key: 'ContextMenu' })
    expect(document.querySelector('.p-contextmenu')).toBeNull()
    wrapper.unmount()
  })

  it('offers no lock on derived tabs: non-closable, non-lockable, tool results', async () => {
    const derived = [
      ...views,
      { id: 'dashboard:5', label: 'Ops', closable: false },
      { id: 'chart', label: 'Chart', lockable: false },
    ]
    const wrapper = mountBar({
      views: derived,
      visibleViewIds: derived.map((v) => v.id),
      lockedViewIds: ['dashboard:5', 'chart'],
      toolTabs: [{ id: 'exec-1', label: 'Ping', icon: 'pi pi-bolt', status: 'success' }],
    })
    const tabs = wrapper.findAll('.view-tab')
    expect(wrapper.findAll('.view-tab-lock')).toHaveLength(0)
    // A stray lock on the chart tab does not take its close button away.
    expect(tabs[4].find('.view-tab-close').exists()).toBe(true)
    for (const tab of tabs.slice(3)) {
      await tab.trigger('contextmenu', { button: 2 })
      await tab.trigger('keydown', { key: 'ContextMenu' })
    }
    expect(document.querySelector('.p-contextmenu')).toBeNull()
    wrapper.unmount()
  })
})
