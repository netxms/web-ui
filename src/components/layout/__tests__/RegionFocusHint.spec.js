import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RegionFocusHint from '@/components/layout/RegionFocusHint.vue'

let wrapper

// jsdom does no layout, so the pill's measurements are supplied.
const nativeOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')

function stubPillWidth(width) {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: width })
}

function pane(left, width) {
  const element = document.createElement('nav')
  element.getBoundingClientRect = () => ({
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 700,
    height: 700,
  })
  return element
}

function pill() {
  return document.body.querySelector('.region-focus-hint')
}

// The position lands on the render after the first one, once the pill can measure itself.
async function mountHint(region) {
  wrapper = mount(RegionFocusHint, { props: { region }, attachTo: document.body })
  await nextTick()
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  if (nativeOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', nativeOffsetWidth)
  }
})

describe('RegionFocusHint', () => {
  it('shows nothing when no pane is marked', async () => {
    await mountHint(null)

    expect(pill()).toBe(null)
  })

  it('names the pane and how to carry on from it', async () => {
    await mountHint({ element: document.createElement('main'), label: 'Content' })

    expect(pill().textContent).toContain('Content')
    expect(pill().textContent).toContain('F6')
  })

  it('names the / shortcut only on a pane that has a filter', async () => {
    const withFilter = document.createElement('aside')
    withFilter.innerHTML = '<input data-filter-input />'
    await mountHint({ element: withFilter, label: 'Sidebar' })
    expect(pill().textContent).toContain('/ to filter')

    await wrapper.setProps({
      region: { element: document.createElement('main'), label: 'Content' },
    })
    expect(pill().textContent).not.toContain('/ to filter')
  })

  it('is hidden from screen readers', async () => {
    await mountHint({ element: document.createElement('main'), label: 'Content' })

    expect(pill().getAttribute('aria-hidden')).toBe('true')
    expect(pill().getAttribute('role')).toBe(null)
    expect(pill().getAttribute('aria-live')).toBe(null)
  })

  it('is taken out of the page flow', async () => {
    await mountHint({ element: document.createElement('main'), label: 'Content' })

    expect(pill().parentElement).toBe(document.body)
    expect(pill().style.top).not.toBe('')
    expect(pill().style.left).not.toBe('')
  })

  describe('placement', () => {
    // window.innerWidth is 1024 in jsdom.
    it('centres on a pane wide enough to hold it', async () => {
      stubPillWidth(300)

      await mountHint({ element: pane(324, 700), label: 'Content' })

      expect(pill().style.left).toBe('524px')
    })

    it('sits beside a narrow pane rather than over the window edge', async () => {
      stubPillWidth(300)

      await mountHint({ element: pane(0, 56), label: 'Perspectives' })

      expect(pill().style.left).toBe('64px')
    })

    it('sits on the other side of a narrow pane at the right edge', async () => {
      stubPillWidth(300)

      await mountHint({ element: pane(968, 56), label: 'Perspectives' })

      expect(pill().style.left).toBe('660px')
    })

    it('never leaves the window, even for a pill wider than the window', async () => {
      stubPillWidth(2000)

      await mountHint({ element: pane(0, 56), label: 'Perspectives' })

      expect(pill().style.left).toBe('8px')
    })
  })
})
