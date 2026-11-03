import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LINK_MERGE_THRESHOLD,
  LINK_FAN_SPACING,
  activeMergeThreshold,
  buildDrawnLinks,
  configuredMergeThreshold,
  fanEndpoint,
  groupLinkVisual,
  isInvertedMember,
  offsetEndpoints,
} from '@/utils/networkMapParallelLinks'
import { LINK_TYPES } from '@/utils/networkMapUtils'
import { MAP_LINK_COLOR_SOURCES } from '@/utils/networkMapAdapters'
import { getStatusHexColor } from '@/utils/objectUtils'

const link = (id, from, to, extra = {}) => ({ id, from, to, type: LINK_TYPES.NORMAL, ...extra })

/** id -> fanOffset, for compact assertions. */
const offsets = (drawn) => Object.fromEntries(drawn.map((d) => [d.id, d.fanOffset]))

describe('configuredMergeThreshold', () => {
  it('reads the map setting', () => {
    expect(configuredMergeThreshold({ rawContent: { linkMergeThreshold: 5 } })).toBe(5)
  })

  it('treats 0 and below as never merging', () => {
    expect(configuredMergeThreshold({ rawContent: { linkMergeThreshold: 0 } })).toBe(0)
    expect(configuredMergeThreshold({ rawContent: { linkMergeThreshold: -3 } })).toBe(0)
  })

  it('falls back to the server default when the map does not say', () => {
    expect(configuredMergeThreshold({ rawContent: {} })).toBe(DEFAULT_LINK_MERGE_THRESHOLD)
    expect(configuredMergeThreshold(null)).toBe(DEFAULT_LINK_MERGE_THRESHOLD)
    expect(configuredMergeThreshold({ rawContent: { linkMergeThreshold: null } })).toBe(2)
  })
})

describe('activeMergeThreshold', () => {
  it('merges nothing while the view toggle is off', () => {
    expect(activeMergeThreshold(3, false)).toBe(0)
  })

  it("uses the map's threshold while the toggle is on", () => {
    expect(activeMergeThreshold(3, true)).toBe(3)
  })

  it('uses the default threshold when the map says never but the toggle is on', () => {
    expect(activeMergeThreshold(0, true)).toBe(DEFAULT_LINK_MERGE_THRESHOLD)
  })
})

describe('buildDrawnLinks', () => {
  it('draws a lone link as itself, not offset', () => {
    const drawn = buildDrawnLinks([link('l-0', 'a', 'b')], 2)
    expect(drawn).toEqual([
      {
        id: 'l-0',
        kind: 'link',
        link: expect.objectContaining({ id: 'l-0' }),
        members: null,
        from: 'a',
        to: 'b',
        fanOffset: 0,
      },
    ])
  })

  it('merges more than threshold NORMAL links between one pair into a group', () => {
    const links = [link('l-0', 'a', 'b'), link('l-1', 'a', 'b'), link('l-2', 'b', 'a')]
    const [group] = buildDrawnLinks(links, 2)
    expect(group).toMatchObject({ id: 'grp-l-0', kind: 'group', link: null, from: 'a', to: 'b' })
    expect(group.members.map((m) => m.id)).toEqual(['l-0', 'l-1', 'l-2'])
  })

  it('takes the orientation of the first member in map order', () => {
    const links = [link('l-0', 'b', 'a'), link('l-1', 'a', 'b'), link('l-2', 'a', 'b')]
    const [group] = buildDrawnLinks(links, 2)
    expect(group).toMatchObject({ from: 'b', to: 'a' })
    expect(links.map((m) => isInvertedMember(group, m))).toEqual([false, true, true])
  })

  it('keeps pairs at or below the threshold unmerged, fanned out', () => {
    const drawn = buildDrawnLinks([link('l-0', 'a', 'b'), link('l-1', 'a', 'b')], 2)
    expect(drawn.map((d) => d.kind)).toEqual(['link', 'link'])
    expect(offsets(drawn)).toEqual({ 'l-0': -LINK_FAN_SPACING / 2, 'l-1': LINK_FAN_SPACING / 2 })
  })

  it('never merges with a threshold of 0', () => {
    const links = [link('l-0', 'a', 'b'), link('l-1', 'a', 'b'), link('l-2', 'a', 'b')]
    const drawn = buildDrawnLinks(links, 0)
    expect(drawn.map((d) => d.kind)).toEqual(['link', 'link', 'link'])
    expect(offsets(drawn)).toEqual({ 'l-0': -12, 'l-1': 0, 'l-2': 12 })
  })

  it('merges NORMAL links only and fans the others out beside the group', () => {
    const links = [
      link('l-0', 'a', 'b', { type: LINK_TYPES.VPN }),
      link('l-1', 'a', 'b'),
      link('l-2', 'a', 'b'),
      link('l-3', 'a', 'b'),
    ]
    const drawn = buildDrawnLinks(links, 2)
    expect(drawn.map((d) => d.id)).toEqual(['l-0', 'grp-l-1'])
    expect(offsets(drawn)).toEqual({ 'l-0': -6, 'grp-l-1': 6 })
  })

  it('counts only NORMAL links toward the threshold', () => {
    const links = [
      link('l-0', 'a', 'b'),
      link('l-1', 'a', 'b'),
      link('l-2', 'a', 'b', { type: LINK_TYPES.AGENT_TUNNEL }),
    ]
    expect(buildDrawnLinks(links, 2).map((d) => d.kind)).toEqual(['link', 'link', 'link'])
  })

  it('flips the offset of a link stored the other way round, so the lines do not coincide', () => {
    const drawn = buildDrawnLinks([link('l-0', 'a', 'b'), link('l-1', 'b', 'a')], 2)
    // Each offset runs along its own line's normal, which flips with the direction:
    // same sign here would put both lines on the same physical side.
    expect(offsets(drawn)).toEqual({ 'l-0': -6, 'l-1': -6 })
    const ab = offsetEndpoints({ x: 0, y: 0 }, { x: 100, y: 0 }, drawn[0].fanOffset)
    const ba = offsetEndpoints({ x: 100, y: 0 }, { x: 0, y: 0 }, drawn[1].fanOffset)
    expect(ab.source.y).toBe(-6)
    expect(ba.source.y).toBe(6)
  })

  it('does not fan links with bend points, nor leave a gap for them', () => {
    const links = [
      link('l-0', 'a', 'b'),
      link('l-1', 'a', 'b', { bendPoints: [{ x: 5, y: 5 }] }),
      link('l-2', 'a', 'b'),
    ]
    const drawn = buildDrawnLinks(links, 0, (l) => !!l.bendPoints?.length)
    expect(offsets(drawn)).toEqual({ 'l-0': -6, 'l-1': 0, 'l-2': 6 })
  })

  it('keeps pairs apart', () => {
    const drawn = buildDrawnLinks([link('l-0', 'a', 'b'), link('l-1', 'a', 'c')], 2)
    expect(offsets(drawn)).toEqual({ 'l-0': 0, 'l-1': 0 })
  })
})

