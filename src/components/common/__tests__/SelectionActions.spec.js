import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import SelectionActions from '../SelectionActions.vue'

function mountActions(props) {
  return mount(SelectionActions, {
    props: { count: 2, actions: [], ...props },
    global: { plugins: [PrimeVue] },
  })
}

describe('SelectionActions', () => {
  it('shows nothing without a selection, but keeps its place', () => {
    const wrapper = mountActions({ count: 0, actions: [{ label: 'Preview', icon: 'pi pi-eye' }] })

    expect(wrapper.find('.selection-actions').exists()).toBe(true)
    expect(wrapper.text()).toBe('')
  })

  it('says how many are selected and runs the action clicked', async () => {
    const command = vi.fn()
    const wrapper = mountActions({ actions: [{ label: 'Preview', icon: 'pi pi-eye', command }] })

    expect(wrapper.text()).toContain('2 selected')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Preview')
      .trigger('click')

    expect(command).toHaveBeenCalledTimes(1)
    expect(command.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
  })

  it('renders an action with an href as a link, for a new tab on ctrl or middle click', () => {
    const wrapper = mountActions({
      actions: [{ label: 'Line chart', icon: 'pi pi-chart-line', href: '/chart?d=1' }],
    })

    expect(wrapper.find('a').attributes('href')).toBe('/chart?d=1')
  })

  it('emits clear', async () => {
    const wrapper = mountActions()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Clear')
      .trigger('click')

    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  describe('when the labels do not fit', () => {
    // jsdom does no layout: the observer is driven by hand, and the row claims a width.
    const LABELLED_WIDTH = 500
    const ICON_ROW_WIDTH = 200
    let resize
    let offsetWidth

    beforeEach(() => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback) {
            resize = (width) => callback([{ contentRect: { width, height: 32 } }])
          }
          observe() {}
          disconnect() {}
        },
      )
      offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get() {
          if (this.classList.contains('selection-actions__row')) return LABELLED_WIDTH
          return this.classList.contains('selection-actions__sizer') ? ICON_ROW_WIDTH : 0
        },
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
    })

    const actions = [
      { label: 'Line chart', icon: 'pi pi-chart-line' },
      { label: 'Preview', icon: 'pi pi-eye' },
    ]
    const labels = (wrapper) =>
      wrapper.findAll('.selection-actions__row .p-button-label').map((label) => label.text())

    it('drops to icons that keep their names, and back once there is room', async () => {
      const wrapper = mountActions({ actions })
      // The observer is attached once the mounted element reaches the size composable.
      await nextTick()

      resize(300)
      await nextTick()
      await nextTick()
      expect(labels(wrapper)).toEqual(['Clear'])
      expect(wrapper.find('button[aria-label="Preview"]').exists()).toBe(true)

      resize(LABELLED_WIDTH + 100)
      await nextTick()
      await nextTick()
      expect(labels(wrapper)).toEqual(['Line chart', 'Preview', 'Clear'])
    })

    it('never gets narrower than its icon row while something is selected', async () => {
      const wrapper = mountActions({ actions })
      await nextTick()
      resize(300)
      await nextTick()
      await nextTick()
      expect(wrapper.find('.selection-actions').attributes('style')).toContain(
        `min-width: calc(${ICON_ROW_WIDTH}px + 0.5rem)`,
      )

      await wrapper.setProps({ count: 0 })
      resize(300)
      await nextTick()
      expect(wrapper.find('.selection-actions').attributes('style')).toBeUndefined()
    })

    it('keeps its sizer out of focus and of the accessibility tree', async () => {
      const wrapper = mountActions({ actions })
      const sizer = wrapper.find('.selection-actions__sizer')
      expect(sizer.attributes('aria-hidden')).toBe('true')
      expect(sizer.attributes()).toHaveProperty('inert')
    })
  })
})
