import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { useInViewport } from '../useInViewport'

function installIntersectionObserver() {
  const instances = []
  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback
      this.options = options
      this.observed = []
      this.disconnected = false
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

const Host = defineComponent({
  props: {
    rootMargin: { type: String, default: undefined },
    initial: { type: Boolean, default: undefined },
  },
  setup(props) {
    const el = ref(null)
    const options = {}
    if (props.rootMargin !== undefined) options.rootMargin = props.rootMargin
    if (props.initial !== undefined) options.initial = props.initial
    const inViewport = useInViewport(el, options)
    return { el, inViewport }
  },
  render() {
    return h('div', { ref: 'el' })
  },
})

describe('useInViewport', () => {
  let observers

  beforeEach(() => {
    observers = installIntersectionObserver()
  })

  afterEach(() => {
    delete globalThis.IntersectionObserver
  })

  it('starts hidden and observes the element with a default root margin', () => {
    const wrapper = mount(Host)

    expect(wrapper.vm.inViewport).toBe(false)
    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([wrapper.vm.el])
    expect(observers[0].options.rootMargin).toBe('300px')
  })

  it('takes a caller-supplied root margin', () => {
    mount(Host, { props: { rootMargin: '0px' } })
    expect(observers[0].options.rootMargin).toBe('0px')
  })

  it('honours an initial visibility of true, then lets the observer correct it', async () => {
    const wrapper = mount(Host, { props: { initial: true } })
    expect(wrapper.vm.inViewport).toBe(true)

    observers[0].callback([{ isIntersecting: false }])
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.inViewport).toBe(false)
  })

  it('flips in both directions and keeps observing', async () => {
    const wrapper = mount(Host)

    observers[0].callback([{ isIntersecting: true }])
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.inViewport).toBe(true)
    expect(observers[0].disconnected).toBe(false)

    observers[0].callback([{ isIntersecting: false }])
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.inViewport).toBe(false)

    observers[0].callback([{ isIntersecting: true }])
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.inViewport).toBe(true)
  })

  it('disconnects on unmount', () => {
    const wrapper = mount(Host)
    wrapper.unmount()
    expect(observers[0].disconnected).toBe(true)
  })

  it('reports visible when the browser has no IntersectionObserver', () => {
    delete globalThis.IntersectionObserver
    const wrapper = mount(Host)

    expect(wrapper.vm.inViewport).toBe(true)
    expect(observers).toHaveLength(0)
  })
})
