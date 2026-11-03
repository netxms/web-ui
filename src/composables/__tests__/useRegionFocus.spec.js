import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const route = reactive({ name: 'infrastructure', params: {} })
vi.mock('vue-router', () => ({ useRoute: () => route }))

const { useRegionFocus } = await import('@/composables/useRegionFocus')

let layout
let wrapper
let regionFocus

// The tree starts empty so a test can add it late, the way a fetched tree arrives.
function buildLayout() {
  layout = document.createElement('div')
  layout.className = 'default-layout'
  layout.innerHTML = `
    <div role="banner"><button id="header-btn">h</button></div>
    <nav><button id="nav-btn">n</button></nav>
    <aside>
      <input id="sidebar-filter" />
      <div class="tree-host"></div>
    </aside>
    <main tabindex="-1"><button id="view-btn">v</button></main>`
  document.body.append(layout)
}

function addTree(selectedIndex = 1) {
  const tree = document.createElement('div')
  tree.setAttribute('role', 'tree')
  tree.innerHTML = [0, 1, 2]
    .map(
      (i) =>
        `<div role="treeitem" id="row-${i}" tabindex="${i === selectedIndex ? 0 : -1}">r${i}</div>`,
    )
    .join('')
  layout.querySelector('.tree-host').append(tree)
  return tree
}

function start() {
  wrapper = mount({
    setup() {
      regionFocus = useRegionFocus()
      return () => null
    },
  })
}

async function navigate(name, params = {}) {
  route.name = name
  route.params = params
  await flushPromises()
}

const region = (selector) => layout.querySelector(selector)

beforeEach(() => {
  route.name = 'infrastructure'
  route.params = {}
  buildLayout()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  regionFocus = null
  layout.remove()
})

function markedRegion() {
  return layout.querySelector('[data-region-focus]')
}

