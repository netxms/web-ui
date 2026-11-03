import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import {
  findTargetSide,
  getVerticalScrollState,
  revealDistance,
  useVerticalOverflow,
} from '@/composables/useVerticalOverflow'

/** A 400px-tall scroller whose top edge sits at y = 100, with 40px fades. */
const viewport = { top: 100, bottom: 500 }
const INSET = 40

describe('getVerticalScrollState', () => {
  it('offers no scrolling when the content fits', () => {
    expect(getVerticalScrollState({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    })
  })

  it('offers only down at the top of an overflowing list', () => {
    expect(getVerticalScrollState({ scrollTop: 0, scrollHeight: 700, clientHeight: 400 })).toEqual({
      canScrollUp: false,
      canScrollDown: true,
    })
  })

  it('offers only up at the bottom of an overflowing list', () => {
    expect(
      getVerticalScrollState({ scrollTop: 300, scrollHeight: 700, clientHeight: 400 }),
    ).toEqual({ canScrollUp: true, canScrollDown: false })
  })

  it('treats a sub-pixel remainder as the end', () => {
    expect(
      getVerticalScrollState({ scrollTop: 0.5, scrollHeight: 400.6, clientHeight: 400 }),
    ).toEqual({ canScrollUp: false, canScrollDown: false })
  })
})

describe('findTargetSide', () => {
  const both = { inset: INSET, canScrollUp: true, canScrollDown: true }

  it('reports nothing for a target in the readable window', () => {
    expect(findTargetSide({ top: 200, bottom: 250 }, viewport, both)).toBeNull()
  })

  it('reports a target scrolled off the top', () => {
    expect(findTargetSide({ top: 20, bottom: 70 }, viewport, both)).toBe('above')
  })

  it('reports a target scrolled off the bottom', () => {
    expect(findTargetSide({ top: 520, bottom: 570 }, viewport, both)).toBe('below')
  })

  it('counts a target whose middle is in the top fade as gone', () => {
    // Middle at 125, inside the 100-140 band.
    expect(findTargetSide({ top: 100, bottom: 150 }, viewport, both)).toBe('above')
  })

  it('keeps a target that only dips its edge into the fade', () => {
    // Bottom edge at 480 is in the 460-500 band, but the middle (455) is short of it.
    expect(findTargetSide({ top: 430, bottom: 480 }, viewport, both)).toBeNull()
  })

  it('ignores the band at an edge that cannot scroll, since it is not faded', () => {
    const atTop = { inset: INSET, canScrollUp: false, canScrollDown: true }
    expect(findTargetSide({ top: 100, bottom: 150 }, viewport, atTop)).toBeNull()
  })
})

describe('revealDistance', () => {
  it('is zero for a target clear of both fades', () => {
    expect(revealDistance({ top: 200, bottom: 250 }, viewport, INSET)).toBe(0)
  })

  it('scrolls up just far enough to clear the top fade', () => {
    expect(revealDistance({ top: 20, bottom: 70 }, viewport, INSET)).toBe(-120)
  })

  it('scrolls down just far enough to clear the bottom fade', () => {
    expect(revealDistance({ top: 520, bottom: 570 }, viewport, INSET)).toBe(110)
  })
})

describe('useVerticalOverflow', () => {
  it('reports no overflow and no target side without layout (jsdom)', async () => {
    let overflow
    const Harness = defineComponent({
      setup() {
        const scrollRef = ref(null)
        const contentRef = ref(null)
        overflow = useVerticalOverflow(scrollRef, contentRef, '[aria-current="page"]')
        return () =>
          h('div', { ref: scrollRef }, [
            h('div', { ref: contentRef }, [h('a', { 'aria-current': 'page' }, 'Current')]),
          ])
      },
    })
    const wrapper = mount(Harness)
    await nextTick()

    expect(overflow.canScrollUp.value).toBe(false)
    expect(overflow.canScrollDown.value).toBe(false)
    expect(overflow.targetSide.value).toBeNull()
    overflow.revealTarget()
    overflow.scrollPage(1)
    wrapper.unmount()
  })
})
