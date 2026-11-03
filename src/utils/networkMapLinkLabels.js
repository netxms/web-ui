/**
 * Boxed link-label content. Cytoscape offers only three label slots per edge and a link needs up
 * to three multi-line boxes, so labels are drawn in an SVG overlay.
 * A link gets an end pill per end (port name, then OBJECT1 / OBJECT2 values) and a card (name,
 * then CENTER values); a merged group gets a card of its own. This builds and measures the
 * boxes; networkMapLabelLayout places them.
 */

import { linkDciLines, linkLabelFraction } from './networkMapUtils'
import { isInvertedMember } from './networkMapParallelLinks'
import { LABEL_PAD_H, LABEL_PAD_V, LABEL_FONT_SIZE } from './networkMapNodeVisual'

/** An arrow needs more than a bare text row. */
export const LINK_LABEL_ARROW_ROW = 14

export const LINK_LABEL_ARROW_SIZE = 10
export const LINK_LABEL_ARROW_GAP = 3

/** Legacy LinkLabelLine.SEGMENT_SEPARATOR. */
const SEGMENT_GAP = 8

export const LINK_LABEL_COLUMN_GAP = 10

/** Default segment weight, and a heading's (a group card's "N links", a name with values). */
const NORMAL_WEIGHT = 400
const HEADING_WEIGHT = 600

/** Legacy memberIdentity. */
const UNKNOWN_PORT = '<unknown>'

const round2 = (v) => Math.round(v * 100) / 100

/**
 * Port of legacy DirectionArrow: a shaft and a notched head, centred on (cx, cy) and pointing
 * along the unit vector (ux, uy).
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} ux
 * @param {number} uy
 * @param {number} [length]
 * @returns {{ shaft: { x1: number, y1: number, x2: number, y2: number }, head: string }}
 *   head is an SVG polygon `points` string: tip, corner, notch, corner
 */
export function directionArrow(cx, cy, ux, uy, length = LINK_LABEL_ARROW_SIZE) {
  const tipX = cx + (ux * length) / 2
  const tipY = cy + (uy * length) / 2
  const headLength = length * 0.62
  const headHalfWidth = length * 0.36
  const cornerX = tipX - ux * headLength
  const cornerY = tipY - uy * headLength
  const notchX = cornerX + ux * headLength * 0.4
  const notchY = cornerY + uy * headLength * 0.4
  const head = [
    [tipX, tipY],
    [cornerX - uy * headHalfWidth, cornerY + ux * headHalfWidth],
    [notchX, notchY],
    [cornerX + uy * headHalfWidth, cornerY - ux * headHalfWidth],
  ]
  return {
    shaft: {
      x1: round2(cx - (ux * length) / 2),
      y1: round2(cy - (uy * length) / 2),
      x2: round2(notchX),
      y2: round2(notchY),
    },
    head: head.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' '),
  }
}

/** Null when the points (nearly) coincide. */
function unitVector(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  return len < 0.001 ? null : { x: dx / len, y: dy / len }
}

const plainLine = (text) => [{ text, direction: 'NONE' }]

/** measureText takes (text, fontSize, fontWeight). */
const textWidth = (segment, measureText) =>
  measureText(segment.text, LABEL_FONT_SIZE, segment.weight ?? NORMAL_WEIGHT)

function segmentsWidth(segments, measureText) {
  let width = 0
  segments.forEach((segment, k) => {
    if (k) width += SEGMENT_GAP
    if (segment.direction !== 'NONE') width += LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP
    width += textWidth(segment, measureText)
  })
  return width
}

/**
 * A directed segment gets an arrow before its text, parallel to the link (legacy
 * ConnectorLabel.paintLines). Box-local coordinates.
 * @returns {object[]} placed segments: { text, direction, x, arrow, weight? }
 */
