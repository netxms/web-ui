import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.fn()

vi.mock('@/router', () => ({
  default: {
    resolve: (to) => ({ href: `/${to.name}/${to.params?.objectId ?? ''}` }),
    push: (...args) => push(...args),
  },
}))

const { useNavTarget } = await import('@/composables/useNavTarget')

const TARGET = { name: 'infrastructure', params: { objectId: 10 } }

function mouseEvent(type, props = {}) {
  return {
    type,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...props,
  }
}

let opened

beforeEach(() => {
  opened = { opener: {} }
  push.mockClear()
  vi.stubGlobal(
    'open',
    vi.fn(() => opened),
  )
})

describe('navBindings', () => {
  const { navBindings } = useNavTarget()

  it('runs the existing handler on a plain click and opens nothing', () => {
    const activate = vi.fn()
    const event = mouseEvent('click')
    navBindings(TARGET, activate).onClick(event)

    expect(activate).toHaveBeenCalledWith(event)
    expect(window.open).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('opens a new tab on ctrl+click without running the existing handler', () => {
    const activate = vi.fn()
    const event = mouseEvent('click', { ctrlKey: true })
    navBindings(TARGET, activate).onClick(event)

    expect(activate).not.toHaveBeenCalled()
    expect(window.open).toHaveBeenCalledWith('/infrastructure/10', '_blank')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('opens a new tab on middle click', () => {
    const event = mouseEvent('auxclick', { button: 1 })
    navBindings(TARGET, vi.fn()).onAuxclick(event)

    expect(window.open).toHaveBeenCalledWith('/infrastructure/10', '_blank')
  })

  it('ignores right click so the app context menu still opens', () => {
    const event = mouseEvent('auxclick', { button: 2 })
    navBindings(TARGET, vi.fn()).onAuxclick(event)

    expect(window.open).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('falls back to the existing handler when there is no target', () => {
    const activate = vi.fn()
    const event = mouseEvent('click', { ctrlKey: true })
    navBindings(null, activate).onClick(event)

    expect(activate).toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('suppresses the middle-click autoscroll cursor but never touches other buttons', () => {
    const { onMousedown } = navBindings(TARGET, vi.fn())

    const middle = mouseEvent('mousedown', { button: 1 })
    onMousedown(middle)
    expect(middle.preventDefault).toHaveBeenCalled()

    const left = mouseEvent('mousedown', { button: 0 })
    onMousedown(left)
    expect(left.preventDefault).not.toHaveBeenCalled()
  })

  describe('keyboard activation', () => {
    function keyEvent(key, props = {}) {
      const element = { matches: () => false }
      return {
        type: 'keydown',
        key,
        target: element,
        currentTarget: element,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...props,
      }
    }

    it('exposes tabindex so the element is reachable by Tab', () => {
      expect(navBindings(TARGET, vi.fn()).tabindex).toBe(0)
    })

    it.each(['Enter', ' '])('activates on %s and stops the default action', (key) => {
      const activate = vi.fn()
      const event = keyEvent(key)
      navBindings(TARGET, activate).onKeydown(event)

      expect(activate).toHaveBeenCalledWith(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(window.open).not.toHaveBeenCalled()
    })

    it('ignores keys that are not activation keys', () => {
      const activate = vi.fn()
      const event = keyEvent('a')
      navBindings(TARGET, activate).onKeydown(event)

      expect(activate).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('opens a new tab on ctrl+Enter without running the existing handler', () => {
      const activate = vi.fn()
      const event = keyEvent('Enter', { ctrlKey: true })
      navBindings(TARGET, activate).onKeydown(event)

      expect(activate).not.toHaveBeenCalled()
      expect(window.open).toHaveBeenCalledWith('/infrastructure/10', '_blank')
    })

    it('ignores a keypress that bubbled up from a nested control', () => {
      const activate = vi.fn()
      const event = keyEvent('Enter', { target: { matches: () => false } })
      navBindings(TARGET, activate).onKeydown(event)

      expect(activate).not.toHaveBeenCalled()
    })

    it('leaves natively activatable elements to the browser, avoiding a double fire', () => {
      const activate = vi.fn()
      const button = { matches: (sel) => sel.includes('button') }
      const event = keyEvent('Enter', { target: button, currentTarget: button })
      navBindings(TARGET, activate).onKeydown(event)

      expect(activate).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})

describe('linkBindings', () => {
  const { linkBindings } = useNavTarget()

  it('resolves the href so the anchor shows a real URL on hover', () => {
    expect(linkBindings(TARGET).href).toBe('/infrastructure/10')
  })

  it('routes in-app on a plain left click instead of letting the browser follow the href', () => {
    const event = mouseEvent('click')
    linkBindings(TARGET).onClick(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(TARGET)
  })

  it('runs the activate hook before navigating', () => {
    const order = []
    const onActivate = vi.fn(() => order.push('activate'))
    push.mockImplementation(() => order.push('push'))

    linkBindings(TARGET, onActivate).onClick(mouseEvent('click'))

    expect(order).toEqual(['activate', 'push'])
    push.mockReset()
  })

  it.each([
    ['ctrl+click', { ctrlKey: true }],
    ['cmd+click', { metaKey: true }],
    ['shift+click', { shiftKey: true }],
    ['middle click', { button: 1 }],
  ])('leaves %s to the browser', (_label, props) => {
    const event = mouseEvent('click', props)
    const onActivate = vi.fn()
    linkBindings(TARGET, onActivate).onClick(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('leaves an already-handled event alone', () => {
    const event = mouseEvent('click', { defaultPrevented: true })
    linkBindings(TARGET).onClick(event)

    expect(push).not.toHaveBeenCalled()
  })
})
