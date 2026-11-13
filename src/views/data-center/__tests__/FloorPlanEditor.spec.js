import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { DEMO_DATA_CENTER } from '@/api/demoSeeds'
import { adaptBaseObject } from '@/api/objectAdapters'
import { indexNodes } from '@/utils/dataCenter'

const { route, routerReplace } = vi.hoisted(() => ({
  route: { query: {}, hash: '' },
  routerReplace: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
  onBeforeRouteLeave: () => {},
  onBeforeRouteUpdate: () => {},
}))
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))

// The demo rooms stand in for rooms of the server: the plan is read from the seed, the save
// calls go to this mock.
const saveOp = vi.fn()
vi.mock('@/api/dataCenterApi', async (importOriginal) => ({
  ...(await importOriginal()),
  isDemoDataCenterId: () => false,
  saveFloorPlanOperation: (...args) => saveOp(...args),
}))

const roomObject = ref(null)
vi.mock('@/queries/useObjectQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useObject: () => ({ data: roomObject, isSuccess: ref(true), isError: ref(false) }),
}))

// A picked backdrop image has no bytes here; the plan still records it.
vi.mock('@/api/imageLibraryApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getImageDataUrl: () => Promise.resolve(null),
  getImage: (id) => Promise.resolve({ id, name: 'Drawing', dataUrl: null }),
}))

const confirmRequire = vi.fn()
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const { getDemoFacilityTrees } = await import('@/api/dataCenterApi')
const FloorPlanView = (await import('../subviews/FloorPlanView.vue')).default
const FloorPlanCanvas = (await import('@/components/data-center/FloorPlanCanvas.vue')).default
const FloorPlanBackdropPanel = (await import('@/components/data-center/FloorPlanBackdropPanel.vue'))
  .default

const nodes = indexNodes(getDemoFacilityTrees().map(adaptBaseObject))
const byName = (name) => [...nodes.values()].find((node) => node.name === name)
const rackId = (name) =>
  Object.values(DEMO_DATA_CENTER.objects).find((o) => o.class === 'Rack' && o.name === name).id

const HALL_A = 2090000030
const A01 = rackId('A01')
const A02 = rackId('A02')
const A09 = rackId('A09')
const A10 = rackId('A10')

let wrapper

async function mountRoom(name) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  wrapper = mount(FloorPlanView, {
    props: { object: byName(name) },
    attachTo: document.body,
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }], PrimeVue, ToastService],
      directives: { tooltip: Tooltip },
    },
  })
  await flushPromises()
  return wrapper
}

const canvas = () => wrapper.findComponent(FloorPlanCanvas)
const button = (label) =>
  wrapper.findAll('button').find((b) => b.text() === label || b.attributes('aria-label') === label)

async function enterEdit() {
  await wrapper
    .findAll('.mode-switch-btn')
    .find((b) => b.text() === 'Edit')
    .trigger('click')
  await flushPromises()
}

async function key(keyName, options = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, ...options }))
  await flushPromises()
}

async function emitCanvas(event, payload) {
  canvas().vm.$emit(event, payload)
  await flushPromises()
}

async function drag(key, from, to) {
  await emitCanvas('drag-start', { key, point: from, toggle: false })
  await emitCanvas('drag-move', to)
  await emitCanvas('drag-end')
}

const rackIn = (plan, id) =>
  canvas()
    .props('plan')
    .racks.find((r) => r.id === id)
const calls = () => saveOp.mock.calls.map(([roomId, op]) => ({ roomId, ...op }))

beforeEach(() => {
  localStorage.clear()
  roomObject.value = { id: HALL_A, effectiveRights: { read: true, modify: true } }
  saveOp.mockReset()
  saveOp.mockImplementation((roomId, op) =>
    Promise.resolve(op.kind === 'element-create' ? { id: 5000, ...op.payload } : {}),
  )
  confirmRequire.mockReset()
  route.query = {}
  routerReplace.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
})

// The whole view on the demo seed: a few seconds per mount when the full suite runs alongside.
const MOUNT_TIMEOUT = { timeout: 20000 }

