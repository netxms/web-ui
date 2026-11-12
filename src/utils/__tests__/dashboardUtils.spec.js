// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  widgetsToLayout,
  mergeLayout,
  collectDescendantDashboards,
  collectDescendantGroups,
  computeRowTracks,
  hasContentSizedRows,
} from '@/utils/dashboardUtils'

describe('widgetsToLayout', () => {
  const widgets = [
    { id: 'abc', x: 1, y: 2, w: 3, h: 4, type: 'label', config: {} },
    { id: 123, x: 0, y: 5, w: 6, h: 1, type: 'unknown', config: {} },
  ]

  it('returns an array of the same length', () => {
    expect(widgetsToLayout(widgets)).toHaveLength(2)
  })

  it('maps id to string i', () => {
    const [a, b] = widgetsToLayout(widgets)
    expect(a.i).toBe('abc')
    expect(b.i).toBe('123')
  })

  it('preserves x, y, w, h', () => {
    const [a] = widgetsToLayout(widgets)
    expect(a).toMatchObject({ x: 1, y: 2, w: 3, h: 4 })
  })

  it('does not include type or config in output', () => {
    const [a] = widgetsToLayout(widgets)
    expect(a.type).toBeUndefined()
    expect(a.config).toBeUndefined()
  })

  it('returns empty array for empty input', () => {
    expect(widgetsToLayout([])).toEqual([])
  })
})

describe('mergeLayout', () => {
  const widgets = [
    { id: 'w1', x: 0, y: 0, w: 2, h: 2, type: 'label', config: { text: 'hi' } },
    { id: 'w2', x: 2, y: 0, w: 2, h: 2, type: 'unknown', config: {} },
  ]

  it('updates x/y/w/h from layout', () => {
    const layout = [{ i: 'w1', x: 3, y: 1, w: 4, h: 3 }]
    const result = mergeLayout(widgets, layout)
    expect(result[0]).toMatchObject({ x: 3, y: 1, w: 4, h: 3 })
  })

  it('preserves config and type after merge', () => {
    const layout = [{ i: 'w1', x: 1, y: 1, w: 1, h: 1 }]
    const result = mergeLayout(widgets, layout)
    expect(result[0].config.text).toBe('hi')
    expect(result[0].type).toBe('label')
  })

  it('leaves widgets unchanged if not in layout', () => {
    const layout = [{ i: 'w1', x: 0, y: 0, w: 2, h: 2 }]
    const result = mergeLayout(widgets, layout)
    expect(result[1]).toEqual(widgets[1])
  })

  it('returns same length as widgets input', () => {
    expect(mergeLayout(widgets, [])).toHaveLength(2)
  })

  it('handles numeric ids stringified as keys', () => {
    const numWidgets = [{ id: 99, x: 0, y: 0, w: 1, h: 1, type: 'label', config: {} }]
    const layout = [{ i: '99', x: 5, y: 5, w: 3, h: 3 }]
    const result = mergeLayout(numWidgets, layout)
    expect(result[0]).toMatchObject({ x: 5, y: 5 })
  })
})

describe('collectDescendantDashboards / collectDescendantGroups', () => {
  const tree = [
    {
      id: 1,
      class: 'DashboardGroup',
      name: 'Group A',
      children: [
        { id: 10, class: 'Dashboard', name: 'Dashboard A1' },
        {
          id: 2,
          class: 'DashboardGroup',
          name: 'Group A-Nested',
          children: [{ id: 20, class: 'Dashboard', name: 'Dashboard A2' }],
        },
      ],
    },
    { id: 11, class: 'Dashboard', name: 'Dashboard Top' },
  ]

  it('collects every dashboard in the whole subtree, not just direct children', () => {
    const dashboards = collectDescendantDashboards(tree)
    expect(dashboards.map((d) => d.id).sort()).toEqual([10, 11, 20])
  })

  it('collects every nested group', () => {
    const groups = collectDescendantGroups(tree)
    expect(groups.map((g) => g.id).sort()).toEqual([1, 2])
  })

  it('accepts a single group node (uses its .children)', () => {
    const groupNode = tree[0]
    expect(
      collectDescendantDashboards(groupNode)
        .map((d) => d.id)
        .sort(),
    ).toEqual([10, 20])
    expect(collectDescendantGroups(groupNode).map((g) => g.id)).toEqual([2])
  })

  it('returns an empty array for a node with no children', () => {
    expect(collectDescendantDashboards({ id: 99, class: 'Dashboard' })).toEqual([])
    expect(collectDescendantGroups({ id: 99, class: 'Dashboard' })).toEqual([])
  })
})

