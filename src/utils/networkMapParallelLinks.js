/**
 * Port of legacy ParallelLinkGroup: more than `threshold` NORMAL links between one pair draw as a
 * single group line; other lines between a pair fan out side by side (a group fans out with the
 * other links of its pair). Groups are client-only. Units are graph coordinates or container
 * pixels, depending on the canvas.
 */

import { LINK_TYPES, getLinkWidth, linkStatus, resolveLinkVisual } from './networkMapUtils'

/** Legacy DEFAULT_MERGE_THRESHOLD and the server's default for a new map. */
export const DEFAULT_LINK_MERGE_THRESHOLD = 2

export const LINK_FAN_SPACING = 12

const GROUP_EXTRA_WIDTH = 2

const round2 = (v) => Math.round(v * 100) / 100

/**
 * Absent means the server default (older servers, demo maps); 0 or less means never merge.
 * @param {object | null | undefined} mapData
 * @returns {number}
 */
export function configuredMergeThreshold(mapData) {
  const value = mapData?.rawContent?.linkMergeThreshold
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LINK_MERGE_THRESHOLD
  return value > 0 ? Math.floor(value) : 0
}

/**
 * Legacy activeParallelLinkMergeThreshold: 0 while the view toggle is off, otherwise the map's
 * threshold, or the default when the map is set not to merge.
 * @param {number} configured - from configuredMergeThreshold()
 * @param {boolean} mergeOn
 * @returns {number}
 */
export function activeMergeThreshold(configured, mergeOn) {
  if (!mergeOn) return 0
  return configured > 0 ? configured : DEFAULT_LINK_MERGE_THRESHOLD
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const isNormal = (link) => (link.type ?? LINK_TYPES.NORMAL) === LINK_TYPES.NORMAL

/**
 * A group takes the orientation and list position of its first member. Members keep map order
 * (legacy sorts by link id, which the WebAPI does not expose).
 *
 * Fan offsets run along each line's normal (-uy, ux), centred on the straight line; a line
 * stored the other way round from the first of its pair gets the opposite sign so both spread to
 * the same sides. Links with bend points are not offset and leave no gap.
 *
 * @param {object[]} links - drawable internal links (both endpoints present)
 * @param {number} threshold - from activeMergeThreshold(); 0 never merges
 * @param {(link: object) => boolean} [hasBends]
 * @returns {{ id: string, kind: 'link' | 'group', link: object | null,
 *   members: object[] | null, from: string, to: string, fanOffset: number }[]}
 */
export function buildDrawnLinks(links, threshold, hasBends = () => false) {
  const normalByPair = new Map()
  if (threshold > 0) {
    for (const link of links) {
      if (!isNormal(link)) continue
      const key = pairKey(link.from, link.to)
      const list = normalByPair.get(key)
      if (list) list.push(link)
      else normalByPair.set(key, [link])
    }
  }

  const drawn = []
  const groupedPairs = new Set()
  for (const link of links) {
    const key = pairKey(link.from, link.to)
    const members = isNormal(link) ? normalByPair.get(key) : null
    if (members && members.length > threshold) {
      if (groupedPairs.has(key)) continue
      groupedPairs.add(key)
      const [first] = members
      drawn.push({
        id: `grp-${first.id}`,
        kind: 'group',
        link: null,
        members,
        from: first.from,
        to: first.to,
        fanOffset: 0,
      })
    } else {
      drawn.push({
        id: link.id,
        kind: 'link',
        link,
        members: null,
        from: link.from,
        to: link.to,
        fanOffset: 0,
      })
    }
  }

  const fans = new Map()
  for (const line of drawn) {
    if (line.kind === 'link' && hasBends(line.link)) continue
    const key = pairKey(line.from, line.to)
    const list = fans.get(key)
    if (list) list.push(line)
    else fans.set(key, [line])
  }
  for (const list of fans.values()) {
    if (list.length < 2) continue
    const { from } = list[0]
    list.forEach((line, i) => {
      const offset = (i - (list.length - 1) / 2) * LINK_FAN_SPACING
      // `|| 0` folds the middle line of an odd fan back from -0.
      line.fanOffset = (line.from === from ? offset : -offset) || 0
    })
  }
  return drawn
}

/**
 * Legacy ParallelLinkGroup.isInverted.
 * @param {{ from: string }} group
 * @param {{ from: string }} member
 * @returns {boolean}
 */
export function isInvertedMember(group, member) {
  return member.from !== group.from
}

/** Null when the points (nearly) coincide. */
function unitVector(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  return len < 0.001 ? null : { x: dx / len, y: dy / len }
}

/**
 * Both endpoints moved `offset` along the normal (-uy, ux) of the source-target direction.
 * @param {{ x: number, y: number }} source
 * @param {{ x: number, y: number }} target
 * @param {number} offset
 * @returns {{ source: { x: number, y: number }, target: { x: number, y: number } }}
 */
export function offsetEndpoints(source, target, offset) {
  const u = offset ? unitVector(source, target) : null
  if (!u) return { source, target }
  const dx = -u.y * offset
  const dy = u.x * offset
  return {
    source: { x: source.x + dx, y: source.y + dy },
    target: { x: target.x + dx, y: target.y + dy },
  }
}

/**
 * Distance from a point inside a node (relative to its centre) to the outline along a unit
 * direction; 0 when the point is not inside.
 * @param {number} fx
 * @param {number} fy
 * @param {number} dx
 * @param {number} dy
 * @param {{ kind: 'ellipse' | 'rectangle', halfW: number, halfH: number }} shape
 * @returns {number}
 */
function exitDistance(fx, fy, dx, dy, shape) {
  const a = shape.halfW
  const b = shape.halfH
  if (shape.kind === 'rectangle') {
    if (Math.abs(fx) >= a || Math.abs(fy) >= b) return 0
    let t = Number.POSITIVE_INFINITY
    if (dx) t = Math.min(t, ((dx > 0 ? a : -a) - fx) / dx)
    if (dy) t = Math.min(t, ((dy > 0 ? b : -b) - fy) / dy)
    return Number.isFinite(t) ? t : 0
  }
  // Ellipse: the positive root of ((fx + dx t) / a)^2 + ((fy + dy t) / b)^2 = 1.
  const qa = (dx / a) ** 2 + (dy / b) ** 2
  const qb = 2 * ((fx * dx) / (a * a) + (fy * dy) / (b * b))
  const qc = (fx / a) ** 2 + (fy / b) ** 2 - 1
  if (qc >= 0) return 0
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa)
}

