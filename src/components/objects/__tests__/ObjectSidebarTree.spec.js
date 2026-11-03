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
