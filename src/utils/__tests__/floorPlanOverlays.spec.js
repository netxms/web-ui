// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  OVERLAY_IDS,
  SCALE_OVERLAYS,
  binIndex,
  feedBalanceLabels,
  labelColorOn,
  mixColors,
  scaleColor,
  scaleLook,
  statusLook,
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

describe('rack looks', () => {
  // Shaped as STATUS_PALETTE.light in objectUtils: normal, warning, minor, major, critical, unknown.
  const light = {
    fill: ['#4abf76', '#e9d401', '#f59e0b', '#ea580c', '#b91c1c', '#64748b'],
    bg: ['#e1f9e7', '#f7f1bb', '#fed2a0', '#ffb296', '#ff968a', '#e2e8f0'],
    text: ['#27643e', '#615700', '#684001', '#6e2400', '#720307', '#475569'],
    onFill: ['#1c1917', '#1c1917', '#1c1917', '#1c1917', '#ffffff', '#ffffff'],
  }

  it('draws a normal rack in the soft green with a green band and dark green name', () => {
    expect(statusLook(0, light)).toEqual({
      fill: light.bg[0],
      edge: light.fill[0],
      band: light.fill[0],
      label: light.text[0],
      ring: null,
    })
  })

  it('draws a rack in trouble solid, its band and edge darker than the fill', () => {
    const major = statusLook(3, light)
    expect(major.fill).toBe(light.fill[3])
    expect(major.band).toBe(mixColors(light.fill[3], '#000000', 0.62))
    expect(major.edge).toBe(mixColors(light.fill[3], '#000000', 0.7))
    expect(major.label).toBe(light.onFill[3])
    expect(statusLook(undefined, light).fill).toBe(light.fill[5])
  })

  it('shades the band of feed balance only; the other scales keep the grey one', () => {
    const feeds = SCALE_OVERLAYS.find((o) => o.id === 'feeds')
    const inlet = SCALE_OVERLAYS.find((o) => o.id === 'inlet')
    const leaning = scaleLook(feeds, 70, false, '#ea580c')
    expect(leaning.fill).toBe('#c07c9f')
    expect(leaning.band).toBe(mixColors('#c07c9f', '#000000', 0.62))
    expect(leaning.ring).toBe('#ea580c')
    const hot = scaleLook(inlet, 31, false)
    expect([hot.edge, hot.band, hot.label]).toEqual([null, null, '#ffffff'])
    expect(scaleLook(inlet, null, false)).toEqual({
      fill: null,
      edge: null,
      band: null,
      label: null,
      ring: null,
    })
  })

  it('picks dark text on light fills and white on dark ones', () => {
    expect(['#e6e5e1', '#e9d401', '#104281', '#482a89'].map(labelColorOn)).toEqual([
      '#1c1917',
      '#1c1917',
      '#ffffff',
      '#ffffff',
    ])
  })

  it('mixes colors channel by channel', () => {
    expect(mixColors('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixColors('#ff0000', '#0000ff', 1)).toBe('#ff0000')
  })
})
