// Text measurement is stubbed with a fixed per-character width so box sizes are deterministic.
import { describe, it, expect } from 'vitest'
import {
  linkLabelBoxes,
  groupLabelBoxes,
  directionArrow,
  LINK_LABEL_ARROW_ROW,
  LINK_LABEL_ARROW_SIZE,
  LINK_LABEL_ARROW_GAP,
  LINK_LABEL_COLUMN_GAP,
  OVERFLOW_TABLE_HEADER,
  OVERFLOW_TABLE_PAD,
  OVERFLOW_TABLE_ROW,
  OVERFLOW_TABLE_TICK_RADIUS,
  overflowTableContent,
} from '@/utils/networkMapLinkLabels'
import { linkLabelFraction } from '@/utils/networkMapUtils'
import { LABEL_PAD_H, LABEL_PAD_V, LABEL_FONT_SIZE } from '@/utils/networkMapNodeVisual'

const CHAR_WIDTH = 6
const measureText = (text) => text.length * CHAR_WIDTH

/** Each line's text, segments joined, for assertions that do not care about layout. */
const texts = (box) => box.lines.map((line) => line.segments.map((s) => s.text).join(' | '))

/** Tip of an arrow: the first point of its head polygon. */
const tipOf = (arrow) => arrow.head.split(' ')[0].split(',').map(Number)

function boxesFor(link, overrides = {}) {
  return linkLabelBoxes({
    link,
    edgeId: 'l-1',
    source: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    sourceId: 'e-1',
    targetId: 'e-2',
    dciValues: new Map(),
    measureText,
    ...overrides,
  })
}

const byId = (boxes, id) => boxes.find((b) => b.id === id)

