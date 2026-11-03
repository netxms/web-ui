import { describe, it, expect, vi } from 'vitest'
import { resolveActions, extractPrimaryActions, flattenActions } from '@/composables/useActions'

describe('resolveActions', () => {
  const baseCtx = {
    object: { id: 1, name: 'server-01', class: 'Node' },
    viewContext: 'objectTree',
  }

  it('returns actions that match the object class', () => {
    const actions = [
      { id: 'a', label: 'A', objectClasses: ['Node'] },
      { id: 'b', label: 'B', objectClasses: ['Container'] },
      { id: 'c', label: 'C' }, // no class restriction — universal
    ]
    const result = resolveActions(actions, baseCtx)
    const ids = result.filter((i) => !i.separator).map((i) => i.id)
    expect(ids).toEqual(['a', 'c'])
  })

  it('filters out actions where isApplicable returns false', () => {
    const actions = [
      { id: 'a', label: 'A', isApplicable: () => true },
      { id: 'b', label: 'B', isApplicable: () => false },
      { id: 'c', label: 'C' },
    ]
    const result = resolveActions(actions, baseCtx)
    const ids = result.filter((i) => !i.separator).map((i) => i.id)
    expect(ids).toEqual(['a', 'c'])
  })

  it('filters out actions the user lacks the object right for', () => {
    const actions = [
      { id: 'del', label: 'Delete', requiredObjectRight: 'DELETE' },
      { id: 'read', label: 'Read', requiredObjectRight: 'READ' },
      { id: 'free', label: 'Free' },
    ]
    const readOnly = {
      ...baseCtx,
      object: { ...baseCtx.object, effectiveRights: { read: true, delete: false } },
    }
    const ids = resolveActions(actions, readOnly)
      .filter((i) => !i.separator)
      .map((i) => i.id)
    expect(ids).toEqual(['read', 'free'])
  })

  it('keeps right-gated actions when the object carries no effective rights', () => {
    const actions = [{ id: 'del', label: 'Delete', requiredObjectRight: 'DELETE' }]
    const ids = resolveActions(actions, baseCtx)
      .filter((i) => !i.separator)
      .map((i) => i.id)
    expect(ids).toEqual(['del'])
  })

  it('sets disabled from isDisabled predicate', () => {
    const actions = [
      { id: 'a', label: 'A', isDisabled: () => true },
      { id: 'b', label: 'B', isDisabled: () => false },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result.find((i) => i.id === 'a').disabled).toBe(true)
    expect(result.find((i) => i.id === 'b').disabled).toBe(false)
  })

  it('inserts separators between different groups', () => {
    const actions = [
      { id: 'a', label: 'A', group: 'edit' },
      { id: 'b', label: 'B', group: 'edit' },
      { id: 'c', label: 'C', group: 'tools' },
      { id: 'd', label: 'D', group: 'tools' },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result).toEqual([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' }),
      { separator: true },
      expect.objectContaining({ id: 'c' }),
      expect.objectContaining({ id: 'd' }),
    ])
  })

  it('does not insert separator before the first group', () => {
    const actions = [
      { id: 'a', label: 'A', group: 'edit' },
      { id: 'b', label: 'B', group: 'tools' },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result[0].separator).toBeUndefined()
    expect(result[0].id).toBe('a')
  })

  it('wraps command to inject actionContext', () => {
    const spy = vi.fn()
    const actions = [{ id: 'a', label: 'A', command: spy }]
    const result = resolveActions(actions, baseCtx)
    const event = { originalEvent: new Event('click'), item: result[0] }
    result[0].command(event)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0].actionContext).toEqual(baseCtx)
  })

  it('recursively resolves sub-items', () => {
    const actions = [
      {
        id: 'parent',
        label: 'Parent',
        items: [
          { id: 'child-a', label: 'Child A', objectClasses: ['Node'] },
          { id: 'child-b', label: 'Child B', objectClasses: ['Container'] },
        ],
      },
    ]
    const result = resolveActions(actions, baseCtx)
    const parent = result.find((i) => i.id === 'parent')
    expect(parent).toBeDefined()
    const childIds = parent.items.filter((i) => !i.separator).map((i) => i.id)
    expect(childIds).toEqual(['child-a'])
  })

  it('hides parent when all children are filtered out', () => {
    const actions = [
      {
        id: 'parent',
        label: 'Parent',
        items: [{ id: 'child', label: 'Child', objectClasses: ['Container'] }],
      },
    ]
    const result = resolveActions(actions, baseCtx)
    const nonSeparators = result.filter((i) => !i.separator)
    expect(nonSeparators).toHaveLength(0)
  })

  it('keeps a dynamic parent visible when it has no static children', () => {
    // Server-defined object tools are injected at render time.
    const actions = [{ id: 'tools', label: 'Tools', dynamic: true, items: [] }]
    const result = resolveActions(actions, baseCtx)
    expect(result.filter((i) => !i.separator).map((i) => i.id)).toEqual(['tools'])
  })

  it('orders actions by priority within a group', () => {
    const actions = [
      { id: 'late', label: 'Late', group: 'edit', priority: 30 },
      { id: 'early', label: 'Early', group: 'edit', priority: 10 },
      { id: 'middle', label: 'Middle', group: 'edit', priority: 20 },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result.map((i) => i.id)).toEqual(['early', 'middle', 'late'])
  })

  it('keeps groups in declaration order regardless of priority', () => {
    const actions = [
      { id: 'a', label: 'A', group: 'first', priority: 90 },
      { id: 'b', label: 'B', group: 'second', priority: 10 },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result.map((i) => i.id ?? 'sep')).toEqual(['a', 'sep', 'b'])
  })

  it('groups scattered actions together instead of repeating separators', () => {
    const actions = [
      { id: 'a', label: 'A', group: 'edit', priority: 10 },
      { id: 'c', label: 'C', group: 'tools', priority: 10 },
      { id: 'b', label: 'B', group: 'edit', priority: 20 },
    ]
    const result = resolveActions(actions, baseCtx)
    expect(result.map((i) => i.id ?? 'sep')).toEqual(['a', 'b', 'sep', 'c'])
  })

  it('does not mutate original action definitions', () => {
    const command = vi.fn()
    const actions = [{ id: 'a', label: 'A', command }]
    const result = resolveActions(actions, baseCtx)
    expect(result[0]).not.toBe(actions[0])
    expect(actions[0].command).toBe(command) // original unchanged
  })

  it('passes context to isApplicable predicate', () => {
    const predicate = vi.fn(() => true)
    const actions = [{ id: 'a', label: 'A', isApplicable: predicate }]
    resolveActions(actions, baseCtx)
    expect(predicate).toHaveBeenCalledWith(baseCtx)
  })

  const multiCtx = {
    ...baseCtx,
    selection: [
      { id: 1, name: 'server-01', class: 'Node' },
      { id: 2, name: 'server-02', class: 'Node' },
    ],
  }

  it('hides actions that do not opt into multiSelect when several objects are selected', () => {
    const actions = [
      { id: 'rename', label: 'Rename' },
      { id: 'delete', label: 'Delete', multiSelect: true },
    ]
    const ids = resolveActions(actions, multiCtx)
      .filter((i) => !i.separator)
      .map((i) => i.id)
    expect(ids).toEqual(['delete'])
  })

  it('leaves a single-object selection resolving exactly as before', () => {
    const actions = [
      { id: 'rename', label: 'Rename' },
      { id: 'delete', label: 'Delete', multiSelect: true },
    ]
    const single = { ...baseCtx, selection: [baseCtx.object] }
    const ids = resolveActions(actions, single)
      .filter((i) => !i.separator)
      .map((i) => i.id)
    expect(ids).toEqual(['rename', 'delete'])
  })

  it('checks objectClasses against every selected object, not just the right-clicked one', () => {
    const actions = [{ id: 'a', label: 'A', multiSelect: true, objectClasses: ['Node'] }]
    const mixed = {
      ...baseCtx,
      selection: [
        { id: 1, class: 'Node' },
        { id: 2, class: 'Container' },
      ],
    }
    expect(resolveActions(actions, mixed).filter((i) => !i.separator)).toEqual([])
    expect(resolveActions(actions, multiCtx).filter((i) => !i.separator)).toHaveLength(1)
  })

  it('checks requiredObjectRight against every selected object', () => {
    const actions = [
      { id: 'del', label: 'Delete', multiSelect: true, requiredObjectRight: 'DELETE' },
    ]
    const oneReadOnly = {
      ...baseCtx,
      selection: [
        { id: 1, class: 'Node', effectiveRights: { delete: true } },
        { id: 2, class: 'Node', effectiveRights: { delete: false } },
      ],
    }
    expect(resolveActions(actions, oneReadOnly).filter((i) => !i.separator)).toEqual([])
  })

  it('hides a multiSelect parent whose children are all single-only', () => {
    const actions = [
      {
        id: 'parent',
        label: 'Parent',
        multiSelect: true,
        items: [{ id: 'child', label: 'Child' }],
      },
    ]
    expect(resolveActions(actions, multiCtx).filter((i) => !i.separator)).toEqual([])
  })

  it('calls isApplicable once with the full context including the selection', () => {
    const isApplicable = vi.fn(() => true)
    const actions = [{ id: 'a', label: 'A', multiSelect: true, isApplicable }]
    resolveActions(actions, multiCtx)
    expect(isApplicable).toHaveBeenCalledTimes(1)
    expect(isApplicable).toHaveBeenCalledWith(multiCtx)
    expect(isApplicable.mock.calls[0][0].selection).toHaveLength(2)
  })
})