/**
 * Where the offset line leaves the node's outline, relative to the node centre. Cytoscape's own
 * endpoints aim at the other node's centre, which would pull fanned lines together at both ends.
 * When the offset line misses the node, the line starts beside it, level with the centre.
 *
 * @param {{ x: number, y: number }} source - source node centre
 * @param {{ x: number, y: number }} target - target node centre
 * @param {number} offset
 * @param {'source' | 'target'} end
 * @param {{ kind: 'ellipse' | 'rectangle', halfW: number, halfH: number }} shape - border
 *   included
 * @returns {{ x: number, y: number }}
 */
export function fanEndpoint(source, target, offset, end, shape) {
  const u = unitVector(source, target)
  if (!u) return { x: 0, y: 0 }
  const fx = -u.y * offset
  const fy = u.x * offset
  const dx = end === 'source' ? u.x : -u.x
  const dy = end === 'source' ? u.y : -u.y
  const t = exitDistance(fx, fy, dx, dy, shape)
  return { x: round2(fx + dx * t), y: round2(fy + dy * t) }
}

/**
 * Resolved through the most critical member (the first when no status is known), as legacy
 * LinkStylingHelper does; wider so the group reads as more than one link.
 * @param {object[]} members
 * @param {object} [mapContent] - map.rawContent (link defaults)
 * @returns {{ member: object, dash: string | null, width: number, color: string | null }}
 */
export function groupLinkVisual(members, mapContent) {
  let member = members[0]
  let best = null
  for (const candidate of members) {
    const status = linkStatus(candidate)
    if (status !== null && (best === null || status > best)) {
      best = status
      member = candidate
    }
  }
  // Demo links have no raw config and fall back to type heuristics, as elsewhere.
  const visual = member.raw ? resolveLinkVisual(member, mapContent) : null
  return {
    member,
    dash: visual?.dash ?? null,
    color: visual?.color ?? null,
    width: (visual?.width ?? getLinkWidth(member)) + GROUP_EXTRA_WIDTH,
  }
}
