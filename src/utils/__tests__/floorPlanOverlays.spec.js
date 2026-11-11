import { describe, it, expect } from 'vitest'
import {
  OVERLAY_IDS,
  SCALE_OVERLAYS,
  binIndex,
  feedBalanceLabels,
  scaleColor,
} from '../floorPlanOverlays'

const overlay = (id) => SCALE_OVERLAYS.find((o) => o.id === id)

describe('floor plan overlays', () => {
  it('offers status first, then every scale', () => {
    expect(OVERLAY_IDS).toEqual(['status', 'inlet', 'power', 'free', 'alarms', 'feeds'])
  })

  it('has one color per bin and label in both themes', () => {
    for (const o of SCALE_OVERLAYS) {
      const bins = o.edges.length + 1
      expect([o.id, o.light.length, o.dark.length, o.labels.length]).toEqual([
        o.id,
        bins,
        bins,
        bins,
      ])
      expect(o.tag ?? o.note).toBeTruthy()
    }
  })

  it('bins free units from full to 20 and more', () => {
    const edges = overlay('free').edges
    expect([0, 1, 4, 5, 19, 20, 40].map((v) => binIndex(v, edges))).toEqual([0, 1, 1, 2, 3, 4, 4])
  })

  it('bins alarm counts, none apart from one', () => {
    const edges = overlay('alarms').edges
    expect([0, 1, 2, 3, 4, 9].map((v) => binIndex(v, edges))).toEqual([0, 1, 2, 2, 3, 3])
  })

  it('puts an even feed split in the grey middle', () => {
    const feeds = overlay('feeds')
    expect([0, 34, 40, 50, 54.9, 60, 66, 100].map((v) => binIndex(v, feeds.edges))).toEqual([
      0, 0, 1, 2, 2, 3, 4, 4,
    ])
    expect(scaleColor(feeds, 50, false)).toBe('#e6e5e1')
    expect(scaleColor(feeds, 50, true)).toBe('#3a3f45')
    expect(scaleColor(feeds, null, false)).toBeNull()
  })

  it("names the room's own feeds in the balance legend", () => {
    expect(feedBalanceLabels('1', '2')).toEqual([
      '2 65 % and above',
      '2 55 – 65 %',
      'balanced, 45 – 55 %',
      '1 55 – 65 %',
      '1 65 % and above',
    ])
  })
})
