// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  LABEL_LAYOUT_ITERATIONS,
  layoutLinkLabels,
  overlappingPairs,
} from '@/utils/networkMapLabelLayout'

const NODE_R = 26
const PLATE = { w: 60, h: 15, gap: 4 }

/** Icon-mode obstacles of a node: the circle's box and the name plate under it. */
function iconNode(x, y) {
  return [
    { x, y, w: NODE_R * 2, h: NODE_R * 2 },
    { x, y: y + NODE_R + PLATE.gap + PLATE.h / 2, w: PLATE.w, h: PLATE.h },
  ]
}

function label(id, { kind = 'card', end, w = 60, h = 15, track, from = 'a', to = 'b', homeT }) {
  return { id, kind, end, width: w, height: h, homeT, sourceId: from, targetId: to, track }
}

const track = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 })

/** Box shape the overlap helpers take. */
const asBox = (b) => ({ x: b.x, y: b.y, w: b.width ?? b.w, h: b.height ?? b.h })

function overlaps(a, b) {
  const p = asBox(a)
  const q = asBox(b)
  return Math.abs(p.x - q.x) * 2 < p.w + q.w - 1 && Math.abs(p.y - q.y) * 2 < p.h + q.h - 1
}

function labelOverlaps(boxes) {
  const found = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) found.push([boxes[i].id, boxes[j].id])
    }
  }
  return found
}

function obstacleOverlaps(boxes, nodeBoxes) {
  const found = []
  for (const b of boxes) {
    for (const [node, list] of nodeBoxes) {
      if (list.some((o) => overlaps(b, o))) found.push([b.id, node])
    }
  }
  return found
}

