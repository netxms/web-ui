import { describe, it, expect, vi } from 'vitest'
import { anchorEventAt, menuAnchorEvent } from '@/utils/menuAnchor'

function elementAt(rect) {
  return { getBoundingClientRect: () => rect }
}

describe('menuAnchorEvent', () => {
  it('keeps a pointer event at its own position', () => {
    const event = { pageX: 400, pageY: 300, currentTarget: elementAt({ left: 0, bottom: 0 }) }
    const anchored = menuAnchorEvent(event)

    expect(anchored.pageX).toBe(400)
    expect(anchored.pageY).toBe(300)
  })

  // A fractional offset is painted a fraction off during PrimeVue's open animation, then jumps.
  it('snaps fractional coordinates to whole pixels', () => {
    expect(menuAnchorEvent({ pageX: 400.4, pageY: 300.6 })).toMatchObject({
      pageX: 400,
      pageY: 301,
    })

    const anchored = anchorEventAt(elementAt({ left: 119.6, bottom: 64.2 }))

    expect(anchored.pageX).toBe(120)
    expect(anchored.pageY).toBe(64)
  })

  // Enter/Space on a button fires a click whose coordinates are both 0, which PrimeVue's
  // ContextMenu turns into a menu pinned to the top-left corner of the window.
  it('anchors a keyboard-fired click under the control it came from', () => {
    const anchored = menuAnchorEvent({
      pageX: 0,
      pageY: 0,
      currentTarget: elementAt({ left: 120, bottom: 64 }),
    })

    expect(anchored.pageX).toBe(120)
    expect(anchored.pageY).toBe(64)
  })

  it('reports page coordinates, not viewport ones', () => {
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(30)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(50)

    const anchored = menuAnchorEvent({
      pageX: 0,
      pageY: 0,
      currentTarget: elementAt({ left: 120, bottom: 64 }),
    })

    expect(anchored.pageX).toBe(150)
    expect(anchored.pageY).toBe(114)
    vi.restoreAllMocks()
  })

  // PrimeVue calls both on whatever it is handed, so the real event still has to see them.
  it('forwards the methods PrimeVue calls on the way in', () => {
    const source = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const anchored = anchorEventAt(elementAt({ left: 1, bottom: 2 }), source)

    anchored.preventDefault()
    anchored.stopPropagation()

    expect(source.preventDefault).toHaveBeenCalledOnce()
    expect(source.stopPropagation).toHaveBeenCalledOnce()
  })
})