function placeSegments(segments, x, rowTop, rowHeight, measureText, linkDirection) {
  return segments.map((segment, k) => {
    if (k) x += SEGMENT_GAP
    let arrow = null
    if (segment.direction !== 'NONE') {
      // Space is reserved even with no direction, so a box keeps its size when the link collapses.
      if (linkDirection) {
        const sign = segment.direction === 'FORWARD' ? 1 : -1
        arrow = directionArrow(
          x + LINK_LABEL_ARROW_SIZE / 2,
          rowTop + rowHeight / 2,
          linkDirection.x * sign,
          linkDirection.y * sign,
        )
      }
      x += LINK_LABEL_ARROW_SIZE + LINK_LABEL_ARROW_GAP
    }
    const placed = { text: segment.text, direction: segment.direction, x, arrow }
    if (segment.weight) placed.weight = segment.weight
    x += textWidth(segment, measureText)
    return placed
  })
}

const rowHeightFor = (segments) =>
  segments.some((s) => s.direction !== 'NONE') ? LINK_LABEL_ARROW_ROW : LABEL_FONT_SIZE

const textTop = (rowTop, rowHeight) => rowTop + (rowHeight - LABEL_FONT_SIZE) / 2

/**
 * Lines are lists of `{ text, direction, weight? }` segments, in box-local coordinates (origin
 * top-left), so moving a box changes only x / y (its centre, set by the layout).
 *
 * @param {string} id
 * @param {{ text: string, direction: string, weight?: number }[][]} lines
 * @param {object} placement - owning edge and nodes, `track`, `kind` and `end` or `homeT`
 * @param {(text: string, fontSize?: number, fontWeight?: number) => number} measureText
 * @param {{ x: number, y: number } | null} linkDirection - unit vector, element 1 to 2
 * @returns {object}
 */
function makeLabelBox(id, lines, placement, measureText, linkDirection) {
  const rowHeight = rowHeightFor(lines.flat())
  let widest = 0
  const laidOut = lines.map((segments, i) => {
    const rowTop = LABEL_PAD_V + i * rowHeight
    widest = Math.max(widest, segmentsWidth(segments, measureText))
    return {
      textY: textTop(rowTop, rowHeight),
      segments: placeSegments(segments, LABEL_PAD_H, rowTop, rowHeight, measureText, linkDirection),
    }
  })
  return {
    id,
    lines: laidOut,
    x: 0,
    y: 0,
    width: widest + LABEL_PAD_H * 2,
    height: lines.length * rowHeight + LABEL_PAD_V * 2,
    leader: null,
    ...placement,
  }
}

/**
 * A header line over rows of aligned columns, so values of all rows line up (legacy memberLine
 * orders by direction for the same reason). A column empty on every row takes no space.
 *
 * @param {string} id
 * @param {object[]} header - segments
 * @param {object[][][]} rows - rows of cells, each cell a list of segments
 * @param {object} placement
 * @param {Function} measureText
 * @param {{ x: number, y: number } | null} linkDirection
 * @returns {object}
 */
function makeColumnBox(id, header, rows, placement, measureText, linkDirection) {
  const rowHeight = rowHeightFor([...header, ...rows.flat(2)])
  const columnWidths = (rows[0] ?? []).map((_, c) =>
    Math.max(0, ...rows.map((cells) => segmentsWidth(cells[c], measureText))),
  )
  const starts = []
  let x = LABEL_PAD_H
  for (const width of columnWidths) {
    starts.push(x)
    if (width) x += width + LINK_LABEL_COLUMN_GAP
  }
  const rowsWidth = x - LABEL_PAD_H - (x > LABEL_PAD_H ? LINK_LABEL_COLUMN_GAP : 0)

  const lines = [
    {
      textY: textTop(LABEL_PAD_V, rowHeight),
      segments: placeSegments(
        header,
        LABEL_PAD_H,
        LABEL_PAD_V,
        rowHeight,
        measureText,
        linkDirection,
      ),
    },
  ]
  rows.forEach((cells, i) => {
    const rowTop = LABEL_PAD_V + (i + 1) * rowHeight
    lines.push({
      textY: textTop(rowTop, rowHeight),
      segments: cells.flatMap((cell, c) =>
        placeSegments(cell, starts[c], rowTop, rowHeight, measureText, linkDirection),
      ),
    })
  })
  return {
    id,
    lines,
    x: 0,
    y: 0,
    width: Math.max(rowsWidth, segmentsWidth(header, measureText)) + LABEL_PAD_H * 2,
    height: lines.length * rowHeight + LABEL_PAD_V * 2,
    leader: null,
    ...placement,
  }
}