describe('linkLabelBoxes', () => {
  it('returns nothing for a link with no names, connectors or DCIs', () => {
    expect(boxesFor({})).toEqual([])
  })

  it('gives each named end a pill, unplaced, riding the drawn line', () => {
    const boxes = boxesFor({ connectorName1: 'eth0', connectorName2: 'eth1' })
    const e1 = byId(boxes, 'l-1:e1')
    const e2 = byId(boxes, 'l-1:e2')
    expect(e1).toMatchObject({ kind: 'end', end: 1, leader: null })
    expect(e2).toMatchObject({ kind: 'end', end: 2 })
    expect(e1.track).toEqual({ x1: 0, y1: 0, x2: 200, y2: 0 })
    expect(texts(e1)).toEqual(['eth0'])
    expect(texts(e2)).toEqual(['eth1'])
  })

  it('prefers the render-only connectorLabel over the editable connectorName', () => {
    const boxes = boxesFor({ connectorName1: '', connectorLabel1: 'Ethernet1/0/1' })
    expect(texts(byId(boxes, 'l-1:e1'))).toEqual(['Ethernet1/0/1'])
  })

  it('skips an end with neither a name nor values', () => {
    const boxes = boxesFor({ connectorName1: 'eth0' })
    expect(boxes.map((b) => b.id)).toEqual(['l-1:e1'])
  })

  it('stacks the link name, semi-bold, above its CENTER values in one card', () => {
    const link = {
      label: 'Uplink',
      labelPosition: 20,
      dciList: [
        { nodeId: 7, dciId: 1, location: 'CENTER', formatString: 'RX: %s' },
        { nodeId: 7, dciId: 2, location: 'CENTER', formatString: 'TX: %s' },
      ],
    }
    const dciValues = new Map([
      ['7:1', { value: '10' }],
      ['7:2', { value: '20' }],
    ])
    const card = byId(boxesFor(link, { dciValues }), 'l-1:c')
    expect(card).toMatchObject({ kind: 'card', homeT: linkLabelFraction('CENTER', 20) })
    expect(texts(card)[0]).toBe('Uplink')
    expect(card.lines[0].segments[0].weight).toBe(600)
    expect(card.lines).toHaveLength(3)
  })

  it('leaves a name on its own at regular weight', () => {
    const card = byId(boxesFor({ label: 'Uplink' }), 'l-1:c')
    expect(card.lines[0].segments[0].weight).toBeUndefined()
  })

  it("folds each end's OBJECT values into its pill, under the port name", () => {
    const link = {
      connectorName1: 'eth0',
      dciList: [
        { nodeId: 7, dciId: 1, location: 'OBJECT1' },
        { nodeId: 7, dciId: 2, location: 'OBJECT2' },
      ],
    }
    const dciValues = new Map([
      ['7:1', { value: '10' }],
      ['7:2', { value: '20' }],
    ])
    const boxes = boxesFor(link, { dciValues })
    expect(boxes.map((b) => b.id)).toEqual(['l-1:e1', 'l-1:e2'])
    const e1 = byId(boxes, 'l-1:e1')
    expect(texts(e1)).toEqual(['eth0', '10'])
    expect(e1.lines[0].segments[0].weight).toBe(600)
    // No port name at end 2: the values alone.
    expect(texts(byId(boxes, 'l-1:e2'))).toEqual(['20'])
  })

  it('falls back to the demo dciData value when the link has no dciList', () => {
    const boxes = boxesFor({ dciData: { value: '1.2 Gbps' } })
    expect(texts(byId(boxes, 'l-1:c'))).toEqual(['1.2 Gbps'])
  })

  it('sizes each box from its widest line plus padding', () => {
    const card = byId(boxesFor({ label: 'A longer label' }), 'l-1:c')
    expect(card.width).toBe('A longer label'.length * CHAR_WIDTH + LABEL_PAD_H * 2)
    expect(card.height).toBe(LABEL_FONT_SIZE + LABEL_PAD_V * 2)
  })

  it('tags every box with the edge and nodes that own it (for label promotion)', () => {
    const boxes = boxesFor({ label: 'Uplink', connectorName1: 'eth0' })
    for (const box of boxes) {
      expect(box).toMatchObject({ edgeId: 'l-1', sourceId: 'e-1', targetId: 'e-2' })
    }
  })

  it('rides the offset line it is given, for a fanned-out link', () => {
    const boxes = boxesFor(
      { connectorName1: 'eth0' },
      { source: { x: 0, y: 6 }, target: { x: 200, y: 6 } },
    )
    expect(boxes[0].track).toEqual({ x1: 0, y1: 6, x2: 200, y2: 6 })
  })

  const trafficLink = {
    dciList: [
      { nodeId: 7, dciId: 1, direction: 'FORWARD' },
      { nodeId: 7, dciId: 2, direction: 'REVERSE' },
    ],
  }
  const trafficValues = new Map([
    ['7:1', { value: '10' }],
    ['7:2', { value: '20' }],
  ])
  const trafficCard = (overrides = {}) =>
    byId(boxesFor(trafficLink, { dciValues: trafficValues, ...overrides }), 'l-1:c')

  it('puts an arrow before a directed value and the text after it', () => {
    const [forward] = trafficCard().lines[0].segments
    expect(forward.direction).toBe('FORWARD')
    expect(forward.arrow).not.toBeNull()
    expect(forward.x).toBe(LABEL_PAD_H + LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP)
  })

  it('points FORWARD from element 1 to element 2 and REVERSE back', () => {
    // Source at x=0, target at x=200: forward points right.
    const card = trafficCard()
    const forward = card.lines[0].segments[0].arrow
    const reverse = card.lines[1].segments[0].arrow
    expect(tipOf(forward)[0]).toBeGreaterThan(forward.shaft.x1)
    expect(tipOf(reverse)[0]).toBeLessThan(reverse.shaft.x1)
  })

  it('follows the edge orientation', () => {
    // Target straight below the source: forward points down.
    const forward = trafficCard({ target: { x: 0, y: 200 } }).lines[0].segments[0].arrow
    expect(tipOf(forward)[1]).toBeGreaterThan(forward.shaft.y1)
    expect(tipOf(forward)[0]).toBeCloseTo(forward.shaft.x1)
  })

  describe('on a link with bend points', () => {
    // Source (0,0) down to a bend at (0,300), then right to the target (200,300):
    // 300 + 200 along the route, so the halfway home (250) is on the first segment.
    const bent = (link, labelPosition = 50) =>
      boxesFor(
        { ...link, labelPosition },
        {
          dciValues: trafficValues,
          target: { x: 200, y: 300 },
          bendPoints: [{ x: 0, y: 300 }],
        },
      )
    const withEnds = { ...trafficLink, connectorName1: 'eth0', connectorName2: 'eth1' }

    it('rides each end pill on its own end segment of the drawn route', () => {
      const boxes = bent(withEnds)
      expect(byId(boxes, 'l-1:e1').track).toEqual({ x1: 0, y1: 0, x2: 0, y2: 300 })
      expect(byId(boxes, 'l-1:e2').track).toEqual({ x1: 0, y1: 300, x2: 200, y2: 300 })
    })

    it('rides the card on the segment its home falls on, measured along the route', () => {
      const middle = byId(bent(trafficLink), 'l-1:c')
      expect(middle.track).toEqual({ x1: 0, y1: 0, x2: 0, y2: 300 })
      expect(middle.homeT).toBeCloseTo(250 / 300)
      // The far end of the CENTER part (7/11 of 500 = 318) is past the bend.
      const late = byId(bent(trafficLink, 100), 'l-1:c')
      expect(late.track).toEqual({ x1: 0, y1: 300, x2: 200, y2: 300 })
      expect(late.homeT).toBeCloseTo((500 * (7 / 11) - 300) / 200)
    })

    it('points the arrows along the segment each box rides', () => {
      // First segment runs down, last runs right.
      const down = bent(trafficLink).find((b) => b.id === 'l-1:c').lines[0].segments[0].arrow
      expect(tipOf(down)[1]).toBeGreaterThan(down.shaft.y1)
      expect(tipOf(down)[0]).toBeCloseTo(down.shaft.x1)
      const right = bent(trafficLink, 100).find((b) => b.id === 'l-1:c').lines[0].segments[0].arrow
      expect(tipOf(right)[0]).toBeGreaterThan(right.shaft.x1)
      expect(tipOf(right)[1]).toBeCloseTo(right.shaft.y1)
    })
  })

  it('reserves the arrow space but draws none on a zero-length link', () => {
    const card = trafficCard({ source: { x: 50, y: 50 }, target: { x: 50, y: 50 } })
    const [forward] = card.lines[0].segments
    expect(forward.arrow).toBeNull()
    expect(forward.x).toBe(LABEL_PAD_H + LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP)
    expect(card.width).toBe(
      LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP + 2 * CHAR_WIDTH + LABEL_PAD_H * 2,
    )
  })

  it('gives boxes with arrows taller rows and leaves plain boxes as they were', () => {
    const card = trafficCard()
    expect(card.height).toBe(2 * LINK_LABEL_ARROW_ROW + LABEL_PAD_V * 2)
    expect(card.lines[1].textY).toBe(
      LABEL_PAD_V + LINK_LABEL_ARROW_ROW + (LINK_LABEL_ARROW_ROW - LABEL_FONT_SIZE) / 2,
    )
    const plain = boxesFor({ connectorName1: 'eth0' })[0]
    expect(plain.height).toBe(LABEL_FONT_SIZE + LABEL_PAD_V * 2)
    expect(plain.lines[0].textY).toBe(LABEL_PAD_V)
  })
})

