import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useActionShortcuts } from '@/composables/useActionShortcuts'

let container
let wrapper

function setup(items, containerRef, options = {}) {
  wrapper = mount({
    setup() {
      useActionShortcuts(ref(items), { containerRef, ...options })
      return () => null
    },
  })
}

function press(key, target = container) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  wrapper?.unmount()
  container.remove()
})

describe('useActionShortcuts', () => {
  it('runs the action whose shortcut matches the key', () => {
    const command = vi.fn()
    setup([{ id: 'object.rename', shortcut: 'F2', command }], ref(container))
    press('F2')
    expect(command).toHaveBeenCalledOnce()
  })

  it('maps Delete to the Del label and Enter to Enter', () => {
    const del = vi.fn()
    const props = vi.fn()
    setup(
      [
        { id: 'object.delete', shortcut: 'Del', command: del },
        { id: 'object.properties', shortcut: 'Enter', command: props },
      ],
      ref(container),
    )
    press('Delete')
    press('Enter')
    expect(del).toHaveBeenCalledOnce()
    expect(props).toHaveBeenCalledOnce()
  })

  it('ignores keys outside the container', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'F2', command }], ref(container))
    const outside = document.createElement('div')
    document.body.append(outside)
    press('F2', outside)
    expect(command).not.toHaveBeenCalled()
    outside.remove()
  })

  it('does nothing when the container ref is empty', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'F2', command }], ref(null))
    press('F2')
    expect(command).not.toHaveBeenCalled()
  })

  it('never steals a key from a text field', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'Enter', command }], ref(container))
    const input = document.createElement('input')
    container.append(input)
    press('Enter', input)
    expect(command).not.toHaveBeenCalled()
  })

  it('never steals a key from a contentEditable region', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'Enter', command }], ref(container))
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    container.append(editor)
    press('Enter', editor)
    expect(command).not.toHaveBeenCalled()
  })

  it('ignores modified key presses so app hotkeys still work', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'Enter', command }], ref(container))
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
    Object.defineProperty(event, 'target', { value: container })
    window.dispatchEvent(event)
    expect(command).not.toHaveBeenCalled()
  })

  it('skips disabled actions', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'F2', disabled: true, command }], ref(container))
    press('F2')
    expect(command).not.toHaveBeenCalled()
  })

  it('ignores unbound keys', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'F2', command }], ref(container))
    press('Escape')
    press('a')
    expect(command).not.toHaveBeenCalled()
  })

  it('prevents the default browser behaviour when it handles a key', () => {
    setup([{ id: 'a', shortcut: 'F2', command: vi.fn() }], ref(container))
    expect(press('F2').defaultPrevented).toBe(true)
  })

  it('stops listening after unmount', () => {
    const command = vi.fn()
    setup([{ id: 'a', shortcut: 'F2', command }], ref(container))
    wrapper.unmount()
    wrapper = null
    press('F2')
    expect(command).not.toHaveBeenCalled()
  })

  describe('two scopes', () => {
    let outer, elsewhere

    beforeEach(() => {
      outer = document.createElement('div')
      elsewhere = document.createElement('div')
      outer.append(elsewhere, container)
      document.body.append(outer)
    })

    afterEach(() => outer.remove())

    function setupScoped(items) {
      setup(items, ref(container), {
        outerRef: ref(outer),
        rowScopedShortcuts: ['Del', 'Enter'],
      })
    }

    it('fires an object-scoped shortcut from anywhere in the perspective', () => {
      const command = vi.fn()
      setupScoped([{ id: 'object.rename', shortcut: 'F2', command }])
      press('F2', elsewhere)
      expect(command).toHaveBeenCalledOnce()
    })

    it('holds a row-scoped shortcut to the tree', () => {
      const del = vi.fn()
      setupScoped([{ id: 'object.delete', shortcut: 'Del', command: del }])

      press('Delete', elsewhere)
      expect(del).not.toHaveBeenCalled()

      press('Delete', container)
      expect(del).toHaveBeenCalledOnce()
    })

    it('still ignores keys from outside the perspective entirely', () => {
      const command = vi.fn()
      setupScoped([{ id: 'a', shortcut: 'F2', command }])
      const outside = document.createElement('div')
      document.body.append(outside)
      press('F2', outside)
      expect(command).not.toHaveBeenCalled()
      outside.remove()
    })

    it('keeps the narrow scope when no outer element is given', () => {
      const command = vi.fn()
      setup([{ id: 'a', shortcut: 'F2', command }], ref(container))
      press('F2', elsewhere)
      expect(command).not.toHaveBeenCalled()
    })
  })
})