describe('useRegionFocus', () => {
  describe('on navigation', () => {
    it('lands on the tree row the user is on when a perspective opens', async () => {
      addTree(1)
      start()

      await navigate('dashboards')

      expect(document.activeElement.id).toBe('row-1')
    })

    // A row focused from script does not match `:focus-visible` in a browser.
    it('marks the row so its focus ring shows', async () => {
      addTree(1)
      start()

      await navigate('dashboards')

      expect(document.activeElement.hasAttribute('data-focus-ring')).toBe(true)
    })

    it('does not ring the view when it moves focus there', async () => {
      addTree()
      start()

      await navigate('infrastructure', { objectId: '42' })

      expect(document.activeElement).toBe(region('main'))
      expect(region('main').hasAttribute('data-focus-ring')).toBe(false)
    })

    it('waits for a tree that has not been fetched yet', async () => {
      start()
      await navigate('dashboards')
      expect(document.activeElement.id).not.toBe('row-1')

      addTree(1)
      await flushPromises()

      expect(document.activeElement.id).toBe('row-1')
    })

    it('moves into the view when a different entity is opened', async () => {
      addTree()
      start()

      await navigate('infrastructure', { objectId: '42' })

      expect(document.activeElement).toBe(region('main'))
    })

    it('leaves the keyboard on the tree row that opened the object', async () => {
      addTree(1)
      start()
      layout.querySelector('#row-1').focus()

      await navigate('infrastructure', { objectId: '42' })

      expect(document.activeElement.id).toBe('row-1')
    })

    it('stays put when only the view tab changes', async () => {
      start()
      await navigate('infrastructure', { objectId: '42', viewId: 'status' })

      region('#view-btn').focus()
      await navigate('infrastructure', { objectId: '42', viewId: 'interfaces' })

      expect(document.activeElement.id).toBe('view-btn')
    })

    it('does not fire on the first render, which is not a navigation', async () => {
      addTree(1)
      start()
      await flushPromises()

      expect(document.activeElement.id).not.toBe('row-1')
    })
  })

  describe('guards', () => {
    it('leaves focus alone while the user is typing', async () => {
      addTree(1)
      start()
      region('#sidebar-filter').focus()

      await navigate('dashboards')

      expect(document.activeElement.id).toBe('sidebar-filter')
    })

    it('leaves focus alone while a dialog is open', async () => {
      addTree(1)
      start()
      const dialog = document.createElement('div')
      dialog.className = 'p-dialog'
      dialog.innerHTML = '<button id="dialog-btn">x</button>'
      document.body.append(dialog)
      dialog.querySelector('#dialog-btn').focus()

      await navigate('dashboards')

      expect(document.activeElement.id).toBe('dialog-btn')
      dialog.remove()
    })
  })

  describe('F6 region cycling', () => {
    function pressF6(shiftKey = false) {
      const event = new KeyboardEvent('keydown', {
        key: 'F6',
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
      return event
    }

    it('steps forward through banner, nav, sidebar and main', () => {
      start()
      region('#header-btn').focus()

      pressF6()
      expect(document.activeElement).toBe(region('nav'))
      pressF6()
      expect(document.activeElement).toBe(region('aside'))
      pressF6()
      expect(document.activeElement).toBe(region('main'))
    })

    it('wraps around at the end', () => {
      start()
      region('#view-btn').focus()

      pressF6()

      expect(document.activeElement).toBe(region('[role="banner"]'))
    })

    it('steps backwards with Shift', () => {
      start()
      region('#sidebar-filter').focus()

      pressF6(true)

      expect(document.activeElement).toBe(region('nav'))
    })

    it('lands on the tree row rather than the sidebar container', () => {
      addTree(2)
      start()
      region('#nav-btn').focus()

      pressF6()

      expect(document.activeElement.id).toBe('row-2')
    })

    it('claims the key so the browser does not also act on it', () => {
      start()
      expect(pressF6().defaultPrevented).toBe(true)
    })

    // The sidebar is `v-show`n, so it stays in the DOM on routes without one.
    it('skips a pane that is not on screen', () => {
      start()
      region('aside').style.display = 'none'
      region('#nav-btn').focus()

      pressF6()

      expect(document.activeElement).toBe(region('main'))
    })

    it('stops listening after unmount', () => {
      start()
      region('#header-btn').focus()
      wrapper.unmount()
      wrapper = null

      pressF6()

      expect(document.activeElement.id).toBe('header-btn')
    })
  })

  describe('F6 pane indicator', () => {
    function pressKey(key, shiftKey = false) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
    }

    const pressF6 = (shiftKey = false) => pressKey('F6', shiftKey)

    it('marks the pane F6 landed on', () => {
      start()
      region('#header-btn').focus()

      pressF6()

      expect(markedRegion()).toBe(region('nav'))
      expect(regionFocus.activeRegion.value.label).toBe('Perspectives')
    })

    it('marks only one pane at a time', () => {
      start()
      region('#header-btn').focus()

      pressF6()
      pressF6()

      expect(layout.querySelectorAll('[data-region-focus]')).toHaveLength(1)
      expect(markedRegion()).toBe(region('aside'))
    })

    it('survives its own focus move onto a tree row', () => {
      addTree(2)
      start()
      region('#nav-btn').focus()

      pressF6()

      expect(document.activeElement.id).toBe('row-2')
      expect(markedRegion()).toBe(region('aside'))
    })

    it('goes when focus moves inside the pane', () => {
      start()
      region('#nav-btn').focus()
      pressF6()
      pressF6()

      region('#view-btn').focus()

      expect(markedRegion()).toBe(null)
      expect(regionFocus.activeRegion.value).toBe(null)
    })

    it('goes on any other key', () => {
      start()
      pressF6()

      pressKey('Tab')

      expect(markedRegion()).toBe(null)
    })

    it('stays for Shift and for Shift+F6', () => {
      start()
      region('#view-btn').focus()
      pressF6()

      pressKey('Shift', true)
      expect(markedRegion()).not.toBe(null)

      pressF6(true)
      expect(markedRegion()).toBe(region('main'))
    })

    it('goes on a click', () => {
      start()
      pressF6()

      document.dispatchEvent(new Event('pointerdown', { bubbles: true }))

      expect(markedRegion()).toBe(null)
    })

    it('goes when the window is resized', () => {
      start()
      pressF6()

      window.dispatchEvent(new Event('resize'))

      expect(markedRegion()).toBe(null)
    })

    it('does not appear when a navigation moves focus', async () => {
      addTree(1)
      start()

      await navigate('dashboards')

      expect(markedRegion()).toBe(null)
    })

    it('is cleaned up on unmount', () => {
      start()
      pressF6()
      const pane = markedRegion()

      wrapper.unmount()
      wrapper = null

      expect(pane.hasAttribute('data-region-focus')).toBe(false)
    })
  })
})
