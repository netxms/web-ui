import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppChainFlow from '@/components/epp/EppChainFlow.vue'
import { buildCallGraph } from '@/utils/eppChains'

// jsdom has no layout engine, so cytoscape cannot measure or draw; tests check the graph the
// component describes.
const cyOptions = { last: null }
const cyHandlers = new Map()
const classLog = []

vi.mock('cytoscape', () => {
  const noopCollection = {
    removeClass: (name) => {
      classLog.push(['remove', name])
      return noopCollection
    },
    addClass: (name) => {
      classLog.push(['add', name])
      return noopCollection
    },
    difference: () => noopCollection,
    nonempty: () => true,
    data: () => {},
  }
  const instance = {
    on: (...args) => {
      const handler = args.pop()
      cyHandlers.set(args.join(':'), handler)
    },
    nodes: () => noopCollection,
    edges: () => noopCollection,
    elements: () => noopCollection,
    getElementById: () => noopCollection,
    batch: (fn) => fn(),
    layout: () => ({ run: () => {} }),
    fit: () => {},
    zoom: () => 1,
    center: () => {},
    resize: () => {},
    destroy: () => {},
    style: () => {},
  }
  return {
    default: Object.assign(
      (options) => {
        cyOptions.last = options
        return instance
      },
      { use: () => {} },
    ),
  }
})

function tapNode(chainId) {
  cyHandlers.get('tap:node')({ target: { data: () => chainId } })
}

function hoverNode() {
  cyHandlers.get('mouseover:node')({
    target: { removed: () => false, closedNeighborhood: () => ({ removeClass: () => {} }) },
  })
}

function unhoverNode() {
  cyHandlers.get('mouseout:node')({})
}

function dimmed() {
  return classLog.some(([op, name]) => op === 'add' && name === 'dimmed')
}

function undimmed() {
  return classLog.some(([op, name]) => op === 'remove' && name === 'dimmed')
}

async function built(wrapper) {
  await vi.waitFor(() => expect(cyHandlers.has('tap:node')).toBe(true))
  await nextTick()
  return wrapper
}

/** Main chain calling two sub-chains. */
const registry = [
  { id: 0, name: 'Default policy', ruleCount: 63, callerCount: 0 },
  { id: 2, name: 'test-chain', ruleCount: 8, callerCount: 1 },
  { id: 3, name: 'test-chain-2', ruleCount: 0, callerCount: 1 },
]

const withRules = [
  {
    id: 0,
    rules: [
      { guid: 'r1', ruleNumber: 1, comments: 'Show alarm when node is down', chainCalls: [2] },
      { guid: 'r2', ruleNumber: 2, comments: 'Terminate interface alarms', chainCalls: [] },
      { guid: 'r3', ruleNumber: 3, comments: 'Terminate when deleted', chainCalls: [3] },
    ],
  },
  { id: 2, rules: [{ guid: 's1', ruleNumber: 1, comments: 'sub rule', chainCalls: [] }] },
  { id: 3, rules: [] },
]

function mountFlow(props) {
  return mount(EppChainFlow, {
    props: {
      chains: registry,
      chainsWithRules: withRules,
      callGraph: buildCallGraph(withRules),
      activeChainId: 0,
      ...props,
    },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, s) => `${n} ${n === 1 ? s : s + 's'}` },
    },
  })
}

function nodesOf(wrapper) {
  return wrapper.vm.elements.filter((el) => !el.data.source)
}

function edgesOf(wrapper) {
  return wrapper.vm.elements.filter((el) => el.data.source)
}

