import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ObjectTreeNode from '@/components/objects/ObjectTreeNode.vue'
import { useSidebarStore } from '@/stores/sidebarStore'

vi.mock('@/router', () => ({
  default: { resolve: (to) => ({ href: `/infrastructure/${to.params.objectId}` }) },
}))

let pinia

function mountNode(node, props = {}) {
  return mount(ObjectTreeNode, {
    props: { node, expandedIds: new Set(), ...props },
    global: {
      plugins: [pinia],
      stubs: { ActionOverflowButton: true },
      directives: { tooltip: {} },
    },
  })
}

describe('ObjectTreeNode alias display', () => {
  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('renders the alias in parentheses when showAliases is on and alias is set', () => {
    const wrapper = mountNode({ id: 1, name: 'dns.example', alias: 'mail server', status: 0 })
    const label = wrapper.find('.tree-node-label').text()
    expect(label).toContain('dns.example')
    expect(wrapper.find('.tree-node-alias').exists()).toBe(true)
    expect(label).toContain('(mail server)')
  })

  it('omits the alias when the node has no alias', () => {
    const wrapper = mountNode({ id: 1, name: 'dns.example', alias: '', status: 0 })
    expect(wrapper.find('.tree-node-alias').exists()).toBe(false)
  })

  it('omits the alias when showAliases is off', () => {
    useSidebarStore().showAliases = false
    const wrapper = mountNode({ id: 1, name: 'dns.example', alias: 'mail server', status: 0 })
    expect(wrapper.find('.tree-node-alias').exists()).toBe(false)
  })
})

describe('ObjectTreeNode new-tab gestures', () => {
  const NODE = { id: 7, name: 'switch-01', class: 'Node', status: 0 }
  const targetFor = (node) => ({ name: 'infrastructure', params: { objectId: node.id } })

  let opened

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    opened = { opener: {} }
    vi.stubGlobal(
      'open',
      vi.fn(() => opened),
    )
  })

  it('selects on a plain click, as before', async () => {
    const wrapper = mountNode(NODE, { targetFor })
    await wrapper.find('.tree-node-row').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(window.open).not.toHaveBeenCalled()
  })

  it('opens a new tab on ctrl+click instead of selecting', async () => {
    const wrapper = mountNode(NODE, { targetFor })
    await wrapper.find('.tree-node-row').trigger('click', { ctrlKey: true })

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(window.open).toHaveBeenCalledWith('/infrastructure/7', '_blank')
  })

  it('opens a new tab on middle click', async () => {
    const wrapper = mountNode(NODE, { targetFor })
    await wrapper.find('.tree-node-row').trigger('auxclick', { button: 1 })

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(window.open).toHaveBeenCalledWith('/infrastructure/7', '_blank')
  })

  it('still opens the context menu on right click', async () => {
    const wrapper = mountNode(NODE, { targetFor })
    await wrapper.find('.tree-node-row').trigger('contextmenu')

    expect(wrapper.emitted('contextmenu')).toHaveLength(1)
    expect(window.open).not.toHaveBeenCalled()
  })

  it('leaves Ctrl alone in trees that select rather than navigate', async () => {
    const wrapper = mountNode(NODE)
    await wrapper.find('.tree-node-row').trigger('click', { ctrlKey: true })

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(window.open).not.toHaveBeenCalled()
  })
})

describe('ObjectTreeNode tab order', () => {
  const NODE = { id: 7, name: 'switch-01', class: 'Node', status: 0 }

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('keeps the overflow button out of the tab order on unselected rows', () => {
    const wrapper = mountNode(NODE, { selectedPath: '99' })
    expect(wrapper.find('.tree-overflow-btn').attributes('tabindex')).toBe('-1')
  })

  it('gives the overflow button the tab stop on the selected row', () => {
    const wrapper = mountNode(NODE, { selectedPath: '7' })
    expect(wrapper.find('.tree-node-row').attributes('tabindex')).toBe('0')
    expect(wrapper.find('.tree-overflow-btn').attributes('tabindex')).toBe('0')
  })
})

