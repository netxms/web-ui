import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RackCanvas from '../RackCanvas.vue'
import { PANEL_WIDTH_PER_U } from '../rackUtils.js'

const ELEMENTS = [
  {
    id: 'obj-101',
    slot: 1,
    heightU: 2,
    orientation: 'full',
    passiveType: null,
    objectId: 101,
    objectName: 'core-sw-01',
    objectClass: 'Node',
    objectStatus: 0,
    label: 'core-sw-01',
  },
]

function mountCanvas(props = {}) {
  return mount(RackCanvas, {
    props: { rackHeight: 6, rackMode: 'front', elements: ELEMENTS, ...props },
  })
}

describe('RackCanvas read-only mode', () => {
  it('offers no editing affordances by default', () => {
    const wrapper = mountCanvas()

    expect(wrapper.find('.rack-element__resize-handle').exists()).toBe(false)
    expect(wrapper.find('.slot-add-icon').exists()).toBe(false)

    const freeBlock = wrapper.find('.rack-slot--free')
    expect(freeBlock.attributes('role')).toBeUndefined()
    expect(freeBlock.attributes('tabindex')).toBeUndefined()
  })

  it('ignores the interactions that would change the layout', async () => {
    const wrapper = mountCanvas()

    await wrapper.find('.rack-element').trigger('pointerdown')
    await wrapper.find('.rack-element').trigger('keydown', { key: 'Delete' })
    await wrapper.find('.rack-slot--free').trigger('click')
    await wrapper.find('.rack-slot--free').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('move-element')).toBeUndefined()
    expect(wrapper.emitted('remove-element')).toBeUndefined()
    expect(wrapper.emitted('add-to-slot')).toBeUndefined()
  })

  it('still selects and reports right-clicks', async () => {
    const wrapper = mountCanvas()

    await wrapper.find('.rack-element').trigger('click')
    expect(wrapper.emitted('select-element')[0]).toEqual(['obj-101'])

    await wrapper.find('.rack-element').trigger('contextmenu')
    expect(wrapper.emitted('element-contextmenu')[0][1]).toMatchObject({ objectId: 101 })

    await wrapper.find('.rack-slot--free').trigger('contextmenu')
    // Free slots start above the 2U element, so the first free block starts at slot 3.
    expect(wrapper.emitted('slot-contextmenu')[0].slice(1)).toEqual([3, 'front'])
  })
})

describe('RackCanvas proportions', () => {
  it('keeps the panel a real 19-inch panel at every zoom level', async () => {
    const wrapper = mountCanvas({ rowHeight: 30 })
    const panelWidth = () => wrapper.find('.rack-panel').attributes('style')

    expect(panelWidth()).toContain(`width: ${Math.round(30 * PANEL_WIDTH_PER_U)}px`)

    await wrapper.setProps({ rowHeight: 16 })
    expect(panelWidth()).toContain(`width: ${Math.round(16 * PANEL_WIDTH_PER_U)}px`)

    // The column header sits above the panel and has to track the same width.
    expect(wrapper.find('.rack-panel-header').attributes('style')).toContain(
      `width: ${Math.round(16 * PANEL_WIDTH_PER_U)}px`,
    )
  })
})

describe('RackCanvas editable mode', () => {
  it('exposes the editing affordances', () => {
    const wrapper = mountCanvas({ editable: true })

    expect(wrapper.find('.rack-element__resize-handle').exists()).toBe(true)
    expect(wrapper.find('.slot-add-icon').exists()).toBe(true)

    const freeBlock = wrapper.find('.rack-slot--free')
    expect(freeBlock.attributes('role')).toBe('button')
    expect(freeBlock.attributes('tabindex')).toBe('0')
  })

  it('removes the focused element on Delete and adds from a free block', async () => {
    const wrapper = mountCanvas({ editable: true })

    await wrapper.find('.rack-element').trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('remove-element')[0]).toEqual(['obj-101'])

    await wrapper.find('.rack-slot--free').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('add-to-slot')[0]).toEqual([3, 'front'])
  })
})
