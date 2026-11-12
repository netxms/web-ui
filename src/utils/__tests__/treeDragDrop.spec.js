// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dropConfirmation, effectiveDragAndDropMode, planTreeDrop } from '@/utils/treeDragDrop'
import { canBindChild } from '@/utils/objectCreationRules'

describe('effectiveDragAndDropMode', () => {
  it('takes the user choice over the server hint', () => {
    expect(effectiveDragAndDropMode('disable', '0')).toBe('disable')
    expect(effectiveDragAndDropMode('confirm', '2')).toBe('confirm')
  })

  it('reads the hint as legacy does: 0 enable, 1 confirm, 2 disable', () => {
    expect(effectiveDragAndDropMode('server', '0')).toBe('enable')
    expect(effectiveDragAndDropMode('server', '1')).toBe('confirm')
    expect(effectiveDragAndDropMode('server', ' 2')).toBe('disable')
  })

  it('enables it without a hint, or with one it cannot read', () => {
    expect(effectiveDragAndDropMode('server', null)).toBe('enable')
    expect(effectiveDragAndDropMode('server', 'yes')).toBe('enable')
    expect(effectiveDragAndDropMode('server', '7')).toBe('enable')
    expect(effectiveDragAndDropMode(undefined, null)).toBe('enable')
  })
})

describe('planTreeDrop', () => {
  const root = { id: 2, name: 'Infrastructure', class: 'ServiceRoot' }
  const office = { id: 112, name: 'Office', class: 'Container', children: [] }
  const alpha = { id: 500, name: 'DataCenter-Alpha', class: 'Container' }
  const cluster = { id: 501, name: 'web-cluster', class: 'Cluster' }
  const node = { id: 502, name: 'web-01', class: 'Node' }
  const tablet = { id: 529, name: 'iPad', class: 'MobileDevice' }
  const parents = {
    500: root,
    112: root,
    '500-529': alpha,
    '500-501': alpha,
    '500-501-502': cluster,
  }
  const parentOf = (path) => parents[path] ?? null

  const plan = (rows, target, targetPath, copy = false) =>
    planTreeDrop({ rows, target, targetPath, copy, canBind: canBindChild, parentOf })

  it('moves each row out of the parent it hangs under', () => {
    expect(plan([{ object: tablet, path: '500-529' }], office, '112')).toEqual([
      { object: tablet, source: alpha },
    ])
  })

  it('takes a container to the root, and the root as a target', () => {
    expect(plan([{ object: office, path: '112' }], alpha, '500')).toEqual([
      { object: office, source: root },
    ])
    expect(plan([{ object: tablet, path: '500-529' }], root, '2')).toEqual([
      { object: tablet, source: alpha },
    ])
  })

  it('refuses the row itself and its own branch', () => {
    expect(plan([{ object: alpha, path: '500' }], alpha, '500')).toBeNull()
    const inside = { id: 600, name: 'Inner', class: 'Container' }
    expect(plan([{ object: alpha, path: '500' }], inside, '500-600')).toBeNull()
  })

  it('refuses a class the target cannot hold', () => {
    expect(plan([{ object: tablet, path: '500-529' }], node, '500-501-502')).toBeNull()
    expect(plan([{ object: alpha, path: '500' }], cluster, '500-501')).toBeNull()
  })

  it('refuses a target that already holds the object', () => {
    const holder = { ...office, children: [tablet] }
    expect(plan([{ object: tablet, path: '500-529' }], holder, '112')).toBeNull()
  })

  it('refuses the parent the row hangs under, even when it lists no children', () => {
    expect(plan([{ object: tablet, path: '500-529' }], alpha, '500')).toBeNull()
  })

  it('does not move what is not bound as to a container, but binds it on a copy', () => {
    const rows = [{ object: node, path: '500-501-502' }]
    expect(plan(rows, office, '112')).toBeNull()
    expect(plan(rows, office, '112', true)).toEqual([{ object: node, source: null }])
  })

  it('refuses the whole drop when one row cannot go', () => {
    const rows = [
      { object: tablet, path: '500-529' },
      { object: node, path: '500-501-502' },
    ]
    expect(plan(rows, office, '112')).toBeNull()
  })

  it('needs the right to change both the object and the target', () => {
    const locked = { ...office, effectiveRights: { modify: false } }
    expect(plan([{ object: tablet, path: '500-529' }], locked, '112')).toBeNull()
    const lockedTablet = { ...tablet, effectiveRights: { modify: false } }
    expect(plan([{ object: lockedTablet, path: '500-529' }], office, '112')).toBeNull()
  })

  it('refuses an empty drag or a missing target', () => {
    expect(plan([], office, '112')).toBeNull()
    expect(plan([{ object: tablet, path: '500-529' }], null, '112')).toBeNull()
  })
})

describe('dropConfirmation', () => {
  const target = { name: 'Office' }

  it('names one object and counts several', () => {
    expect(dropConfirmation({ objects: [{ name: 'iPad' }], target, copy: false })).toEqual({
      header: 'Confirm Move',
      message: 'Move "iPad" to "Office"?',
      acceptLabel: 'Move',
    })
    expect(dropConfirmation({ objects: [{}, {}], target, copy: true }).message).toBe(
      'Bind 2 objects to "Office"?',
    )
  })
})