describe('ObjectTreeNode multi-selection', () => {
  const NODE = { id: 7, name: 'switch-01', class: 'Node', status: 0 }

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('publishes its path on the row', () => {
    const wrapper = mountNode(NODE, { parentPath: '1-2' })
    expect(wrapper.find('.tree-node-row').attributes('data-path')).toBe('1-2-7')
  })

  it('draws as selected when it is part of the range', () => {
    const wrapper = mountNode(NODE, { selectedPath: '99', selectedPaths: new Set(['7']) })

    expect(wrapper.find('.tree-node-row').classes()).toContain('selected')
    expect(wrapper.find('.tree-node-row').attributes('aria-selected')).toBe('true')
  })

  it('leaves the tab stop with the open object, not with every selected row', () => {
    const wrapper = mountNode(NODE, { selectedPath: '99', selectedPaths: new Set(['7']) })
    expect(wrapper.find('.tree-node-row').attributes('tabindex')).toBe('-1')
  })

  // Right-clicking inside a selection acts on the whole selection.
  it('does not re-select a row that the range already covers', async () => {
    const wrapper = mountNode(NODE, { selectedPaths: new Set(['7']) })
    await wrapper.find('.tree-node-row').trigger('contextmenu')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('contextmenu')).toHaveLength(1)
  })

  it('selects a row outside the range before opening the menu on it', async () => {
    const wrapper = mountNode(NODE, { selectedPaths: new Set(['99']) })
    await wrapper.find('.tree-node-row').trigger('contextmenu')

    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('squares the corners it shares with the rest of the range', () => {
    const wrapper = mountNode(NODE, {
      selectedPaths: new Set(['1', '7', '9']),
      rangeEdges: { first: '1', last: '9' },
    })

    expect(wrapper.find('.tree-node-row').classes()).toContain('range-middle')
  })

  it('keeps its pill shape when the range is one row', () => {
    const wrapper = mountNode(NODE, {
      selectedPaths: new Set(['7']),
      rangeEdges: { first: '7', last: '7' },
    })
    const classes = wrapper.find('.tree-node-row').classes()

    expect(classes).toContain('selected')
    expect(classes.some((name) => name.startsWith('range-'))).toBe(false)
  })

  it('passes the click event on so the view can read Shift', async () => {
    const wrapper = mountNode(NODE)
    await wrapper.find('.tree-node-row').trigger('click', { shiftKey: true })

    expect(wrapper.emitted('select')[0][2].shiftKey).toBe(true)
  })
})

describe('ObjectTreeNode double-click expansion', () => {
  const BRANCH = {
    id: 7,
    name: 'core-switch',
    class: 'Node',
    status: 0,
    children: [{ id: 8, name: 'Ethernet1/1', class: 'Interface', status: 0 }],
  }

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('toggles the branch on a double click anywhere on the row', async () => {
    const wrapper = mountNode(BRANCH)
    await wrapper.find('.tree-node-label').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toEqual([['7']])
  })

  it('collapses an expanded branch on the second double click', async () => {
    const wrapper = mountNode(BRANCH, { expandedIds: new Set(['7']) })
    await wrapper.find('.tree-node-row').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toEqual([['7']])
  })

  it('does nothing on a leaf row', async () => {
    const wrapper = mountNode({ id: 9, name: 'printer', class: 'Node', status: 0 })
    await wrapper.find('.tree-node-row').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  // The two clicks of a double click have already toggled the chevron twice.
  it('ignores a double click on the chevron', async () => {
    const wrapper = mountNode(BRANCH)
    await wrapper.find('.tree-toggle').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('ignores a double click on the overflow button', async () => {
    const wrapper = mountNode(BRANCH)
    await wrapper.find('.tree-overflow-btn').trigger('dblclick')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})

describe('ObjectTreeNode root indent and sticky rows', () => {
  const TREE = {
    id: 1,
    name: 'container',
    class: 'Container',
    status: 0,
    children: [{ id: 2, name: 'leaf', class: 'Node', status: 0 }],
  }

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  function rows(wrapper) {
    return wrapper.findAll('.tree-node-row')
  }

  function guideLefts(row) {
    return row.findAll('.tree-indent-guide').map((guide) => guide.element.style.left)
  }

  it('keeps the plain per-depth indent and guides without an offset', () => {
    const wrapper = mountNode(TREE, { expandedIds: new Set(['1']) })
    const [parent, child] = rows(wrapper)

    expect(parent.element.style.paddingLeft).toBe('0.25rem')
    expect(guideLefts(parent)).toEqual([])
    expect(child.element.style.paddingLeft).toBe('1.25rem')
    expect(guideLefts(child)).toEqual(['0.625rem'])
    expect(parent.classes()).not.toContain('sticky')
    expect(parent.element.style.top).toBe('')
  })

  it('shifts the subtree by the offset and draws a guide under the root chevron', () => {
    const wrapper = mountNode(TREE, { expandedIds: new Set(['1']), indentOffset: 0.5 })
    const [parent, child] = rows(wrapper)

    expect(parent.element.style.paddingLeft).toBe('0.75rem')
    expect(guideLefts(parent)).toEqual(['0.625rem'])
    expect(child.element.style.paddingLeft).toBe('1.75rem')
    expect(guideLefts(child)).toEqual(['0.625rem', '1.125rem'])
  })

  it('stacks sticky rows under the offset, one row height per depth', () => {
    const wrapper = mountNode(TREE, { expandedIds: new Set(['1']), stickyOffset: 2 })
    const [parent, child] = rows(wrapper)

    expect(parent.classes()).toContain('sticky')
    expect(parent.element.style.top).toBe('2rem')
    expect(parent.element.style.scrollMarginTop).toBe('2rem')
    expect(child.element.style.top).toBe('4rem')
    expect(Number(parent.element.style.zIndex)).toBeGreaterThan(Number(child.element.style.zIndex))
  })
})