describe('floor plan editor', MOUNT_TIMEOUT, () => {
  it('offers no Edit switch without the modify right on the room', async () => {
    roomObject.value = { id: HALL_A, effectiveRights: { read: true, modify: false } }
    await mountRoom('Hall A')
    expect(wrapper.find('.mode-switch').exists()).toBe(false)
    expect(wrapper.find('.fp-rack').exists()).toBe(true)
  })

  it('drops the selected rack on a click on the floor when viewing', async () => {
    await mountRoom('Hall A')
    await emitCanvas('select', rackIn(null, A01))
    expect([...canvas().props('selectedKeys')]).toEqual([`r:${A01}`])
    await emitCanvas('clear-selection')
    expect(canvas().props('selectedKeys').size).toBe(0)
  })

  it('nudges by a tile, rotates, adds an element and saves only what changed', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(true)

    await emitCanvas('activate', `r:${A01}`)
    await key('ArrowRight')
    expect(rackIn(null, A01)).toMatchObject({ x: 3000, y: 4800, rotation: 180 })
    await key('ArrowLeft', { altKey: true })
    expect(rackIn(null, A01).x).toBe(2990)

    await button('Column').trigger('click')
    const added = canvas().props('plan').passiveElements.at(-1)
    expect(added).toMatchObject({ type: 'COLUMN', name: 'Column 1', width: 600, depth: 600 })
    expect(added.id).toBeLessThan(0)

    await button('Save').trigger('click')
    await flushPromises()
    expect(calls()).toEqual([
      { roomId: HALL_A, kind: 'rack', id: A01, payload: { x: 2990 } },
      expect.objectContaining({
        roomId: HALL_A,
        kind: 'element-create',
        payload: expect.objectContaining({ type: 'COLUMN', name: 'Column 1' }),
      }),
    ])
    // Saved in full: back to viewing.
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(false)
  })

  it('gives one selected element resize handles, and saves the size a handle drag leaves', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    const handles = () => wrapper.findAll('.fp-handle').map((h) => h.attributes('data-handle'))
    const field = (label) => {
      const id = wrapper
        .findAll('label')
        .find((l) => l.text() === label)
        .attributes('for')
      return wrapper.find(`[id="${id}"]`).element.value
    }

    expect(handles()).toEqual([])
    await emitCanvas('activate', `r:${A01}`)
    expect(handles()).toEqual([])
    // The office door at y 3000 is 1200 by 100, too thin on screen for its handles to sit on it:
    // they spread out above and below.
    await emitCanvas('activate', 'e:9')
    expect(handles()).toEqual(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'])
    const middleY = (id) => {
      const h = wrapper.find(`.fp-handle[data-handle="${id}"]`)
      return Number(h.attributes('y')) + Number(h.attributes('height')) / 2
    }
    expect(middleY('n')).toBeLessThan(3000)
    expect(middleY('s')).toBeGreaterThan(3100)
    expect(middleY('e')).toBe(3050)
    await emitCanvas('activate', 'e:8')
    expect(handles()).toEqual(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'])
    expect(wrapper.find('.fp-resize').attributes('data-key')).toBe('e:8')
    expect(wrapper.find('.fp-handle[tabindex]').exists()).toBe(false)
    await emitCanvas('drag-start', { key: 'e:9', point: { x: 11500, y: 3050 }, toggle: true })
    await emitCanvas('drag-end')
    expect(handles()).toEqual([])

    // The ramp stands at 11400, 9300 and is 1800 by 1400.
    await emitCanvas('activate', 'e:8')
    await emitCanvas('drag-start', { key: 's:8:se', point: { x: 13200, y: 10700 }, toggle: false })
    await emitCanvas('drag-move', { x: 13700, y: 10000 })
    expect(field('Width (mm)')).toBe('2400')
    expect(field('Depth (mm)')).toBe('900')
    await emitCanvas('drag-end')
    expect(handles()).toHaveLength(8)

    await button('Save').trigger('click')
    await flushPromises()
    expect(calls()).toEqual([
      { roomId: HALL_A, kind: 'element-update', id: 8, payload: { width: 2400, depth: 900 } },
    ])
  })

  it('reports the calls that failed and sends only those again', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    // A01 covers x 1800-2400 and A02 2400-3000; A03 starts at 3000.
    await emitCanvas('marquee', { minX: 1900, minY: 3700, maxX: 2900, maxY: 4700 })
    expect(wrapper.vm.$.setupState.editor.selection).toEqual([`r:${A01}`, `r:${A02}`])
    await key('ArrowUp')

    saveOp.mockImplementation((roomId, op) =>
      op.id === A02
        ? Promise.reject(Object.assign(new Error('Access denied'), { status: 403 }))
        : Promise.resolve({}),
    )
    await button('Save').trigger('click')
    await flushPromises()
    expect(calls().map((c) => c.id)).toEqual([A01, A02])
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('1 change was not saved')
    expect(wrapper.find('.fp-failures').text()).toContain('A02 placement')
    expect(wrapper.find('.fp-failures').text()).toContain('no modify rights (403)')
    expect(wrapper.find('.dirty-indicator').exists()).toBe(true)

    saveOp.mockReset()
    saveOp.mockResolvedValue({})
    await button('Save').trigger('click')
    await flushPromises()
    expect(calls()).toEqual([{ roomId: HALL_A, kind: 'rack', id: A02, payload: { y: 4200 } }])
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(false)
  })

  it('snaps a drag by the nearer edge and warns about a rack outside the outline', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    // A01 covers x 1800-2400; 7230 mm east puts its edges at 9030 and 9630, 30 from a tile.
    await drag(`r:${A01}`, { x: 2000, y: 4000 }, { x: 9230, y: 4000 })
    expect(rackIn(null, A01).x).toBe(9600)
    expect(wrapper.find('.fp-edit-panel').text()).not.toContain('outside')

    // Into the cut-out corner of the L, north of y 3000 and east of x 10800.
    await drag(`r:${A01}`, { x: 9400, y: 4000 }, { x: 12400, y: 1600 })
    const warnings = wrapper.find('.fp-edit-panel').text()
    expect(warnings).toContain('A01 is outside the room outline')
    expect(wrapper.find('.fp-edit-bar__warn').text()).toContain('1 warning')
    expect(canvas().props('warnedKeys').has(`r:${A01}`)).toBe(true)

    await button('Undo').trigger('click')
    expect(rackIn(null, A01).x).toBe(9600)
    await button('Undo').trigger('click')
    expect(rackIn(null, A01).x).toBe(2400)
    await button('Redo').trigger('click')
    expect(rackIn(null, A01).x).toBe(9600)
  })

  it('places the unplaced racks as a row', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    await button('Place as row\u2026').trigger('click')
    await button('Place 2').trigger('click')
    const a09 = rackIn(null, A09)
    const a10 = rackIn(null, A10)
    expect([a09.placed, a10.placed]).toEqual([true, true])
    expect([a09.rotation, a10.rotation]).toEqual([0, 0])
    // Name order along +X, side by side, on the grid.
    expect(a10.x - a09.x).toBe(600)
    expect(a09.x % 600).toBe(0)
    expect(a09.y % 600).toBe(0)
    expect(wrapper.vm.$.setupState.editor.selection).toEqual([`r:${A09}`, `r:${A10}`])
    expect(wrapper.text()).not.toContain('Not placed')

    await button('Save').trigger('click')
    await flushPromises()
    expect(calls().map((c) => [c.id, c.payload.placed])).toEqual([
      [A09, true],
      [A10, true],
    ])
  })

  it('asks before dropping unsaved changes when switching to View', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    await emitCanvas('activate', `r:${A01}`)
    await key('r')
    expect(rackIn(null, A01).rotation).toBe(270)

    confirmRequire.mockImplementation((options) => options.reject())
    await wrapper
      .findAll('.mode-switch-btn')
      .find((b) => b.text() === 'View')
      .trigger('click')
    await flushPromises()
    expect(confirmRequire).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'This floor plan has unsaved changes. Discard them?' }),
    )
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(true)

    confirmRequire.mockImplementation((options) => options.accept())
    await wrapper
      .findAll('.mode-switch-btn')
      .find((b) => b.text() === 'View')
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(false)
    expect(rackIn(null, A01).rotation).toBe(180)
    expect(saveOp).not.toHaveBeenCalled()
  })
})

