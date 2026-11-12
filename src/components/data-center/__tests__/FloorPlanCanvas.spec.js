import { describe, it, expect, vi } from 'vitest'
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

// The test ResizeObserver never reports a size, so the canvas draws at its fallback 0.05 px/mm.
function mountCanvas({ racks = [], passiveElements = [] }) {
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
      fillFor: () => '#888888',
    },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

const labels = (wrapper, selector) => wrapper.findAll(selector).map((t) => t.text())

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