/** Semi-bold when values follow it. */
const headingLine = (text, hasValues) => [
  hasValues ? { text, direction: 'NONE', weight: HEADING_WEIGHT } : { text, direction: 'NONE' },
]

function linePlacement(edgeId, sourceId, targetId, source, target) {
  return {
    edgeId,
    sourceId,
    targetId,
    track: { x1: source.x, y1: source.y, x2: target.x, y2: target.y },
  }
}

const segmentTrack = (a, b) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

/**
 * The route segment each label rides, so it stays on the line the user sees: the first for end
 * 1, the last for end 2, and for the card the segment its home falls on, with the home as a
 * fraction of that segment.
 *
 * @param {{ x: number, y: number }} source
 * @param {{ x: number, y: number }} target
 * @param {{ x: number, y: number }[]} bendPoints
 * @param {number} homeT - the card's home as a fraction of the whole route
 * @returns {{ first: object, last: object, card: object, cardHomeT: number }}
 */
export function routeTracks(source, target, bendPoints, homeT) {
  const points = [source, ...bendPoints, target]
  const lengths = []
  let total = 0
  for (let k = 1; k < points.length; k++) {
    const length = Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y)
    lengths.push(length)
    total += length
  }
  let k = 0
  let along = homeT * total
  while (k < lengths.length - 1 && along > lengths[k]) {
    along -= lengths[k]
    k++
  }
  return {
    first: segmentTrack(points[0], points[1]),
    last: segmentTrack(points[points.length - 2], points[points.length - 1]),
    card: segmentTrack(points[k], points[k + 1]),
    cardHomeT: lengths[k] > 0 ? Math.min(1, along / lengths[k]) : homeT,
  }
}

const trackDirection = ({ x1, y1, x2, y2 }) => unitVector({ x: x1, y: y1 }, { x: x2, y: y2 })

/**
 * End pills `<edgeId>:e1` / `:e2` (port name: connector name, else interface name; skipped when
 * the end has nothing) and a card `<edgeId>:c`, homed at legacy's CENTER label position.
 *
 * @param {object} params
 * @param {object} params.link - internal link (from adaptApiNetworkMap)
 * @param {string} params.edgeId
 * @param {{ x: number, y: number }} params.source - the drawn line's source end (fan offset
 *   applied)
 * @param {{ x: number, y: number }} params.target
 * @param {string} params.sourceId
 * @param {string} params.targetId
 * @param {{ x: number, y: number }[]} [params.bendPoints] - as drawn
 * @param {Map<string, object>} params.dciValues - keyed "nodeId:dciId"
 * @param {(text: string, fontSize?: number, fontWeight?: number) => number} params.measureText
 * @returns {object[]}
 */
export function linkLabelBoxes({
  link,
  edgeId,
  source,
  target,
  sourceId,
  targetId,
  bendPoints = [],
  dciValues,
  measureText,
}) {
  const boxes = []
  const placement = linePlacement(edgeId, sourceId, targetId, source, target)
  const route = routeTracks(
    source,
    target,
    bendPoints,
    linkLabelFraction('CENTER', link.labelPosition ?? 50),
  )

  for (const end of [1, 2]) {
    const name =
      end === 1
        ? (link.connectorLabel1 ?? link.connectorName1)
        : (link.connectorLabel2 ?? link.connectorName2)
    const values = linkDciLines(link, end === 1 ? 'OBJECT1' : 'OBJECT2', dciValues)
    if (!name && !values.length) continue
    const lines = name ? [headingLine(name, values.length > 0), ...values] : values
    const track = end === 1 ? route.first : route.last
    boxes.push(
      makeLabelBox(
        `${edgeId}:e${end}`,
        lines,
        { ...placement, track, kind: 'end', end },
        measureText,
        trackDirection(track),
      ),
    )
  }

  const values = linkDciLines(link, 'CENTER', dciValues)
  // Demo maps carry a pre-baked value in dciData instead of a dciList.
  if (!values.length && link.dciData?.value) values.push(plainLine(link.dciData.value))
  const lines = link.label ? [headingLine(link.label, values.length > 0), ...values] : values
  if (lines.length) {
    boxes.push(
      makeLabelBox(
        `${edgeId}:c`,
        lines,
        { ...placement, track: route.card, kind: 'card', homeT: route.cardHomeT },
        measureText,
        trackDirection(route.card),
      ),
    )
  }

  return boxes
}

