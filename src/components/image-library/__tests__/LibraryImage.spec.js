import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

vi.mock('@/api/imageLibraryApi', () => ({
  getImageDataUrl: vi.fn(),
}))

import { getImageDataUrl } from '@/api/imageLibraryApi'
import LibraryImage from '../LibraryImage.vue'

/** Lets a test decide when (or whether) the element is treated as visible. */
function installIntersectionObserver() {
  const instances = []
  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback
      this.observed = []
      instances.push(this)
    }
    observe(el) {
      this.observed.push(el)
    }
    disconnect() {
      this.disconnected = true
    }
  }
  globalThis.IntersectionObserver = FakeIntersectionObserver
  return instances
}

function mountImage(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return mount(LibraryImage, {
    props: { guid: 'g1', alt: 'Switch', ...props },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
}

describe('LibraryImage', () => {
  let observers

  beforeEach(() => {
    vi.clearAllMocks()
    getImageDataUrl.mockResolvedValue('blob:resolved')
    observers = installIntersectionObserver()
  })

  afterEach(() => {
    delete globalThis.IntersectionObserver
  })

  it('does not fetch the bytes while the element is off screen', async () => {
    const wrapper = mountImage()
    await flushPromises()

    expect(getImageDataUrl).not.toHaveBeenCalled()
    expect(wrapper.element.tagName).toBe('IMG')
    expect(wrapper.attributes('src')).toMatch(/^data:image\/gif/)
    expect(wrapper.classes()).toContain('library-image--pending')
  })

  it('fetches once the element scrolls into view', async () => {
    const wrapper = mountImage()
    await flushPromises()

    observers[0].callback([{ isIntersecting: true }])
    await flushPromises()

    expect(getImageDataUrl).toHaveBeenCalledExactlyOnceWith('g1')
    expect(wrapper.attributes('src')).toBe('blob:resolved')
    expect(wrapper.classes()).not.toContain('library-image--pending')
  })

  it('stops observing after the first intersection', async () => {
    mountImage()
    await flushPromises()

    observers[0].callback([{ isIntersecting: true }])
    await flushPromises()

    expect(observers[0].disconnected).toBe(true)
  })

  it('ignores callbacks that report the element as not intersecting', async () => {
    mountImage()
    await flushPromises()

    observers[0].callback([{ isIntersecting: false }])
    await flushPromises()

    expect(getImageDataUrl).not.toHaveBeenCalled()
  })

  it('skips the viewport check when eager', async () => {
    mountImage({ eager: true })
    await flushPromises()

    expect(observers).toHaveLength(0)
    expect(getImageDataUrl).toHaveBeenCalledExactlyOnceWith('g1')
  })

  it('renders the placeholder and fetches nothing without a guid', async () => {
    const wrapper = mountImage({ guid: null })
    await flushPromises()

    observers[0].callback([{ isIntersecting: true }])
    await flushPromises()

    expect(getImageDataUrl).not.toHaveBeenCalled()
    expect(wrapper.attributes('src')).toMatch(/^data:image\/gif/)
  })

  it('loads immediately where IntersectionObserver is unavailable', async () => {
    delete globalThis.IntersectionObserver

    mountImage()
    await flushPromises()

    expect(getImageDataUrl).toHaveBeenCalledExactlyOnceWith('g1')
  })

  it('keeps the alt text off the placeholder so it is not announced while empty', async () => {
    const wrapper = mountImage()
    await flushPromises()

    expect(wrapper.attributes('alt')).toBe('')
    expect(wrapper.attributes('aria-hidden')).toBe('true')

    observers[0].callback([{ isIntersecting: true }])
    await flushPromises()

    expect(wrapper.attributes('alt')).toBe('Switch')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })
})
