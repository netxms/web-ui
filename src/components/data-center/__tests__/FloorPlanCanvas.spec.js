import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))

const FloorPlanCanvas = (await import('../FloorPlanCanvas.vue')).default

const rack = (id, name, width, depth, x) => ({
  id,
  name,
  placed: true,
  x,
  y: 1000,
  rotation: 0,
  width,
  depth,
})

const plainLook = () => ({ fill: '#888888', edge: null, band: null, label: null, ring: null })

// The test ResizeObserver never reports a size, so the canvas draws at its fallback 0.05 px/mm.
function mountCanvas({ racks = [], passiveElements = [], ...extra }) {
  return mount(FloorPlanCanvas, {
    props: {
      plan: {
        roomId: 1,
        name: 'Room',
        gridTileSize: 600,
        outline: [
          { x: 0, y: 0 },
          { x: 20000, y: 0 },
          { x: 20000, y: 10000 },
          { x: 0, y: 10000 },
        ],
        racks,
        passiveElements,
      },
      lookFor: plainLook,
      ...extra,
    },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

const labels = (wrapper, selector) => wrapper.findAll(selector).map((t) => t.text())

async function press(wrapper, el, type, init = {}) {
  el.element.dispatchEvent(
    new MouseEvent(type, { bubbles: true, button: 0, clientX: 10, clientY: 10, ...init }),
  )
  await wrapper.vm.$nextTick()
}

describe('FloorPlanCanvas labels', () => {
  it('shortens a rack name in the middle at the smallest size, and drops it when too little fits', () => {
    const wrapper = mountCanvas({
      racks: [
        rack(1, 'A01', 600, 1200, 1000),
        // 50 px wide: seven characters at 8 px.
        rack(2, 'Row-A-Rack-01', 1000, 1200, 3000),
        // 15 px wide: two.
        rack(3, 'Narrow rack', 300, 1200, 5000),
        // Wide enough, but 5 px tall.
        rack(4, 'Flat', 2000, 100, 7000),
      ],
    })
    expect(labels(wrapper, '.fp-rack-label')).toEqual(['A01', 'Row\u2026-01'])
  })

  it('labels doors, but not columns or walls', () => {
    const element = (id, type, name) => ({
      id,
      type,
      name,
      x: 1000 + id * 4000,
      y: 1000,
      rotation: 0,
      width: 3000,
      depth: 1000,
    })
    const wrapper = mountCanvas({
      passiveElements: [
        element(1, 'DOOR', 'Fire exit'),
        element(2, 'COLUMN', 'Column 1'),
        element(3, 'WALL', 'Wall 1'),
      ],
    })
    expect(labels(wrapper, '.fp-el-label')).toEqual(['Fire exit'])
  })
})

describe('FloorPlanCanvas racks', () => {
  const twoRacks = [rack(1, 'A01', 600, 1200, 1000), rack(2, 'A02', 600, 1200, 1600)]
  const points = (el) => el.attributes('points')

  it('paints body, band, arrow and label from the look', () => {
    const wrapper = mountCanvas({
      racks: twoRacks,
      lookFor: (r) =>
        r.id === 1
          ? { fill: '#e1f9e7', edge: '#4abf76', band: '#4abf76', label: '#27643e', ring: null }
          : plainLook(),
    })
    const body = wrapper.find('.fp-rack-body')
    expect(body.attributes('fill')).toBe('#e1f9e7')
    // jsdom gives inline colors back as rgb().
    expect(body.element.style.stroke).toBe('rgb(74, 191, 118)')
    expect(wrapper.find('.fp-rack-front').element.style.fill).toBe('rgb(74, 191, 118)')
    expect(wrapper.find('.fp-rack-label').element.style.fill).toBe('rgb(39, 100, 62)')
    // 180 mm band at 0.05 px/mm is 9 px: both racks get an arrow in the body color.
    const arrows = wrapper.findAll('.fp-rack-arrow')
    expect(arrows.map((a) => a.attributes('fill'))).toEqual(['#e1f9e7', '#888888'])
  })

  it('draws a rack without a value hatched, with no style of its own', () => {
    const wrapper = mountCanvas({
      racks: twoRacks.slice(0, 1),
      lookFor: () => ({ fill: null, edge: null, band: null, label: null, ring: null }),
    })
    expect(wrapper.find('.fp-rack-body').attributes('fill')).toBe('url(#fp-nodata-1)')
    expect(wrapper.find('.fp-rack-body').attributes('style')).toBeUndefined()
  })

  it('outlines a rack that needs attention inside its edge', () => {
    const wrapper = mountCanvas({
      racks: twoRacks.slice(0, 1),
      lookFor: () => ({ ...plainLook(), ring: '#ea580c' }),
    })
    const ring = wrapper.find('.fp-rack-ring')
    expect(ring.attributes('stroke')).toBe('#ea580c')
    // 1.75 px in at 0.05 px/mm.
    expect(points(ring).split(' ')[0]).toBe('1035,1035')
  })

  it('rings the selected rack above every rack, and the hovered one thinner', async () => {
    const wrapper = mountCanvas({ racks: twoRacks, selectedKeys: new Set(['r:1']) })
    const layer = () => wrapper.find('.fp-rack-rings')
    expect(layer().findAll('.fp-rack-ring--selected')).toHaveLength(1)
    // Drawn after the racks, so a neighbour cannot cover it.
    const order = wrapper.findAll('g').map((g) => g.classes())
    expect(order.findIndex((c) => c.includes('fp-rack-rings'))).toBeGreaterThan(
      order.findIndex((c) => c.includes('fp-racks')),
    )
    await wrapper.findAll('.fp-rack')[1].trigger('pointerenter')
    expect(layer().findAll('.fp-rack-ring--hover')).toHaveLength(1)
    expect(layer().find('.fp-rack-ring--hover .fp-ring').attributes('stroke-width')).toBe('1.5')
    await wrapper.findAll('.fp-rack')[1].trigger('pointerleave')
    expect(layer().findAll('.fp-rack-ring--hover')).toHaveLength(0)
  })

  it('clears the selection on a click on the floor when viewing, not on a pan or a rack', async () => {
    const wrapper = mountCanvas({ racks: twoRacks, selectedKeys: new Set(['r:1']) })
    const svg = wrapper.find('svg')
    await press(wrapper, wrapper.find('.fp-rack'), 'pointerdown')
    await press(wrapper, wrapper.find('.fp-rack'), 'pointerup')
    await press(wrapper, svg, 'pointerdown')
    await press(wrapper, svg, 'pointermove', { clientX: 60 })
    await press(wrapper, svg, 'pointerup', { clientX: 60 })
    expect(wrapper.emitted('clear-selection')).toBeUndefined()
    await press(wrapper, svg, 'pointerdown')
    await press(wrapper, svg, 'pointerup')
    expect(wrapper.emitted('clear-selection')).toHaveLength(1)
  })
})

describe('FloorPlanCanvas ground', () => {
  it('lays the floor on the table, hatches the bounding box outside it and puts a backdrop on top', () => {
    const wrapper = mountCanvas({
      backdrop: { url: 'data:image/png;base64,AA==', x: 0, y: 0, width: 3000, height: 1500 },
    })
    const svg = wrapper.find('svg').element
    const names = [...svg.children].map((el) =>
      el.tagName === 'rect' ? el.getAttribute('fill') : el.getAttribute('class'),
    )
    const at = (name) => names.indexOf(name)
    expect(at('url(#fp-dots-1)')).toBeGreaterThan(-1)
    expect(at('url(#fp-outside-1)')).toBeGreaterThan(at('url(#fp-dots-1)'))
    expect(at('fp-floor')).toBeGreaterThan(at('url(#fp-outside-1)'))
    expect(at('fp-backdrop')).toBeGreaterThan(at('fp-floor'))
  })

  it('leaves the dots out without a tile grid', () => {
    const wrapper = mountCanvas({})
    expect(wrapper.find('[id^="fp-dots-"]').exists()).toBe(true)
    const noGrid = mount(FloorPlanCanvas, {
      props: {
        plan: { roomId: 2, name: 'Room', gridTileSize: 0, outline: [], racks: [] },
        lookFor: plainLook,
      },
      global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
    })
    expect(noGrid.find('[id^="fp-dots-"]').exists()).toBe(false)
  })
})

describe('FloorPlanCanvas backdrop mode', () => {
  const backdrop = { url: 'data:image/png;base64,AA==', x: 0, y: 0, width: 3000, height: 1500 }

  // jsdom has no SVG geometry: screen pixels stand for room millimetres one to one.
  beforeEach(() => {
    vi.stubGlobal(
      'DOMPoint',
      class {
        constructor(x, y) {
          this.x = x
          this.y = y
        }
        matrixTransform() {
          return this
        }
      },
    )
    SVGElement.prototype.getScreenCTM = () => ({ inverse: () => null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete SVGElement.prototype.getScreenCTM
  })

  it('frames the image with four corners, hides the outline handles and fades the racks', () => {
    const wrapper = mountCanvas({
      racks: [rack(1, 'A01', 600, 1200, 1000)],
      editMode: true,
      backdropMode: true,
      backdrop,
    })
    expect(wrapper.find('.fp-canvas').classes()).toContain('fp-canvas--backdrop')
    expect(wrapper.find('.fp-backdrop-frame').exists()).toBe(true)
    expect(wrapper.findAll('.fp-backdrop-edit .fp-handle').map((h) => h.attributes('data-handle')))
      .toEqual(['nw', 'ne', 'se', 'sw'])
    expect(wrapper.find('.fp-outline-edit').exists()).toBe(false)
  })

  it('starts a move on the image and a scale on a corner', async () => {
    const wrapper = mountCanvas({ editMode: true, backdropMode: true, backdrop })
    await press(wrapper, wrapper.find('.fp-backdrop-surface'), 'pointerdown')
    await press(wrapper, wrapper.find('svg'), 'pointerup')
    await press(wrapper, wrapper.find('[data-handle="se"]'), 'pointerdown')
    expect(wrapper.emitted('drag-start').map(([e]) => e.key)).toEqual(['b:move', 'b:se'])
  })

  it('reports a click off the image instead of picking it', async () => {
    const wrapper = mountCanvas({
      editMode: true,
      backdropMode: true,
      backdrop,
      calibration: { points: [] },
    })
    const svg = wrapper.find('svg')
    await press(wrapper, svg, 'pointerdown', { clientX: 5000 })
    await press(wrapper, svg, 'pointerup', { clientX: 5000 })
    expect(wrapper.emitted('calibrate-point')).toBeUndefined()
    expect(wrapper.emitted('calibrate-miss')).toEqual([[{ x: 5000, y: 10 }]])
  })

  it('picks a calibration point on a click, not on a pan', async () => {
    const wrapper = mountCanvas({
      editMode: true,
      backdropMode: true,
      backdrop,
      calibration: { points: [] },
    })
    expect(wrapper.find('.fp-canvas').classes()).toContain('fp-canvas--calibrate')
    expect(wrapper.find('.fp-backdrop-frame').exists()).toBe(false)
    const svg = wrapper.find('svg')
    await press(wrapper, svg, 'pointerdown')
    await press(wrapper, svg, 'pointerup')
    await press(wrapper, svg, 'pointerdown')
    await press(wrapper, svg, 'pointermove', { clientX: 60 })
    await press(wrapper, svg, 'pointerup', { clientX: 60 })
    expect(wrapper.emitted('calibrate-point')).toEqual([[{ x: 10, y: 10 }]])
  })

  it('draws the image at the opacity it is given', () => {
    const wrapper = mountCanvas({ backdrop, backdropOpacity: 0.4 })
    expect(wrapper.find('.fp-backdrop').element.style.opacity).toBe('0.4')
  })
})