const flipDirection = (direction) =>
  direction === 'FORWARD' ? 'REVERSE' : direction === 'REVERSE' ? 'FORWARD' : direction

const otherEnd = (location) =>
  location === 'OBJECT1' ? 'OBJECT2' : location === 'OBJECT2' ? 'OBJECT1' : location

/** So every member's arrows line up. */
const DIRECTION_ORDER = ['FORWARD', 'REVERSE', 'NONE']

/**
 * In the group's orientation (legacy memberLocation): an inverted member reads OBJECT1 values from
 * its own OBJECT2 end and flips their directions.
 */
function memberValues(member, location, inverted, dciValues) {
  const own = inverted ? otherEnd(location) : location
  const segments = linkDciLines(member, own, dciValues).flat()
  if (location === 'CENTER' && !segments.length && member.dciData?.value) {
    segments.push({ text: member.dciData.value, direction: 'NONE' })
  }
  return inverted
    ? segments.map((s) => ({ ...s, direction: flipDirection(s.direction) }))
    : segments
}

/** Connector name at a group end (1 or 2), in the group's orientation. */
function memberPort(member, end, inverted) {
  const own = inverted ? 3 - end : end
  return own === 1
    ? member.connectorLabel1 || member.connectorName1
    : member.connectorLabel2 || member.connectorName2
}

/**
 * Card `<edgeId>:g` (legacy LinkLabelText.centerLabel): "N links", then a row per member with
 * aligned columns - identity (link name, else its ports), then CENTER values FORWARD, REVERSE
 * and undirected. Members with no name, port or values get no row (the group draws no port names
 * at its ends, so known ports earn a row here, unlike legacy).
 *
 * End pills `<edgeId>:e1` / `:e2` (legacy locationValues): one line per member with values at
 * that end, then its port in parentheses. Arrows follow the group's orientation.
 *
 * @param {object} params
 * @param {object} params.group - a drawn group from buildDrawnLinks()
 * @param {string} params.edgeId
 * @param {{ x: number, y: number }} params.source - element 1 end
 * @param {{ x: number, y: number }} params.target - element 2 end
 * @param {string} params.sourceId
 * @param {string} params.targetId
 * @param {Map<string, object>} params.dciValues - keyed "nodeId:dciId"
 * @param {Function} params.measureText
 * @returns {object[]}
 */
