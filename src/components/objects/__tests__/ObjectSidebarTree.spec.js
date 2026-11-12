import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'

vi.mock('@/router', () => ({
  default: { resolve: (to) => ({ href: `/infrastructure/${to.params?.objectId}` }) },
}))

const ROOT = { id: 2, name: 'Infrastructure', class: 'ServiceRoot', status: 0 }
const NODES = [
  { id: 10, name: 'server-01', class: 'Node', status: 0 },
  { id: 11, name: 'server-02', class: 'Node', status: 0 },
  { id: 12, name: 'server-03', class: 'Node', status: 0 },
]

let pinia

function mountTree(props = {}) {
  const byId = new Map([[String(ROOT.id), ROOT], ...NODES.map((node) => [String(node.id), node])])
  return mount(ObjectSidebarTree, {
    props: {
      roots: [
        { object: ROOT, label: 'Infrastructure', fallbackClass: 'ServiceRoot', nodes: NODES },
      ],
      expandedIds: new Set([String(ROOT.id)]),
      resolvePath: (path) => byId.get(path) ?? null,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: { ActionOverflowButton: true, ProgressSpinner: true },
      directives: { tooltip: {} },
    },
  })
}

describe('ObjectSidebarTree', () => {
  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('renders a treeitem per root and per node, each carrying its path', () => {
    const wrapper = mountTree()
    const paths = wrapper.findAll('[role="treeitem"]').map((el) => el.attributes('data-path'))
    expect(paths).toEqual(['2', '10', '11', '12'])
  })

  it('builds a contiguous range from a shift+click and reports the objects', async () => {
    const wrapper = mountTree()
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[1].trigger('click')
    await rows[3].trigger('click', { shiftKey: true })

    const emitted = wrapper.emitted('selection-change')
    expect(emitted).toBeTruthy()
    expect(emitted.at(-1)[0].map((o) => o.id)).toEqual([10, 11, 12])
  })

  it('emits the range as `selection` when the right-click lands inside it', async () => {
    const wrapper = mountTree()
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[1].trigger('click')
    await rows[2].trigger('click', { shiftKey: true })
    await rows[2].trigger('contextmenu')

    const [, , meta] = wrapper.emitted('contextmenu').at(-1)
    expect(meta.selection.map((o) => o.id)).toEqual([10, 11])
  })

  it('collapses the range and reports no selection when the right-click lands outside it', async () => {
    const wrapper = mountTree()
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[1].trigger('click')
    await rows[2].trigger('click', { shiftKey: true })
    await rows[3].trigger('contextmenu')

    const [, , meta] = wrapper.emitted('contextmenu').at(-1)
    expect(meta.selection).toBeUndefined()
  })

  it('does not open a row when its menu opens', async () => {
    const wrapper = mountTree({ selectedPath: '10' })
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[2].trigger('contextmenu')

    expect(wrapper.emitted('select')).toBeUndefined()
    const [, node, meta] = wrapper.emitted('contextmenu').at(-1)
    expect(node.id).toBe(11)
    expect(meta.path).toBe('11')
  })

  it('does not open a row from its overflow button, on node and root rows alike', async () => {
    const wrapper = mountTree({ selectedPath: '10' })
    const buttons = wrapper.findAllComponents({ name: 'ActionOverflowButton' })
    const click = {
      detail: 0,
      pageX: 0,
      pageY: 0,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 0 }) },
      preventDefault: () => {},
      stopPropagation: () => {},
    }
    buttons[0].vm.$emit('click', click)
    buttons[2].vm.$emit('click', click)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('contextmenu')).toHaveLength(2)
  })

  it('keeps the range when the overflow button of a row inside it is used', async () => {
    const wrapper = mountTree()
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[1].trigger('click')
    await rows[2].trigger('click', { shiftKey: true })

    wrapper.findAllComponents({ name: 'ActionOverflowButton' })[2].vm.$emit('click', {
      detail: 0,
      pageX: 0,
      pageY: 0,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 0 }) },
      preventDefault: () => {},
      stopPropagation: () => {},
    })
    await wrapper.vm.$nextTick()

    const [, , meta] = wrapper.emitted('contextmenu').at(-1)
    expect(meta.selection.map((o) => o.id)).toEqual([10, 11])
  })

  it('marks the row the menu is on until the view reports the menu closed', async () => {
    const wrapper = mountTree({ selectedPath: '10' })
    const rows = wrapper.findAll('[role="treeitem"]')

    await rows[2].trigger('contextmenu')
    expect(rows[2].classes()).toContain('menu-target')

    await rows[0].trigger('contextmenu')
    expect(rows[2].classes()).not.toContain('menu-target')
    expect(rows[0].classes()).toContain('menu-target')

    wrapper.vm.clearMenuRow()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.menu-target')).toHaveLength(0)
  })

  it('drops the range when the view opens a different row programmatically', async () => {
    // As useObjectDeletionNavigation does after a delete.
    const wrapper = mountTree()
    const rows = wrapper.findAll('[role="treeitem"]')
    await rows[1].trigger('click')
    await rows[3].trigger('click', { shiftKey: true })
    expect(wrapper.emitted('selection-change').at(-1)[0]).toHaveLength(3)

    await wrapper.setProps({ selectedPath: '11' })
    expect(wrapper.emitted('selection-change').at(-1)[0]).toEqual([])
  })

  it('keeps exactly one tab stop, on the open object', () => {
    const wrapper = mountTree({ selectedPath: '11' })
    const stops = wrapper
      .findAll('[role="treeitem"]')
      .filter((row) => row.attributes('tabindex') === '0')
    expect(stops.map((row) => row.attributes('data-path'))).toEqual(['11'])
  })

  it('falls back to the root row when the open object is inside a collapsed branch', () => {
    const wrapper = mountTree({
      selectedPath: '11-99',
      roots: [
        {
          object: ROOT,
          label: 'Infrastructure',
          fallbackClass: 'ServiceRoot',
          nodes: [
            ...NODES.slice(0, 1),
            { ...NODES[1], children: [{ id: 99, name: 'child', class: 'Node', status: 0 }] },
          ],
        },
      ],
    })
    const stops = wrapper
      .findAll('[role="treeitem"]')
      .filter((row) => row.attributes('tabindex') === '0')
    expect(stops.map((row) => row.attributes('data-path'))).toEqual(['2'])
  })

  it('falls back to the root row when nothing is selected at all', () => {
    const wrapper = mountTree()
    const stops = wrapper
      .findAll('[role="treeitem"]')
      .filter((row) => row.attributes('tabindex') === '0')
    expect(stops.map((row) => row.attributes('data-path'))).toEqual(['2'])
  })

  it('anchors a row menu opened from the keyboard under its overflow button', async () => {
    // A keyboard click has no pointer position, and PrimeVue places the menu from pageX/pageY.
    const wrapper = mountTree()
    const button = wrapper.findAllComponents({ name: 'ActionOverflowButton' })[0]
    button.vm.$emit('click', {
      detail: 0,
      pageX: 0,
      pageY: 0,
      currentTarget: { getBoundingClientRect: () => ({ left: 120, bottom: 64 }) },
      preventDefault: () => {},
      stopPropagation: () => {},
    })
    await wrapper.vm.$nextTick()

    const [event] = wrapper.emitted('contextmenu').at(-1)
    expect(event.pageX).toBe(120)
    expect(event.pageY).toBe(64)
  })

  it('toggles the real root path, not a stringified ref', async () => {
    const wrapper = mountTree({ expandedIds: new Set() })
    await wrapper.findAll('[role="treeitem"]')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('toggle').at(-1)).toEqual(['2'])
  })

  it('toggles the root branch on a double click', async () => {
    const wrapper = mountTree()
    await wrapper.find('.root-tree-node .tree-node-label').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toEqual([['2']])
  })

  it('ignores a double click on the root chevron, which its own clicks already toggled', async () => {
    const wrapper = mountTree()
    await wrapper.find('.root-tree-node .tree-toggle').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})