describe('extractPrimaryActions', () => {
  it('promotes only actions flagged primary', () => {
    const items = [
      { id: 'a', label: 'A', priority: 10 },
      { id: 'b', label: 'B', priority: 20, primary: true },
      { id: 'c', label: 'C', priority: 30, primary: true },
    ]
    expect(extractPrimaryActions(items, 2).map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('does not flatten submenu children into the header', () => {
    const items = [
      { id: 'parent', label: 'Parent', items: [{ id: 'child', label: 'Child', primary: true }] },
      { id: 'a', label: 'A', primary: true },
    ]
    expect(extractPrimaryActions(items, 5).map((i) => i.id)).toEqual(['a'])
  })

  it('promotes a submenu itself when the submenu is flagged primary', () => {
    const items = [
      { id: 'poll', label: 'Poll', primary: true, items: [{ id: 'poll.status', label: 'Status' }] },
    ]
    const result = extractPrimaryActions(items, 2)
    expect(result.map((i) => i.id)).toEqual(['poll'])
    expect(result[0].items).toHaveLength(1)
  })

  it('skips separators and disabled actions', () => {
    const items = [
      { separator: true },
      { id: 'a', label: 'A', primary: true, disabled: true },
      { id: 'b', label: 'B', primary: true },
    ]
    expect(extractPrimaryActions(items, 5).map((i) => i.id)).toEqual(['b'])
  })

  it('caps the result at max', () => {
    const items = [
      { id: 'a', label: 'A', primary: true, priority: 1 },
      { id: 'b', label: 'B', primary: true, priority: 2 },
      { id: 'c', label: 'C', primary: true, priority: 3 },
    ]
    expect(extractPrimaryActions(items, 2).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('returns nothing when no action is promoted', () => {
    const items = [{ id: 'a', label: 'A' }, { separator: true }, { id: 'b', label: 'B' }]
    expect(extractPrimaryActions(items, 2)).toEqual([])
  })
})

describe('flattenActions', () => {
  it('reaches leaves nested in submenus and records their path', () => {
    const items = [
      {
        id: 'poll',
        label: 'Poll',
        items: [{ id: 'poll.status', label: 'Status', command: vi.fn() }],
      },
    ]
    const [leaf] = flattenActions(items)
    expect(leaf).toMatchObject({
      id: 'poll.status',
      label: 'Status',
      path: ['Poll'],
      pathLabel: 'Poll > Status',
    })
  })

  it('handles more than one level of nesting', () => {
    const items = [
      {
        id: 'open',
        label: 'Open',
        items: [
          {
            id: 'open.topology',
            label: 'Topology Map',
            items: [{ id: 'open.topology.l2', label: 'Layer 2', command: vi.fn() }],
          },
        ],
      },
    ]
    expect(flattenActions(items)[0].pathLabel).toBe('Open > Topology Map > Layer 2')
  })

  it('skips separators, disabled entries and items with no command', () => {
    const items = [
      { separator: true },
      { id: 'a', label: 'A', command: vi.fn() },
      { id: 'b', label: 'B', command: vi.fn(), disabled: true },
      { id: 'c', label: 'C' },
    ]
    expect(flattenActions(items).map((i) => i.id)).toEqual(['a'])
  })

  it('keeps the command runnable', () => {
    const command = vi.fn()
    const [leaf] = flattenActions([{ id: 'a', label: 'A', command }])
    leaf.command({ item: leaf })
    expect(command).toHaveBeenCalledOnce()
  })

  it('returns an empty list for an empty menu', () => {
    expect(flattenActions([])).toEqual([])
  })
})