export function groupLabelBoxes({
  group,
  edgeId,
  source,
  target,
  sourceId,
  targetId,
  dciValues,
  measureText,
}) {
  const placement = linePlacement(edgeId, sourceId, targetId, source, target)
  const linkDirection = unitVector(source, target)

  const rows = []
  for (const member of group.members) {
    const inverted = isInvertedMember(group, member)
    const port1 = memberPort(member, 1, inverted)
    const port2 = memberPort(member, 2, inverted)
    const values = memberValues(member, 'CENTER', inverted, dciValues)
    if (!member.label && !port1 && !port2 && !values.length) continue
    const identity = member.label || `${port1 || UNKNOWN_PORT} - ${port2 || UNKNOWN_PORT}`
    rows.push([
      plainLine(identity),
      ...DIRECTION_ORDER.map((direction) => values.filter((s) => s.direction === direction)),
    ])
  }
  const header = [
    { text: `${group.members.length} links`, direction: 'NONE', weight: HEADING_WEIGHT },
  ]
  const boxes = [
    makeColumnBox(
      `${edgeId}:g`,
      header,
      rows,
      { ...placement, kind: 'card', homeT: 0.5 },
      measureText,
      linkDirection,
    ),
  ]

  for (const end of [1, 2]) {
    const location = end === 1 ? 'OBJECT1' : 'OBJECT2'
    const lines = []
    for (const member of group.members) {
      const inverted = isInvertedMember(group, member)
      const values = memberValues(member, location, inverted, dciValues)
      if (!values.length) continue
      const line = DIRECTION_ORDER.flatMap((d) => values.filter((s) => s.direction === d))
      const port = memberPort(member, end, inverted)
      if (port) line.push({ text: `(${port})`, direction: 'NONE' })
      lines.push(line)
    }
    if (!lines.length) continue
    boxes.push(
      makeLabelBox(
        `${edgeId}:e${end}`,
        lines,
        { ...placement, kind: 'end', end },
        measureText,
        linkDirection,
      ),
    )
  }
  return boxes
}

/** Overflow table: header band, row height, inner padding, tick column. */
export const OVERFLOW_TABLE_HEADER = 24
export const OVERFLOW_TABLE_ROW = 18
export const OVERFLOW_TABLE_PAD = 8
const OVERFLOW_TABLE_TICK = 16
const OVERFLOW_TABLE_BOTTOM = 4
const OVERFLOW_TABLE_TITLE_GAP = 16
/** Bearing tick length, and the radius of the ring around it. */
export const OVERFLOW_TABLE_TICK_RADIUS = 6
const TITLE_WEIGHT = 700

/** Cut like node display names. */
const TABLE_NAME_MAX = 24

/** Columns after the tick: peer, port, out, in, extras. */
const MUTED_COLUMNS = new Set([1, 4])

const cutName = (text) =>
  text.length > TABLE_NAME_MAX ? `${text.slice(0, TABLE_NAME_MAX)}...` : text

/**
 * Clockwise from 12 o'clock (screen y points down), in [0, 2 pi). Rounded, so the lines of a fan
 * compare equal and keep their order.
 */