describe('offsetEndpoints', () => {
  it('moves both ends along the normal (-uy, ux)', () => {
    expect(offsetEndpoints({ x: 0, y: 0 }, { x: 0, y: 50 }, 10)).toEqual({
      source: { x: -10, y: 0 },
      target: { x: -10, y: 50 },
    })
  })

  it('leaves coincident endpoints alone', () => {
    const p = { x: 3, y: 4 }
    expect(offsetEndpoints(p, p, 10)).toEqual({ source: p, target: p })
  })
})

describe('fanEndpoint', () => {
  const circle = { kind: 'ellipse', halfW: 22, halfH: 22 }
  const source = { x: 0, y: 0 }
  const target = { x: 200, y: 0 }

  it('meets a circle where the offset line leaves it', () => {
    const p = fanEndpoint(source, target, 6, 'source', circle)
    expect(p.y).toBe(6)
    expect(p.x).toBeCloseTo(Math.sqrt(22 * 22 - 36), 2)
  })

  it('heads back toward the source at the target end, same side', () => {
    const p = fanEndpoint(source, target, 6, 'target', circle)
    expect(p.y).toBe(6)
    expect(p.x).toBeCloseTo(-Math.sqrt(22 * 22 - 36), 2)
  })

  it('meets a rectangle on the face the line crosses', () => {
    const rect = { kind: 'rectangle', halfW: 40, halfH: 12 }
    expect(fanEndpoint(source, target, -6, 'source', rect)).toEqual({ x: 40, y: -6 })
    // Straight down: the line crosses the bottom face.
    expect(fanEndpoint(source, { x: 0, y: 100 }, 6, 'source', rect)).toEqual({ x: -6, y: 12 })
  })

  it('starts level with the centre when the offset line misses the node', () => {
    expect(fanEndpoint(source, target, 30, 'source', circle)).toEqual({ x: 0, y: 30 })
  })

  it('does not divide by zero when the nodes coincide', () => {
    expect(fanEndpoint(source, source, 6, 'source', circle)).toEqual({ x: 0, y: 0 })
  })
})

describe('groupLinkVisual', () => {
  const member = (id, statuses) => ({
    ...link(id, 'a', 'b'),
    raw: {},
    colorSource: MAP_LINK_COLOR_SOURCES.OBJECT_STATUS,
    statusSources: { interfaces: [], objects: statuses.map((status) => ({ status })) },
  })

  it('draws the group in its most critical member colour, a little thicker', () => {
    const visual = groupLinkVisual([member('l-0', [1]), member('l-1', [4]), member('l-2', [2])])
    expect(visual.member.id).toBe('l-1')
    expect(visual.color).toBe(getStatusHexColor(4))
    expect(visual.width).toBe(4)
  })

  it('falls back to the first member when no status is known', () => {
    const visual = groupLinkVisual([member('l-0', []), member('l-1', [5])])
    expect(visual.member.id).toBe('l-0')
  })

  it("widens the member's own width", () => {
    const visual = groupLinkVisual([{ ...member('l-0', []), width: 5 }])
    expect(visual.width).toBe(7)
  })
})