describe('computeRowTracks', () => {
  /** @param {object} o */
  const w = ({ y, h = 1, grab = true, heightHint, inline = false, type = 'line-chart' }) => ({
    id: `${type}-${y}-${h}`,
    type,
    x: 0,
    y,
    w: 1,
    h,
    inline,
    raw: { layout: { grabVerticalSpace: grab, ...(heightHint == null ? {} : { heightHint }) } },
  })
  const isInline = (widget) => widget.inline === true

  it('returns no tracks for an empty board', () => {
    expect(computeRowTracks([], isInline)).toEqual([])
  })

  it('keeps a non-grabbing label row content-sized while charts share the rest', () => {
    // The "Critical system status" shape: a full-width label above two chart rows.
    const tracks = computeRowTracks(
      [w({ y: 0, grab: false, inline: true, type: 'label' }), w({ y: 1 }), w({ y: 2 })],
      isInline,
    )
    expect(tracks).toEqual(['auto', 'minmax(60px, 1fr)', 'minmax(60px, 1fr)'])
  })

  it('reads grabVerticalSpace when the API sends it as a string', () => {
    const [label, chart] = computeRowTracks(
      [w({ y: 0, grab: 'false', inline: true, type: 'label' }), w({ y: 1, grab: 'true' })],
      isInline,
    )
    expect(label).toBe('auto')
    expect(chart).toBe('minmax(60px, 1fr)')
  })

  it('treats a missing grabVerticalSpace as grabbing', () => {
    const widget = w({ y: 0 })
    delete widget.raw.layout.grabVerticalSpace
    expect(computeRowTracks([widget], isInline)).toEqual(['minmax(60px, 1fr)'])
  })

  it('floors a content-sized row holding a card widget but not an inline-only row', () => {
    const tracks = computeRowTracks(
      [w({ y: 0, grab: false, inline: true, type: 'label' }), w({ y: 1, grab: false })],
      isInline,
    )
    expect(tracks).toEqual(['auto', 'minmax(60px, auto)'])
  })

  it('honours heightHint on a non-grabbing element', () => {
    const tracks = computeRowTracks(
      [w({ y: 0, grab: false, heightHint: 120, inline: true, type: 'label' }), w({ y: 1 })],
      isInline,
    )
    expect(tracks[0]).toBe('minmax(120px, auto)')
  })

  it('ignores heightHint on a grabbing element, as the legacy layout does', () => {
    expect(computeRowTracks([w({ y: 0, heightHint: 300 })], isInline)).toEqual([
      'minmax(60px, 1fr)',
    ])
  })

  it('splits a multi-row heightHint across its rows, net of the gaps', () => {
    // 128px over two rows leaves 120px of track once the 8px gap between them is removed.
    const tracks = computeRowTracks(
      [w({ y: 0, h: 2, grab: false, heightHint: 128, inline: true, type: 'label' })],
      isInline,
    )
    expect(tracks).toEqual(['minmax(60px, auto)', 'minmax(60px, auto)'])
  })

  it('lets a multi-row grabbing element claim a row no one else has taken', () => {
    const tracks = computeRowTracks(
      [w({ y: 0, grab: false, inline: true, type: 'label' }), w({ y: 0, h: 2 })],
      isInline,
    )
    expect(tracks[0]).toBe('minmax(60px, auto)')
    expect(tracks[1]).toBe('minmax(60px, 1fr)')
  })

  it('falls back to its first row when every row of a multi-row grabber is content-sized', () => {
    const tracks = computeRowTracks(
      [
        w({ y: 0, grab: false, inline: true, type: 'label' }),
        w({ y: 1, grab: false, inline: true, type: 'label' }),
        w({ y: 0, h: 2 }),
      ],
      isInline,
    )
    expect(tracks[0]).toBe('minmax(60px, 1fr)')
    expect(tracks[1]).toBe('minmax(60px, auto)')
  })

  it('does not depend on widget order', () => {
    const board = [w({ y: 0, grab: false, inline: true, type: 'label' }), w({ y: 1 }), w({ y: 2 })]
    expect(computeRowTracks([...board].reverse(), isInline)).toEqual(
      computeRowTracks(board, isInline),
    )
  })

  it('stacks fixed rows and ignores grab on a scrollable board', () => {
    const tracks = computeRowTracks(
      [w({ y: 0, grab: false, heightHint: 40, inline: true, type: 'label' }), w({ y: 1 })],
      isInline,
      { scrollable: true, rowHeight: 90 },
    )
    // The hint wins for the label; the chart falls back to the board's row height.
    expect(tracks).toEqual(['40px', '90px'])
  })
})

describe('hasContentSizedRows', () => {
  it('is false when every row shares the leftover height', () => {
    expect(hasContentSizedRows(['minmax(60px, 1fr)', 'minmax(0px, 1fr)'])).toBe(false)
  })

  it('is true for an auto row', () => {
    expect(hasContentSizedRows(['auto', 'minmax(60px, 1fr)'])).toBe(true)
  })

  it('is true for a hinted row', () => {
    expect(hasContentSizedRows(['minmax(120px, auto)', 'minmax(60px, 1fr)'])).toBe(true)
  })

  it('is true for the fixed rows of a scrollable board', () => {
    expect(hasContentSizedRows(['40px', '90px'])).toBe(true)
  })

  it('is false for an empty board', () => {
    expect(hasContentSizedRows([])).toBe(false)
    expect(hasContentSizedRows(undefined)).toBe(false)
  })

  it('agrees with computeRowTracks on a board where every element grabs', () => {
    const grabbing = (y) => ({
      id: `w${y}`,
      type: 'line-chart',
      x: 0,
      y,
      w: 1,
      h: 1,
      raw: { layout: { grabVerticalSpace: true } },
    })
    const tracks = computeRowTracks([grabbing(0), grabbing(1)], () => false)
    expect(hasContentSizedRows(tracks)).toBe(false)
  })
})