describe('ObjectSidebarTree drag and drop', () => {
  const FOLDER = {
    id: 20,
    name: 'folder',
    class: 'Container',
    status: 0,
    children: [{ id: 21, name: 'inner', class: 'Node', status: 0 }],
  }

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  function mountDraggable(props = {}) {
    const objects = [ROOT, ...NODES, FOLDER, ...FOLDER.children]
    const byPath = new Map([
      ...objects.map((object) => [String(object.id), object]),
      ['20-21', FOLDER.children[0]],
    ])
    return mountTree({
      roots: [
        {
          object: ROOT,
          label: 'Infrastructure',
          fallbackClass: 'ServiceRoot',
          nodes: [...NODES, FOLDER],
        },
      ],
      resolvePath: (path) => byPath.get(path) ?? null,
      canDrag: (object) => object.class === 'Node',
      canDrop: ({ target }) => target.id !== 11,
      ...props,
    })
  }

  const row = (wrapper, path) => wrapper.find(`[data-path="${path}"]`)

  /** jsdom has no DragEvent; a plain event carries what the handlers read. */
  function fire(wrapper, path, type, init = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    const dataTransfer = { clearData: vi.fn(), setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    Object.assign(event, { dataTransfer, ctrlKey: false, metaKey: false, clientY: 0, ...init })
    row(wrapper, path).element.dispatchEvent(event)
    return event
  }

  it('makes no row draggable without drop rules', () => {
    const wrapper = mountTree({ canDrag: () => true })

    expect(row(wrapper, '10').attributes('draggable')).toBeUndefined()
  })

  it('drags the rows the rules allow and drops onto a row they accept', async () => {
    const wrapper = mountDraggable()
    expect(row(wrapper, '10').attributes('draggable')).toBe('true')
    expect(row(wrapper, '20').attributes('draggable')).toBeUndefined()

    const start = fire(wrapper, '10', 'dragstart')
    expect(start.defaultPrevented).toBe(false)
    expect(start.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'server-01')

    const over = fire(wrapper, '20', 'dragover')
    await wrapper.vm.$nextTick()
    expect(over.defaultPrevented).toBe(true)
    expect(over.dataTransfer.dropEffect).toBe('move')
    expect(row(wrapper, '20').classes()).toContain('drop-target')

    fire(wrapper, '20', 'drop')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('drop')).toEqual([
      [{ rows: [{ object: NODES[0], path: '10' }], target: FOLDER, targetPath: '20', copy: false }],
    ])
    expect(row(wrapper, '20').classes()).not.toContain('drop-target')
  })

  it('lights a row up on dragenter, before any dragover', async () => {
    const wrapper = mountDraggable()
    fire(wrapper, '10', 'dragstart')

    const enter = fire(wrapper, '20', 'dragenter')
    await wrapper.vm.$nextTick()

    expect(enter.defaultPrevented).toBe(true)
    expect(row(wrapper, '20').classes()).toContain('drop-target')
  })

  it('leaves a refused row unmarked and drops nothing on it', async () => {
    const wrapper = mountDraggable()
    fire(wrapper, '10', 'dragstart')

    const over = fire(wrapper, '11', 'dragover')
    await wrapper.vm.$nextTick()
    fire(wrapper, '11', 'drop')

    expect(over.defaultPrevented).toBe(false)
    expect(row(wrapper, '11').classes()).not.toContain('drop-target')
    expect(wrapper.emitted('drop')).toBeUndefined()
  })

  it('copies while Ctrl is held', () => {
    const canDrop = vi.fn(() => true)
    const wrapper = mountDraggable({ canDrop })
    fire(wrapper, '10', 'dragstart')

    const over = fire(wrapper, '20', 'dragover', { ctrlKey: true })

    expect(canDrop).toHaveBeenLastCalledWith(expect.objectContaining({ copy: true }))
    expect(over.dataTransfer.dropEffect).toBe('copy')
  })

  it('drags a whole range when the drag starts inside it', async () => {
    const wrapper = mountDraggable()
    await row(wrapper, '10').trigger('click')
    await row(wrapper, '11').trigger('click', { shiftKey: true })

    fire(wrapper, '11', 'dragstart')
    fire(wrapper, '20', 'drop')

    const [drop] = wrapper.emitted('drop').at(-1)
    expect(drop.rows.map((r) => r.path)).toEqual(['10', '11'])
  })

  it('refuses to start a drag that holds a row the rules do not allow', async () => {
    const wrapper = mountDraggable({ canDrag: (object) => object.id === 10 })
    await row(wrapper, '10').trigger('click')
    await row(wrapper, '11').trigger('click', { shiftKey: true })

    expect(fire(wrapper, '10', 'dragstart').defaultPrevented).toBe(true)
  })

  it('opens a collapsed row the drag rests on', () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountDraggable()
      fire(wrapper, '10', 'dragstart')

      fire(wrapper, '20', 'dragover')
      vi.advanceTimersByTime(600)
      fire(wrapper, '20', 'dragover')
      expect(wrapper.emitted('toggle')).toBeUndefined()
      vi.advanceTimersByTime(200)

      expect(wrapper.emitted('toggle')).toEqual([['20']])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a drag that did not start in the tree', () => {
    const wrapper = mountDraggable()

    expect(fire(wrapper, '20', 'dragover').defaultPrevented).toBe(false)
  })
})