describe('floor plan backdrop', MOUNT_TIMEOUT, () => {
  const DRAWING = 'b1d0e7f2-0000-4000-8000-000000000001'

  it('moves only the image in backdrop mode, leaves it on Escape and saves it with the room', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    await emitCanvas('activate', `r:${A01}`)
    const rackX = rackIn(null, A01).x
    await button('Backdrop').trigger('click')
    expect(canvas().props('backdropMode')).toBe(true)
    const panel = wrapper.findComponent(FloorPlanBackdropPanel)
    expect(panel.exists()).toBe(true)

    panel.vm.$emit('change-image', DRAWING)
    await flushPromises()
    const placed = canvas().props('plan')
    expect(placed).toMatchObject({ backgroundImage: DRAWING, backgroundScale: 0 })

    await key('ArrowRight')
    expect(rackIn(null, A01).x).toBe(rackX)
    expect(canvas().props('plan').backgroundX).toBe(placed.backgroundX + 600)

    await key('Escape')
    expect(canvas().props('backdropMode')).toBe(false)
    expect(wrapper.findComponent(FloorPlanBackdropPanel).exists()).toBe(false)

    await button('Save').trigger('click')
    await flushPromises()
    expect(calls()).toEqual([
      {
        roomId: HALL_A,
        kind: 'room',
        payload: expect.objectContaining({
          backgroundImage: DRAWING,
          backgroundX: placed.backgroundX + 600,
        }),
      },
    ])
  })

  it('drops a calibration on Escape before leaving the mode', async () => {
    await mountRoom('Hall A')
    await enterEdit()
    await button('Backdrop').trigger('click')
    wrapper.findComponent(FloorPlanBackdropPanel).vm.$emit('calibrate')
    await flushPromises()
    expect(canvas().props('calibration')).toEqual({ points: [] })
    await emitCanvas('calibrate-miss', { x: -5000, y: 0 })
    expect(canvas().props('calibration')).toEqual({ points: [], missed: true })
    await emitCanvas('calibrate-point', { x: 0, y: 0 })
    expect(canvas().props('calibration')).toEqual({ points: [{ x: 0, y: 0 }], missed: false })

    await key('Escape')
    expect(canvas().props('calibration')).toBeNull()
    expect(canvas().props('backdropMode')).toBe(true)
    await key('Escape')
    expect(canvas().props('backdropMode')).toBe(false)
  })
})