describe('groupLabelBoxes', () => {
  // Three parallel links between e-1 and e-2; the middle one is stored e-2 -> e-1.
  const members = [
    {
      id: 'l-0',
      from: 'e-1',
      to: 'e-2',
      connectorLabel1: 'gi1',
      connectorLabel2: 'ether1',
      dciList: [
        { nodeId: 7, dciId: 1, direction: 'FORWARD' },
        { nodeId: 7, dciId: 2, direction: 'REVERSE' },
      ],
    },
    {
      id: 'l-1',
      from: 'e-2',
      to: 'e-1',
      connectorLabel1: 'ether2',
      connectorLabel2: 'gi2',
      dciList: [
        { nodeId: 8, dciId: 1, direction: 'FORWARD' },
        { nodeId: 8, dciId: 3, location: 'OBJECT2' },
      ],
    },
    { id: 'l-2', from: 'e-1', to: 'e-2', label: 'Backup', connectorLabel2: 'ether3' },
  ]
  const group = { id: 'grp-l-0', kind: 'group', members, from: 'e-1', to: 'e-2', fanOffset: 0 }
  const dciValues = new Map([
    ['7:1', { value: '100' }],
    ['7:2', { value: '2' }],
    ['8:1', { value: '30' }],
    ['8:3', { value: '4' }],
  ])

  const groupBoxes = (overrides = {}) =>
    groupLabelBoxes({
      group,
      edgeId: 'grp-l-0',
      source: { x: 0, y: 0 },
      target: { x: 200, y: 0 },
      sourceId: 'e-1',
      targetId: 'e-2',
      dciValues,
      measureText,
      ...overrides,
    })
  const card = (overrides) => groupBoxes(overrides).find((b) => b.id === 'grp-l-0:g')

  it('heads the card with the member count, semi-bold', () => {
    const [header] = card().lines
    expect(header.segments).toEqual([
      expect.objectContaining({ text: '3 links', direction: 'NONE', weight: 600 }),
    ])
  })

  it('gives members a row, identified by their ports in the group orientation', () => {
    const rows = card().lines.slice(1)
    expect(rows.map((row) => row.segments[0].text)).toEqual([
      'gi1 - ether1',
      // Stored e-2 -> e-1, so its ports read the other way round.
      'gi2 - ether2',
      // A named member goes by its name, even without values.
      'Backup',
    ])
  })

  it('writes <unknown> for a member end without a connector name', () => {
    const lone = {
      ...group,
      members: [{ id: 'l-9', from: 'e-1', to: 'e-2', connectorName2: 'p7' }],
    }
    const [, row] = card({ group: lone }).lines
    expect(row.segments[0].text).toBe('<unknown> - p7')
  })

  it('gives no row to a member with nothing to tell it apart, but still counts it', () => {
    const blank = { id: 'l-8', from: 'e-1', to: 'e-2' }
    const box = card({ group: { ...group, members: [...members, blank, { ...blank, id: 'l-9' }] } })
    expect(texts(box)[0]).toBe('5 links')
    expect(box.lines).toHaveLength(4)
  })

  it("flips an inverted member's directions into the group orientation", () => {
    const [, first, inverted] = card().lines
    const forward = first.segments.find((s) => s.text === '100')
    const reverse = first.segments.find((s) => s.text === '2')
    const flipped = inverted.segments.find((s) => s.text === '30')
    expect(forward.direction).toBe('FORWARD')
    expect(reverse.direction).toBe('REVERSE')
    // Its FORWARD runs e-2 -> e-1, which is the group's REVERSE: same column, same arrow.
    expect(flipped.direction).toBe('REVERSE')
    expect(flipped.x).toBe(reverse.x)
    expect(tipOf(flipped.arrow)[0]).toBeLessThan(flipped.arrow.shaft.x1)
  })

  it('aligns each value column across rows of different widths', () => {
    const [, first, inverted] = card().lines
    // 'gi1 - ether1' and 'gi2 - ether2' are equally wide; make one row wider to prove it.
    const wide = {
      ...group,
      members: [{ ...members[0], connectorLabel1: 'TenGigabitEthernet1' }, members[1]],
    }
    const [, wideFirst, wideSecond] = card({ group: wide }).lines
    const valueX = (row, text) => row.segments.find((s) => s.text === text).x
    expect(valueX(first, '2')).toBe(valueX(inverted, '30'))
    expect(valueX(wideFirst, '2')).toBe(valueX(wideSecond, '30'))
    expect(valueX(wideFirst, '100')).toBeGreaterThan(valueX(first, '100'))
  })

  it('lets columns that are empty on every row take no space', () => {
    const quiet = {
      ...group,
      members: [
        { id: 'l-0', from: 'e-1', to: 'e-2', label: 'Primary uplink' },
        { id: 'l-1', from: 'e-1', to: 'e-2', label: 'Backup' },
      ],
    }
    const box = card({ group: quiet })
    expect(box.width).toBe('Primary uplink'.length * CHAR_WIDTH + LABEL_PAD_H * 2)
    // Plain rows: no arrows anywhere, so the box keeps the short row height.
    expect(box.height).toBe(3 * LABEL_FONT_SIZE + LABEL_PAD_V * 2)
  })

  it('sizes the card from its identity and value columns', () => {
    const arrowed = (text) =>
      LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP + text.length * CHAR_WIDTH
    const identity = 'gi1 - ether1'.length * CHAR_WIDTH
    const forward = arrowed('100')
    const reverse = Math.max(arrowed('2'), arrowed('30'))
    expect(card().width).toBe(
      identity + forward + reverse + 2 * LINK_LABEL_COLUMN_GAP + LABEL_PAD_H * 2,
    )
    expect(card().height).toBe(4 * LINK_LABEL_ARROW_ROW + LABEL_PAD_V * 2)
  })

  it('gives an end a pill only for values: the card already names every port', () => {
    const noValues = { ...group, members: members.map((m) => ({ ...m, dciList: [] })) }
    expect(groupBoxes({ group: noValues }).map((b) => b.id)).toEqual(['grp-l-0:g'])
  })

  it("puts a member's end values in the pill at the group's matching end, port in parentheses", () => {
    // l-1 is inverted: its own OBJECT2 end is the group's element 1, so OBJECT1.
    const boxes = groupBoxes()
    expect(boxes.map((b) => b.id)).toEqual(['grp-l-0:g', 'grp-l-0:e1'])
    expect(boxes[1]).toMatchObject({ kind: 'end', end: 1 })
    expect(texts(boxes[1])).toEqual(['4 | (gi2)'])
  })

  it('homes the card at the middle of the group line', () => {
    expect(card()).toMatchObject({ kind: 'card', homeT: 0.5 })
    expect(card().track).toEqual({ x1: 0, y1: 0, x2: 200, y2: 0 })
  })

  it('tags every box with the group edge and its nodes', () => {
    for (const box of groupBoxes()) {
      expect(box).toMatchObject({ edgeId: 'grp-l-0', sourceId: 'e-1', targetId: 'e-2' })
    }
  })
})