describe('EppChainFlow', () => {
  beforeEach(() => {
    cyHandlers.clear()
    cyOptions.last = null
    classLog.length = 0
  })

  describe('hover dimming', () => {
    it('waits for the pointer to settle before dimming the rest of the graph', async () => {
      await built(mountFlow())
      vi.useFakeTimers()
      try {
        classLog.length = 0
        hoverNode()
        expect(dimmed()).toBe(false)

        vi.advanceTimersByTime(200)
        expect(dimmed()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not light the graph back up while the pointer moves to a neighbour', async () => {
      await built(mountFlow())
      vi.useFakeTimers()
      try {
        hoverNode()
        vi.advanceTimersByTime(200)
        classLog.length = 0

        // Leaving one card and arriving on the next, within the grace period.
        unhoverNode()
        vi.advanceTimersByTime(20)
        hoverNode()
        expect(undimmed()).toBe(false)

        unhoverNode()
        vi.advanceTimersByTime(200)
        expect(undimmed()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('clicking a chain', () => {
    it('inspects rather than navigates', async () => {
      const wrapper = await built(mountFlow())
      tapNode(2)
      await nextTick()

      expect(wrapper.emitted('select-chain')).toBeUndefined()
      expect(wrapper.find('.detail-title').text()).toBe('test-chain')
    })

    it('opens the chain on a second click in quick succession', async () => {
      const wrapper = await built(mountFlow())
      tapNode(2)
      tapNode(2)
      expect(wrapper.emitted('select-chain')).toEqual([[2]])
    })

    it('does not open a chain from two separate clicks on different chains', async () => {
      const wrapper = await built(mountFlow())
      tapNode(2)
      tapNode(3)
      expect(wrapper.emitted('select-chain')).toBeUndefined()
    })

    it('offers the open action as a real link, so it can go to a new tab', async () => {
      const wrapper = await built(mountFlow())
      tapNode(2)
      await nextTick()
      expect(wrapper.find('.detail-open').attributes('href')).toContain('chain=2')
    })
  })

  it('shows the chain the editor has open until something else is clicked', async () => {
    const wrapper = await built(mountFlow({ activeChainId: 2 }))
    expect(wrapper.find('.detail-title').text()).toBe('test-chain')
  })

  it('draws a node per chain, main chain included', () => {
    const nodes = nodesOf(mountFlow())
    expect(nodes.map((n) => n.data.id)).toEqual(['0', '2', '3'])
    // The card is an image, so what it says lives in `name` and `meta`.
    expect(nodes[0].data.name).toBe('Main')
    expect(nodes[0].data.meta).toBe('63 rules')
    expect(nodes[0].data.img).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(nodes[0].classes).toContain('main')
  })

  it('counts disabled rules into the card, and says nothing when there are none', () => {
    const RF_DISABLED = 0x10
    const wrapper = mountFlow({
      chainsWithRules: [
        {
          id: 0,
          rules: [
            { guid: 'r1', ruleNumber: 1, flags: RF_DISABLED, chainCalls: [] },
            { guid: 'r2', ruleNumber: 2, flags: 0, chainCalls: [] },
          ],
        },
        { id: 2, rules: [{ guid: 's1', ruleNumber: 1, flags: 0, chainCalls: [] }] },
      ],
    })
    const nodes = nodesOf(wrapper)
    expect(nodes.find((n) => n.data.id === '0').data.meta).toBe('63 rules · 1 disabled')
    expect(nodes.find((n) => n.data.id === '2').data.meta).toBe('8 rules')
  })

  it('marks a chain the account may read but not save', () => {
    const EPP_CHAIN_ACCESS_READ = 0x01
    const wrapper = mountFlow({
      chains: [
        registry[0],
        { ...registry[1], effectiveRights: EPP_CHAIN_ACCESS_READ },
        registry[2],
      ],
    })
    const readOnly = nodesOf(wrapper).find((n) => n.data.id === '2')
    const editable = nodesOf(mountFlow()).find((n) => n.data.id === '2')
    expect(readOnly.data.img).not.toBe(editable.data.img)
  })

  it('marks a chain with unsaved edits', () => {
    const dirty = nodesOf(mountFlow({ dirtyChainIds: new Set([2]) })).find((n) => n.data.id === '2')
    const clean = nodesOf(mountFlow()).find((n) => n.data.id === '2')
    expect(dirty.data.img).not.toBe(clean.data.img)
  })

  it('draws an edge per chain-to-chain call', () => {
    const edges = edgesOf(mountFlow())
    expect(edges.map((e) => e.data.id)).toEqual(['0>2', '0>3'])
    expect(edges.map((e) => [e.data.source, e.data.target])).toEqual([
      ['0', '2'],
      ['0', '3'],
    ])
  })

  it('still draws every chain before the rules have loaded, just without edges', () => {
    const wrapper = mountFlow({ chainsWithRules: [], callGraph: new Map() })
    expect(nodesOf(wrapper)).toHaveLength(3)
    expect(edgesOf(wrapper)).toHaveLength(0)
  })

  it('marks the open chain', () => {
    const nodes = nodesOf(mountFlow({ activeChainId: 2 }))
    expect(nodes.find((n) => n.data.id === '2').classes).toContain('active')
    expect(nodes.find((n) => n.data.id === '0').classes).not.toContain('active')
  })

  it('marks a chain no event reaches', () => {
    const orphanRegistry = [...registry, { id: 4, name: 'orphan', ruleCount: 1, callerCount: 0 }]
    const nodes = nodesOf(mountFlow({ chains: orphanRegistry }))
    expect(nodes.find((n) => n.data.id === '4').classes).toContain('unreachable')
    expect(nodes.find((n) => n.data.id === '2').classes).not.toContain('unreachable')
  })

  it('drops an edge to a chain that no longer exists rather than breaking the graph', () => {
    const wrapper = mountFlow({
      chainsWithRules: [{ id: 0, rules: [{ guid: 'r1', ruleNumber: 1, chainCalls: [99] }] }],
    })
    expect(edgesOf(wrapper)).toHaveLength(0)
    expect(nodesOf(wrapper)).toHaveLength(3)
  })

  it('summarises what the drawing should contain, so a blank canvas is diagnosable', () => {
    expect(mountFlow().text()).toContain('3 chains · 2 calls')
  })

  // jsdom's canvas cannot measure text, so this also covers the fallback path.
  it('gives every node a finite, non-zero size', () => {
    const nodes = nodesOf(
      mountFlow({
        chains: [
          { id: 0, name: 'Default policy', ruleCount: 63 },
          { id: 2, name: 'x', ruleCount: 1 },
          { id: 3, name: 'a-very-long-chain-name-that-would-otherwise-wrap', ruleCount: 0 },
        ],
      }),
    )
    for (const node of nodes) {
      expect(Number.isFinite(node.data.w)).toBe(true)
      expect(node.data.w).toBeGreaterThan(0)
      expect(Number.isFinite(node.data.h)).toBe(true)
      expect(node.data.h).toBeGreaterThan(0)
    }
  })

  it('keeps node width within bounds so long names cannot stretch the graph', () => {
    const nodes = nodesOf(
      mountFlow({
        chains: [
          { id: 2, name: 'x', ruleCount: 1 },
          {
            id: 3,
            name: 'a-very-long-chain-name-that-would-otherwise-stretch-forever',
            ruleCount: 0,
          },
        ],
      }),
    )
    expect(nodes[0].data.w).toBeGreaterThanOrEqual(158)
    expect(nodes[1].data.w).toBeLessThanOrEqual(250)
    expect(nodes[1].data.name).toMatch(/…$/)
  })

  it('labels an edge only when several rules share it', () => {
    const wrapper = mountFlow({
      chainsWithRules: [
        {
          id: 0,
          rules: [
            { guid: 'a', ruleNumber: 1, chainCalls: [2] },
            { guid: 'b', ruleNumber: 2, chainCalls: [2] },
            { guid: 'c', ruleNumber: 3, chainCalls: [3] },
          ],
        },
      ],
    })
    const edges = edgesOf(wrapper)
    expect(edges.find((e) => e.data.id === '0>2').data.label).toBe('2 rules')
    expect(edges.find((e) => e.data.id === '0>3').data.label).toBe('')
  })

  it('lets the viewer drag nodes around', async () => {
    cyOptions.last = null
    mountFlow()
    await vi.waitFor(() => expect(cyOptions.last).not.toBeNull())
    expect(cyOptions.last.autoungrabify).toBeUndefined()
    expect(cyOptions.last.autounselectify).toBe(true)
  })
})
