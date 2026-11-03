import { describe, it, expect, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import ViewAddMenu from '@/components/views/ViewAddMenu.vue'

const groups = {
  general: {
    label: 'General',
    views: [
      { id: 'status', label: 'Status' },
      { id: 'alarms', label: 'Alarms' },
    ],
  },
  data: {
    label: 'Data',
    views: [
      { id: 'dcis', label: 'Data Collection' },
      { id: 'performance', label: 'Performance' },
    ],
  },
}

let wrapper
let anchor

/**
 * Real transitions: the popover focuses and reports opening from its enter transition. The
 * mount settles first, since content arriving with the portal's first render gets no enter.
 */
async function openMenu(props = {}) {
  anchor = document.createElement('button')
  document.body.appendChild(anchor)
  wrapper = mount(ViewAddMenu, {
    props: { groups, visibleViewIds: ['status', 'alarms'], ...props },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { transition: false },
    },
  })
  await flushPromises()
  await reopen()
}

async function reopen() {
  wrapper.vm.show({ currentTarget: anchor })
  await flushPromises()
}

const filterInput = () => document.querySelector('.view-add-menu [data-filter-input]')

async function typeFilter(text) {
  const input = filterInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

const itemLabels = () =>
  [...document.querySelectorAll('.view-add-menu-item-label')].map((n) => n.textContent.trim())

const groupLabels = () =>
  [...document.querySelectorAll('.view-add-menu-group-label')].map((n) => n.textContent.trim())

function itemRow(label) {
  return [...document.querySelectorAll('.view-add-menu-item')].find(
    (row) => row.querySelector('.view-add-menu-item-label').textContent.trim() === label,
  )
}

afterEach(() => {
  wrapper?.unmount()
  anchor?.remove()
  vi.restoreAllMocks()
})

describe('ViewAddMenu filter', () => {
  it('focuses the filter when it opens', async () => {
    await openMenu()
    expect(document.activeElement).toBe(filterInput())
  })

  it('matches labels case-insensitively and hides groups with no match', async () => {
    await openMenu()
    await typeFilter('DATA')
    expect(itemLabels()).toEqual(['Data Collection'])
    expect(groupLabels()).toEqual(['Data'])
  })

  it('matches anywhere in the label', async () => {
    await openMenu()
    await typeFilter('arm')
    expect(itemLabels()).toEqual(['Alarms'])
  })

  it('says so when nothing matches', async () => {
    await openMenu()
    expect(document.querySelector('.view-add-menu-empty')).toBeNull()
    await typeFilter('zzz')
    expect(itemLabels()).toEqual([])
    expect(document.querySelector('.view-add-menu-empty').textContent.trim()).toBe('No views match')
  })

  it('opens the first match on Enter, adding it to the tabs first', async () => {
    await openMenu()
    await typeFilter('perf')
    filterInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('toggle')).toEqual([['performance']])
    expect(wrapper.emitted('select')).toEqual([['performance']])
  })

  it('opens an already shown first match without toggling it', async () => {
    await openMenu()
    await typeFilter('a')
    filterInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('toggle')).toBeUndefined()
    expect(wrapper.emitted('select')).toEqual([['status']])
  })

  it('does nothing on Enter when nothing matches', async () => {
    await openMenu()
    await typeFilter('zzz')
    filterInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('starts empty every time it opens', async () => {
    await openMenu()
    await typeFilter('perf')
    wrapper.vm.hide()
    await flushPromises()
    await reopen()
    expect(filterInput().value).toBe('')
    expect(itemLabels()).toEqual(['Status', 'Alarms', 'Data Collection', 'Performance'])
  })

  it('keeps the width it opened with while the list narrows', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 250.2 })
    await openMenu()
    const menu = document.querySelector('.view-add-menu')
    expect(menu.style.width).toBe('251px')
    await typeFilter('arm')
    expect(menu.style.width).toBe('251px')
  })
})

describe('ViewAddMenu locked views', () => {
  it('disables the checkbox of a locked view and marks it with a lock', async () => {
    await openMenu({ lockedViewIds: ['alarms'] })
    const locked = itemRow('Alarms')
    expect(locked.querySelector('input[type="checkbox"]').disabled).toBe(true)
    expect(locked.querySelector('.view-add-menu-item-lock').getAttribute('aria-label')).toBe(
      'Locked',
    )
    const unlocked = itemRow('Status')
    expect(unlocked.querySelector('input[type="checkbox"]').disabled).toBe(false)
    expect(unlocked.querySelector('.view-add-menu-item-lock')).toBeNull()
  })

  it('still opens a locked view from its label', async () => {
    await openMenu({ lockedViewIds: ['alarms'] })
    itemRow('Alarms').querySelector('.view-add-menu-item-content').click()
    expect(wrapper.emitted('select')).toEqual([['alarms']])
  })

  it('ignores a lock on a view that is not shown, so it can be added back', async () => {
    await openMenu({ lockedViewIds: ['dcis'] })
    const row = itemRow('Data Collection')
    expect(row.querySelector('input[type="checkbox"]').disabled).toBe(false)
    expect(row.querySelector('.view-add-menu-item-lock')).toBeNull()
  })
})