describe('layoutLinkLabels', () => {
  it('leaves a lone card at home, on its line', () => {
    const card = label('l:c', { track: track(0, 0, 400, 0), homeT: 0.5 })
    layoutLinkLabels([card])
    expect(card).toMatchObject({ x: 200, y: 0, leader: null })
  })

  it("homes a card where the link's label position puts it", () => {
    const card = label('l:c', { track: track(0, 0, 440, 0), homeT: 5 / 11 })
    layoutLinkLabels([card])
    expect(card.x).toBeCloseTo(200)
  })

  it('homes end pills at their own end, clear of the node', () => {
    const nodeBoxes = new Map([
      ['a', iconNode(0, 0)],
      ['b', iconNode(400, 0)],
    ])
    const e1 = label('l:e1', { kind: 'end', end: 1, w: 40, track: track(0, 0, 400, 0) })
    const e2 = label('l:e2', { kind: 'end', end: 2, w: 40, track: track(0, 0, 400, 0) })
    layoutLinkLabels([e1, e2], { nodeBoxes })
    expect(e1.y).toBe(0)
    expect(e1.x - 20).toBeGreaterThanOrEqual(NODE_R + 3)
    expect(e1.x - 20).toBeLessThan(NODE_R + 8)
    expect(e2.x + 20).toBeLessThanOrEqual(400 - NODE_R - 3)
    expect(obstacleOverlaps([e1, e2], nodeBoxes)).toEqual([])
  })

  it("slides a pill past its node's name plate when the link leaves downward", () => {
    const nodeBoxes = new Map([['a', iconNode(0, 0)]])
    const pill = label('l:e1', { kind: 'end', end: 1, w: 40, track: track(0, 0, 0, 300) })
    layoutLinkLabels([pill], { nodeBoxes })
    const plateBottom = NODE_R + PLATE.gap + PLATE.h
    expect(pill.x).toBe(0)
    expect(pill.y - pill.height / 2).toBeGreaterThanOrEqual(plateBottom + 3)
    expect(pill.y - pill.height / 2).toBeLessThan(plateBottom + 8)
    expect(pill.leader).toBeNull()
  })

  it('separates pills on parallel tracks instead of sliding them together forever', () => {
    // Two fanned-out links 12px apart: their pills start on top of each other.
    const nodeBoxes = new Map([
      ['a', iconNode(0, 0)],
      ['b', iconNode(300, 0)],
    ])
    const upper = label('l0:e1', { kind: 'end', end: 1, w: 40, track: track(0, -6, 300, -6) })
    const lower = label('l1:e1', { kind: 'end', end: 1, w: 40, track: track(0, 6, 300, 6) })
    layoutLinkLabels([upper, lower], { nodeBoxes })
    expect(labelOverlaps([upper, lower])).toEqual([])
    expect(obstacleOverlaps([upper, lower], nodeBoxes)).toEqual([])
  })

  // A hub with six links in a 50-degree fan, symmetric about the vertical: pills
  // crowd the hub, cards the middle, and the two middle pills ride mirror-image
  // tracks (with an even split they stay mirror images and never separate).
  function crowdedFan() {
    const nodeBoxes = new Map([['hub', iconNode(0, 0)]])
    const boxes = []
    for (let i = 0; i < 6; i++) {
      const angle = ((65 + i * 10) * Math.PI) / 180
      const x = Math.round(Math.cos(angle) * 320)
      const y = Math.round(Math.sin(angle) * 320)
      const peer = `n${i}`
      nodeBoxes.set(peer, iconNode(x, y))
      const t = track(0, 0, x, y)
      const common = { track: t, from: 'hub', to: peer }
      boxes.push(label(`l${i}:e1`, { ...common, kind: 'end', end: 1, w: 48 }))
      boxes.push(label(`l${i}:e2`, { ...common, kind: 'end', end: 2, w: 36 }))
      boxes.push(label(`l${i}:c`, { ...common, w: 64, h: 32, homeT: 0.5 }))
    }
    return { nodeBoxes, boxes }
  }

  it('clears every overlap in a small crowded, symmetric fan', () => {
    const { nodeBoxes, boxes } = crowdedFan()
    layoutLinkLabels(boxes, { nodeBoxes })
    expect(labelOverlaps(boxes)).toEqual([])
    expect(obstacleOverlaps(boxes, nodeBoxes)).toEqual([])
  })

  it('keeps a settled layout where it is on a warm start', () => {
    const { nodeBoxes, boxes } = crowdedFan()
    const state = new Map()
    layoutLinkLabels(boxes, { nodeBoxes, state })
    const settled = boxes.map((b) => [b.x, b.y])
    layoutLinkLabels(boxes, { nodeBoxes, state, pass: 'warm' })
    boxes.forEach((b, i) => {
      expect(Math.hypot(b.x - settled[i][0], b.y - settled[i][1])).toBeLessThan(0.5)
    })
  })

  it('draws a leader only once a box has left its line', () => {
    // An obstacle over the whole track leaves the card nowhere to slide.
    const card = label('l:c', { track: track(0, 0, 400, 0), homeT: 0.5 })
    const wall = { x: 200, y: 0, w: 420, h: 20 }
    layoutLinkLabels([card], { obstacles: [wall] })
    expect(overlaps(card, wall)).toBe(false)
    expect(card.leader).not.toBeNull()
    // From the link (y = 0) to the nearest edge of the box.
    expect(card.leader.y1).toBe(0)
    expect(card.leader.x1).toBeCloseTo(card.x)
    expect(Math.abs(card.leader.y2 - card.y)).toBeCloseTo(card.height / 2)
  })

  it('keeps a pill its distance from its node when the link stretches', () => {
    const nodeBoxes = new Map([['a', iconNode(0, 0)]])
    const state = new Map()
    const pill = label('l:e1', { kind: 'end', end: 1, w: 40, track: track(0, 0, 300, 0) })
    layoutLinkLabels([pill], { nodeBoxes, state })
    const before = pill.x
    pill.track = track(0, 0, 600, 0)
    layoutLinkLabels([pill], { nodeBoxes, state })
    expect(pill.x).toBeCloseTo(before)
  })

  it('picks the iteration count from what it has placed before', () => {
    const state = new Map()
    const a = label('a:c', { track: track(0, 0, 400, 0) })
    const b = label('b:c', { track: track(0, 100, 400, 100) })
    expect(layoutLinkLabels([a], { state }).iterations).toBe(LABEL_LAYOUT_ITERATIONS.cold)
    expect(layoutLinkLabels([a], { state }).iterations).toBe(LABEL_LAYOUT_ITERATIONS.warm)
    expect(layoutLinkLabels([a], { state, pass: 'settle' }).iterations).toBe(
      LABEL_LAYOUT_ITERATIONS.settle,
    )
    // A label seen for the first time needs more than a warm frame to settle.
    expect(layoutLinkLabels([a, b], { state }).iterations).toBe(LABEL_LAYOUT_ITERATIONS.settle)
    expect(layoutLinkLabels([], { state }).iterations).toBe(0)
  })

  it('survives a collapsed link', () => {
    const card = label('l:c', { track: track(50, 50, 50, 50) })
    layoutLinkLabels([card])
    expect(card).toMatchObject({ x: 50, y: 50, leader: null })
  })
})

describe('overlappingPairs', () => {
  it('finds exactly the pairs an all-pairs check finds', () => {
    let seed = 11
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const boxes = Array.from({ length: 300 }, () => ({
      x: random() * 1200,
      y: random() * 900,
      w: 10 + random() * 140,
      h: 10 + random() * 40,
    }))
    const margin = 3
    const expected = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (
          Math.abs(a.x - b.x) * 2 < a.w + b.w + 2 * margin &&
          Math.abs(a.y - b.y) * 2 < a.h + b.h + 2 * margin
        ) {
          expected.push(`${i}-${j}`)
        }
      }
    }
    const pairs = overlappingPairs(boxes, margin)
    const found = []
    for (let k = 0; k < pairs.length; k += 2) found.push(`${pairs[k]}-${pairs[k + 1]}`)
    expect(found.sort()).toEqual(expected.sort())
    expect(expected.length).toBeGreaterThan(20)
  })
})