function clockAngle(bearing) {
  if (!bearing) return 0
  const angle = (Math.atan2(bearing.y, bearing.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
  return Math.round(angle * 1e4) / 1e4
}

const withDirection = (direction) => (segment) => segment.direction === direction

/**
 * Columns: peer, local port, out, in, the rest (link name, undirected CENTER values, this end's
 * OBJECT values). Where the node is element 2, FORWARD runs toward it, so it reads as "in".
 */
function tableRows(nodeId, lines, dciValues) {
  const rows = []
  for (const line of lines) {
    const members = line.drawn.kind === 'group' ? line.drawn.members : [line.drawn.link]
    for (const member of members) {
      const nodeFirst = member.from === nodeId
      const turn = (segments) =>
        nodeFirst
          ? segments
          : segments.map((s) => ({ ...s, direction: flipDirection(s.direction) }))
      const center = turn(linkDciLines(member, 'CENTER', dciValues).flat())
      if (!center.length && member.dciData?.value) {
        center.push({ text: member.dciData.value, direction: 'NONE' })
      }
      const own = turn(linkDciLines(member, nodeFirst ? 'OBJECT1' : 'OBJECT2', dciValues).flat())
      const port = memberPort(member, nodeFirst ? 1 : 2, false)
      rows.push({
        key: `${line.edgeId}:${member.id}`,
        edgeId: line.edgeId,
        color: line.color,
        bearing: line.bearing,
        angle: clockAngle(line.bearing),
        cells: [
          plainLine(line.peerName),
          port ? plainLine(cutName(port)) : [],
          center.filter(withDirection('FORWARD')),
          center.filter(withDirection('REVERSE')),
          [
            ...(member.label ? plainLine(cutName(member.label)) : []),
            ...center.filter(withDirection('NONE')),
            ...own,
          ],
        ],
      })
    }
  }
  // Stable sort: rows at one bearing (a fan, a group) keep line and member order.
  return rows.sort((a, b) => a.angle - b.angle)
}

/**
 * Header (node name, "N links"), then one row per link or group member, clockwise from 12
 * o'clock by the bearing at which the drawn line leaves the node: a tick in the link's colour,
 * then aligned columns. Placement (networkMapOverflowTables) sets `x` / `y`, `leader`, `dir`.
 *
 * @param {object} params
 * @param {string} params.nodeId
 * @param {string} params.title - the node's name as the canvas shows it
 * @param {object[]} params.lines - `edgeId`, `drawn` (from buildDrawnLinks), `peerName`, `color`,
 *   `bearing` (unit vector from the node along the drawn route, or null)
 * @param {Map<string, object>} params.dciValues - keyed "nodeId:dciId"
 * @param {(text: string, fontSize?: number, fontWeight?: number) => number} params.measureText
 * @returns {object}
 */
export function overflowTableContent({ nodeId, title, lines, dciValues, measureText }) {
  const rows = tableRows(nodeId, lines, dciValues)

  const widths = [0, 1, 2, 3, 4].map((c) =>
    Math.max(0, ...rows.map((row) => segmentsWidth(row.cells[c], measureText))),
  )
  const starts = []
  let x = OVERFLOW_TABLE_PAD + OVERFLOW_TABLE_TICK + LINK_LABEL_COLUMN_GAP
  for (const width of widths) {
    starts.push(x)
    if (width) x += width + LINK_LABEL_COLUMN_GAP
  }
  const bodyWidth = x - LINK_LABEL_COLUMN_GAP + OVERFLOW_TABLE_PAD

  const count = `${rows.length} links`
  const countWidth = measureText(count, LABEL_FONT_SIZE, NORMAL_WEIGHT)
  const headerWidth =
    OVERFLOW_TABLE_PAD * 2 +
    measureText(title, LABEL_FONT_SIZE, TITLE_WEIGHT) +
    OVERFLOW_TABLE_TITLE_GAP +
    countWidth
  const width = Math.ceil(Math.max(bodyWidth, headerWidth))
  const headerTextY = textTop(0, OVERFLOW_TABLE_HEADER - 4)

  return {
    id: `table:${nodeId}`,
    nodeId,
    x: 0,
    y: 0,
    width,
    height: OVERFLOW_TABLE_HEADER + rows.length * OVERFLOW_TABLE_ROW + OVERFLOW_TABLE_BOTTOM,
    leader: null,
    dir: null,
    title: { text: title, x: OVERFLOW_TABLE_PAD, textY: headerTextY, weight: TITLE_WEIGHT },
    count: { text: count, x: round2(width - OVERFLOW_TABLE_PAD - countWidth), textY: headerTextY },
    rows: rows.map((row, i) => {
      const top = OVERFLOW_TABLE_HEADER + i * OVERFLOW_TABLE_ROW
      const cx = OVERFLOW_TABLE_PAD + OVERFLOW_TABLE_TICK / 2 - 1
      const cy = top + OVERFLOW_TABLE_ROW / 2
      return {
        key: row.key,
        edgeId: row.edgeId,
        top,
        height: OVERFLOW_TABLE_ROW,
        textY: textTop(top, OVERFLOW_TABLE_ROW),
        tick: {
          cx,
          cy,
          x2: round2(cx + (row.bearing?.x ?? 0) * OVERFLOW_TABLE_TICK_RADIUS),
          y2: round2(cy + (row.bearing?.y ?? 0) * OVERFLOW_TABLE_TICK_RADIUS),
          color: row.color,
        },
        segments: row.cells.flatMap((cell, c) => {
          const placed = placeSegments(
            cell,
            starts[c],
            top,
            OVERFLOW_TABLE_ROW,
            measureText,
            row.bearing,
          )
          return MUTED_COLUMNS.has(c) ? placed.map((s) => ({ ...s, muted: true })) : placed
        }),
      }
    }),
  }
}