describe('floor plan editor in a room without racks or grid', MOUNT_TIMEOUT, () => {
  const E1 = 2090000032
  const field = (label) =>
    wrapper
      .findAllComponents({ name: 'FormField' })
      .find((f) => f.props('label') === label)
      .findComponent({ name: 'InputNumber' })

  async function commitField(label, value) {
    const input = field(label)
    input.vm.$emit('update:modelValue', value)
    input.vm.$emit('blur', new Event('blur'))
    await flushPromises()
  }

  it('starts in edit mode when the URL asks for it, and drops the flag', async () => {
    route.query = { edit: '1', keep: 'x' }
    await mountRoom('Electrical Room E1')
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(true)
    expect(routerReplace).toHaveBeenCalledWith({ query: { keep: 'x' }, hash: '' })
  })

  it('drops the flag without editing when the room may not be modified', async () => {
    roomObject.value = { id: E1, effectiveRights: { read: true, modify: false } }
    route.query = { edit: '1' }
    await mountRoom('Electrical Room E1')
    expect(wrapper.find('.fp-edit-bar').exists()).toBe(false)
    expect(routerReplace).toHaveBeenCalledWith({ query: {}, hash: '' })
  })

  it('sizes the room and gives it a grid from the Room panel, in one room call', async () => {
    await mountRoom('Electrical Room E1')
    await enterEdit()
    expect(field('Width (mm)').props('modelValue')).toBe(7200)
    expect(field('Depth (mm)').props('modelValue')).toBe(4800)

    await commitField('Width (mm)', 9000)
    expect(canvas().props('plan').outline).toEqual([
      { x: 0, y: 0 },
      { x: 9000, y: 0 },
      { x: 9000, y: 4800 },
      { x: 0, y: 4800 },
    ])
    await commitField('Floor tile (mm)', 600)
    expect(canvas().props('plan').gridTileSize).toBe(600)
    expect(button('Snap')).toBeDefined()

    await key('z', { ctrlKey: true })
    expect(canvas().props('plan').gridTileSize).toBe(0)
    await key('y', { ctrlKey: true })

    await button('Save').trigger('click')
    await flushPromises()
    expect(calls()).toEqual([
      {
        roomId: E1,
        kind: 'room',
        payload: {
          gridTileSize: 600,
          outline: [
            { x: 0, y: 0 },
            { x: 9000, y: 0 },
            { x: 9000, y: 4800 },
            { x: 0, y: 4800 },
          ],
        },
      },
    ])
  })

  it('nudges by 100 mm, edits the outline and saves it', async () => {
    await mountRoom('Electrical Room E1')
    await enterEdit()
    expect(button('Snap')).toBeUndefined()

    await button('Wall').trigger('click')
    const wall = canvas().props('plan').passiveElements.at(-1)
    await key('ArrowDown')
    expect(canvas().props('plan').passiveElements.at(-1).y).toBe(wall.y + 100)

    await emitCanvas('activate', 'v:2')
    await key('Delete')
    expect(canvas().props('plan').outline).toHaveLength(3)
    await emitCanvas('activate', 'v:0')
    await key('Delete')
    // A triangle keeps its corners.
    expect(canvas().props('plan').outline).toHaveLength(3)

    await emitCanvas('insert-vertex', { edge: 1, point: { x: 3601.4, y: 2400.2 } })
    expect(canvas().props('plan').outline[2]).toEqual({ x: 3601, y: 2400 })

    await button('Save').trigger('click')
    await flushPromises()
    const kinds = calls().map((c) => c.kind)
    expect(kinds).toEqual(['room', 'element-create'])
    expect(calls()[0].payload.outline).toHaveLength(4)
  })
})
