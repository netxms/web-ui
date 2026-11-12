// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  findHiddenTabs,
  findTabSide,
  getScrollState,
  wheelScrollDistance,
} from '@/composables/useTabOverflow'

/** Six 100px tabs laid out end to end in a 1000px-wide strip. */
const tabs = [
  { key: 'a', offsetLeft: 0, offsetWidth: 100 },
  { key: 'b', offsetLeft: 100, offsetWidth: 100 },
  { key: 'c', offsetLeft: 200, offsetWidth: 100 },
  { key: 'd', offsetLeft: 300, offsetWidth: 100 },
  { key: 'e', offsetLeft: 400, offsetWidth: 100 },
  { key: 'f', offsetLeft: 500, offsetWidth: 100 },
]

describe('findHiddenTabs', () => {
  it('reports nothing when every tab fits in the viewport', () => {
    expect(findHiddenTabs(tabs, { scrollLeft: 0, clientWidth: 600 })).toEqual([])
  })

  it('reports tabs scrolled off the left edge', () => {
    expect(findHiddenTabs(tabs, { scrollLeft: 200, clientWidth: 400 })).toEqual(['a', 'b'])
  })

  it('reports tabs past the right edge', () => {
    expect(findHiddenTabs(tabs, { scrollLeft: 0, clientWidth: 300 })).toEqual(['d', 'e', 'f'])
  })

  it('counts a partially clipped tab as hidden', () => {
    expect(findHiddenTabs(tabs, { scrollLeft: 0, clientWidth: 350 })).toEqual(['d', 'e', 'f'])
  })

  it('treats a sub-pixel overhang as still visible', () => {
    expect(findHiddenTabs(tabs, { scrollLeft: 0, clientWidth: 299.6 })).toEqual(['d', 'e', 'f'])
  })

  it('reports nothing before the strip has been laid out', () => {
    const unmeasured = tabs.map((t) => ({ ...t, offsetLeft: 0, offsetWidth: 0 }))
    expect(findHiddenTabs(unmeasured, { scrollLeft: 0, clientWidth: 0 })).toEqual([])
  })
})

describe('findTabSide', () => {
  const viewport = { scrollLeft: 200, clientWidth: 200 }

  it('reports the edge a tab runs past', () => {
    expect(findTabSide(tabs[0], viewport)).toBe('left')
    expect(findTabSide(tabs[4], viewport)).toBe('right')
  })

  it('counts a clipped tab as past that edge', () => {
    expect(findTabSide(tabs[1], { scrollLeft: 150, clientWidth: 200 })).toBe('left')
    expect(findTabSide(tabs[3], { scrollLeft: 150, clientWidth: 200 })).toBe('right')
  })

  it('reports nothing for a tab in view', () => {
    expect(findTabSide(tabs[2], viewport)).toBeNull()
    expect(findTabSide(tabs[3], viewport)).toBeNull()
  })
})

describe('getScrollState', () => {
  it('offers no scrolling when the content fits', () => {
    expect(getScrollState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 })).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    })
  })

  it('offers only right at the start of an overflowing strip', () => {
    expect(getScrollState({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    })
  })

  it('offers only left at the end of an overflowing strip', () => {
    expect(getScrollState({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    })
  })

  it('offers both directions in the middle', () => {
    expect(getScrollState({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 })).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    })
  })

  it('ignores a sub-pixel remainder at the end', () => {
    expect(getScrollState({ scrollLeft: 299.4, scrollWidth: 600, clientWidth: 300 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    })
  })
})

describe('wheelScrollDistance', () => {
  it('turns a pixel-mode vertical wheel into the same horizontal distance', () => {
    expect(wheelScrollDistance({ deltaX: 0, deltaY: 120, deltaMode: 0 }, 300)).toBe(120)
  })

  it('scrolls back up the strip on an upward wheel', () => {
    expect(wheelScrollDistance({ deltaX: 0, deltaY: -120, deltaMode: 0 }, 300)).toBe(-120)
  })

  it('scales line-mode deltas into pixels', () => {
    expect(wheelScrollDistance({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 300)).toBe(48)
  })

  it('scales page-mode deltas by the visible width', () => {
    expect(wheelScrollDistance({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 300)).toBe(300)
  })

  it('leaves a wheel that is already horizontal to the browser', () => {
    expect(wheelScrollDistance({ deltaX: -40, deltaY: 10, deltaMode: 0 }, 300)).toBe(0)
  })

  it('ignores a wheel with no vertical component', () => {
    expect(wheelScrollDistance({ deltaX: 0, deltaY: 0, deltaMode: 0 }, 300)).toBe(0)
  })
})