describe('directionArrow', () => {
  it('centres a shaft and a notched head on the point, tip first', () => {
    const arrow = directionArrow(10, 7, 1, 0, 10)
    expect(arrow.shaft.x1).toBe(5)
    expect(arrow.shaft.y1).toBe(7)
    expect(tipOf(arrow)).toEqual([15, 7])
    // Head corners sit either side of the shaft line.
    const [, left, , right] = arrow.head.split(' ').map((p) => p.split(',').map(Number))
    expect(left[1]).toBeGreaterThan(7)
    expect(right[1]).toBeLessThan(7)
  })
})

describe('overflowTableContent', () => {
  // A hub 'h' with four drawn lines: east, north (stored toward the hub), west (a
  // merged group of two) and south.
  const dciValues = new Map([
    ['1:1', { value: '100' }],
    ['1:2', { value: '2' }],
    ['2:1', { value: '30' }],
    ['2:2', { value: '4' }],
    ['3:1', { value: 'up' }],
    ['3:2', { value: '5' }],
  ])
  const east = {
    edgeId: 'l-a',
    peerName: 'core',
    color: '#111111',
    bearing: { x: 1, y: 0 },
    drawn: {
      kind: 'link',
      link: {
        id: 'l-a',
        from: 'h',
        to: 'n1',
        connectorLabel1: 'ge-0/0/1',
        dciList: [
          { nodeId: 1, dciId: 1, direction: 'FORWARD' },
          { nodeId: 1, dciId: 2, direction: 'REVERSE' },
        ],
      },
    },
  }
  const north = {
    edgeId: 'l-b',
    peerName: 'edge',
    color: '#222222',
    bearing: { x: 0, y: -1 },
    drawn: {
      kind: 'link',
      link: {
        id: 'l-b',
        from: 'n2',
        to: 'h',
        connectorName2: 'eth1',
        // FORWARD runs from n2 to the hub: traffic into the hub.
        dciList: [
          { nodeId: 2, dciId: 1, direction: 'FORWARD' },
          { nodeId: 2, dciId: 2, direction: 'REVERSE' },
        ],
      },
    },
  }
  const west = {
    edgeId: 'grp-m1',
    peerName: 'dist',
    color: '#333333',
    bearing: { x: -1, y: 0 },
    drawn: {
      kind: 'group',
      members: [
        { id: 'm1', from: 'h', to: 'n3', connectorName1: 'p1' },
        { id: 'm2', from: 'n3', to: 'h', connectorName2: 'p2', label: 'Backup' },
      ],
    },
  }
  const south = {
    edgeId: 'l-d',
    peerName: 'access',
    color: '#444444',
    bearing: { x: 0, y: 1 },
    drawn: {
      kind: 'link',
      link: {
        id: 'l-d',
        from: 'h',
        to: 'n4',
        dciList: [
          { nodeId: 3, dciId: 1 },
          { nodeId: 3, dciId: 2, location: 'OBJECT1' },
          { nodeId: 3, dciId: 2, location: 'OBJECT2' },
        ],
      },
    },
  }

  const table = (lines = [east, north, west, south]) =>
    overflowTableContent({ nodeId: 'h', title: 'hub', lines, dciValues, measureText })
  const row = (key) => table().rows.find((r) => r.key === key)
  const rowTexts = (r) => r.segments.map((s) => s.text)
  const segment = (r, text) => r.segments.find((s) => s.text === text)
  /** Direction an arrow points: tip minus the tail of its shaft. */
  const pointing = (arrow) => {
    const [tx, ty] = tipOf(arrow)
    return [Math.sign(Math.round(tx - arrow.shaft.x1)), Math.sign(Math.round(ty - arrow.shaft.y1))]
  }

  it('heads the table with the node name and its link count', () => {
    const t = table()
    expect(t).toMatchObject({ id: 'table:h', nodeId: 'h', leader: null })
    expect(t.title).toMatchObject({ text: 'hub', x: OVERFLOW_TABLE_PAD, weight: 700 })
    expect(t.count.text).toBe('5 links')
    expect(t.count.x + measureText('5 links')).toBeCloseTo(t.width - OVERFLOW_TABLE_PAD)
  })

  it('lists rows clockwise from 12 o clock, a group one row per member', () => {
    expect(table().rows.map((r) => r.key)).toEqual([
      'l-b:l-b',
      'l-a:l-a',
      'l-d:l-d',
      'grp-m1:m1',
      'grp-m1:m2',
    ])
  })

  it('gives each row a tick at its bearing, in the line colour', () => {
    const { tick } = row('l-a:l-a')
    expect(tick.x2 - tick.cx).toBe(OVERFLOW_TABLE_TICK_RADIUS)
    expect(tick.y2).toBe(tick.cy)
    expect(tick.color).toBe('#111111')
    const up = row('l-b:l-b').tick
    expect(up.cy - up.y2).toBe(OVERFLOW_TABLE_TICK_RADIUS)
  })

  it('reads peer, port (muted), out along the bearing and in against it', () => {
    const r = row('l-a:l-a')
    expect(rowTexts(r)).toEqual(['core', 'ge-0/0/1', '100', '2'])
    expect(segment(r, 'ge-0/0/1').muted).toBe(true)
    expect(segment(r, 'core').muted).toBeUndefined()
    expect(pointing(segment(r, '100').arrow)).toEqual([1, 0])
    expect(pointing(segment(r, '2').arrow)).toEqual([-1, 0])
  })

  it("turns a link stored toward the node to the node's side", () => {
    const r = row('l-b:l-b')
    // Its REVERSE value leaves the hub, its FORWARD value arrives.
    expect(rowTexts(r)).toEqual(['edge', 'eth1', '4', '30'])
    expect(pointing(segment(r, '4').arrow)).toEqual([0, -1])
    expect(pointing(segment(r, '30').arrow)).toEqual([0, 1])
  })

  it('lines the values of every row up in columns', () => {
    const t = table()
    const outX = segment(t.rows[0], '4').x
    expect(segment(t.rows[1], '100').x).toBe(outX)
  })

  it("puts the link name, undirected values and this end's values last, muted", () => {
    const r = row('l-d:l-d')
    expect(rowTexts(r)).toEqual(['access', 'up', '5'])
    expect(r.segments.slice(1).every((s) => s.muted)).toBe(true)
    const member = row('grp-m1:m2')
    expect(rowTexts(member)).toEqual(['dist', 'p2', 'Backup'])
  })

  it('takes no space for a column no row uses', () => {
    const bare = {
      ...east,
      drawn: { kind: 'link', link: { id: 'l-x', from: 'h', to: 'n9' } },
    }
    const t = table([bare])
    const peerX = OVERFLOW_TABLE_PAD + 16 + LINK_LABEL_COLUMN_GAP
    expect(segment(t.rows[0], 'core').x).toBe(peerX)
    expect(t.width).toBe(
      Math.ceil(
        Math.max(
          peerX + measureText('core') + OVERFLOW_TABLE_PAD,
          OVERFLOW_TABLE_PAD * 2 + measureText('hub') + 16 + measureText('1 links'),
        ),
      ),
    )
    expect(t.height).toBe(OVERFLOW_TABLE_HEADER + OVERFLOW_TABLE_ROW + 4)
  })

  it('cuts long port names', () => {
    const long = {
      ...east,
      drawn: {
        kind: 'link',
        link: { id: 'l-y', from: 'h', to: 'n9', connectorName1: 'x'.repeat(40) },
      },
    }
    expect(rowTexts(table([long]).rows[0])[1]).toBe(`${'x'.repeat(24)}...`)
  })
})
