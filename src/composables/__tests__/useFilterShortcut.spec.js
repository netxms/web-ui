import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useFilterShortcut } from '@/composables/useFilterShortcut'

let layout
let wrapper

// The shell: a sidebar with a filter above a tree, and a view with a filter above a table.
function buildLayout() {
  layout = document.createElement('div')
  layout.className = 'default-layout'
  layout.innerHTML = `
    <div role="banner"><button id="header-btn">h</button></div>
    <nav><button id="nav-btn">n</button></nav>
    <aside>
      <input id="sidebar-filter" data-filter-input />
      <div role="tree"><div role="treeitem" id="row" tabindex="0">r</div></div>
    </aside>
    <main tabindex="-1">
      <div id="view">
        <input id="view-filter" data-filter-input />
        <button id="view-btn">v</button>
      </div>
    </main>`
  document.body.append(layout)
}

function start() {
  wrapper = mount({
    setup() {
      useFilterShortcut()
      return () => null
    },
  })
}

function el(id) {
  return document.getElementById(id)
}

function press(key, options = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  return event
}

beforeEach(() => {
  buildLayout()
  start()
})

afterEach(() => {
  wrapper?.unmount()
  layout.remove()
  document.body.innerHTML = ''
})

describe('useFilterShortcut', () => {
  it('focuses the sidebar filter from a tree row', () => {
    el('row').focus()
    const event = press('/')
    expect(document.activeElement).toBe(el('sidebar-filter'))
    expect(event.defaultPrevented).toBe(true)
  })

  it('focuses the view filter from the view, not the sidebar one', () => {
    el('view-btn').focus()
    press('/')
    expect(document.activeElement).toBe(el('view-filter'))
  })

  it('widens past a view with no filter of its own', () => {
    el('view-filter').remove()
    el('view-btn').focus()
    press('/')
    expect(document.activeElement).toBe(el('sidebar-filter'))
  })

  it('falls back to the sidebar from the nav rail and from nothing focused', () => {
    el('nav-btn').focus()
    press('/')
    expect(document.activeElement).toBe(el('sidebar-filter'))

    document.activeElement.blur()
    press('/')
    expect(document.activeElement).toBe(el('sidebar-filter'))
  })

  describe('on a surface that takes no focus', () => {
    function clickCanvas() {
      const canvas = document.createElement('div')
      el('view').append(canvas)
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      return canvas
    }

    it('resolves from where the pointer went', () => {
      el('row').focus()
      clickCanvas()
      press('/')
      expect(document.activeElement).toBe(el('view-filter'))
    })

    it('gives way to focus moving afterwards', () => {
      clickCanvas()
      el('row').focus()
      press('/')
      expect(document.activeElement).toBe(el('sidebar-filter'))
    })
  })

  it('selects the text already in the field, so typing replaces it', () => {
    el('sidebar-filter').value = 'old query'
    el('row').focus()
    press('/')
    expect(el('sidebar-filter').selectionStart).toBe(0)
    expect(el('sidebar-filter').selectionEnd).toBe('old query'.length)
  })

  it('leaves the key alone while the user is typing', () => {
    el('view-filter').focus()
    const event = press('/')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(el('view-filter'))
  })

  it('ignores the key with a modifier held', () => {
    el('row').focus()
    press('/', { ctrlKey: true })
    expect(document.activeElement).toBe(el('row'))
  })

  it('skips fields that cannot be typed into', () => {
    el('view-filter').disabled = true
    el('view-btn').focus()
    press('/')
    expect(document.activeElement).toBe(el('sidebar-filter'))
  })

  it('skips a pane that is not on screen', () => {
    el('view-filter').remove()
    layout.querySelector('aside').style.display = 'none'
    el('view-btn').focus()
    press('/')
    expect(document.activeElement).toBe(el('view-btn'))
  })

  describe('with a dialog open', () => {
    function openDialog(inner = '<input id="dialog-filter" data-filter-input />') {
      const dialog = document.createElement('div')
      dialog.className = 'p-dialog'
      dialog.innerHTML = `${inner}<button id="dialog-btn">d</button>`
      document.body.append(dialog)
      return dialog
    }

    it('resolves inside the dialog', () => {
      openDialog()
      el('dialog-btn').focus()
      press('/')
      expect(document.activeElement).toBe(el('dialog-filter'))
    })

    it('never reaches a filter behind the dialog', () => {
      openDialog('')
      el('dialog-btn').focus()
      press('/')
      expect(document.activeElement).toBe(el('dialog-btn'))
    })

    it('leaves Escape to the dialog', () => {
      openDialog()
      el('dialog-btn').focus()
      press('/')
      press('Escape')
      expect(document.activeElement).toBe(el('dialog-filter'))
    })
  })

  describe('Escape', () => {
    it('returns the keyboard to where the shortcut took it from', () => {
      el('row').focus()
      press('/')
      press('Escape')
      expect(document.activeElement).toBe(el('row'))
      expect(el('row').hasAttribute('data-focus-ring')).toBe(true)
    })

    it('stays in the field while it still holds a query', () => {
      el('row').focus()
      press('/')
      el('sidebar-filter').value = 'core'
      press('Escape')
      expect(document.activeElement).toBe(el('sidebar-filter'))
    })

    it('stays in a field that is still filtering on chips', () => {
      el('row').focus()
      press('/')
      el('sidebar-filter').dataset.filterInput = 'active'
      press('Escape')
      expect(document.activeElement).toBe(el('sidebar-filter'))

      el('sidebar-filter').dataset.filterInput = ''
      press('Escape')
      expect(document.activeElement).toBe(el('row'))
    })

    it('does nothing when the field was reached some other way', () => {
      el('sidebar-filter').focus()
      press('Escape')
      expect(document.activeElement).toBe(el('sidebar-filter'))
    })
  })

  it('stops listening once unmounted', () => {
    wrapper.unmount()
    wrapper = null
    el('row').focus()
    press('/')
    expect(document.activeElement).toBe(el('row'))
  })
})
