/**
 * Helpers for `GET /v1/objects/{id}/status-explanation`. The server computes the status from
 * children, from the object's own alarms and from "additional" sources, and reports the winner as
 * `decidingFactor`.
 *
 * - A parent's status comes from each child's propagated status, which propagation settings can
 *   make differ from its own; `contributor` is the server's answer to "did this child matter".
 * - When the deciding factor is not `children`, no child explains the status.
 * - `children` holds only children with a known status, so an empty list does not mean none.
 *
 * The response is richer than `openapi.yaml` documents; the field names follow the handler.
 */
import { getStatusInfo } from '@/utils/objectUtils'

/** Above Critical lie Unknown/Unmanaged. */
function isProblemStatus(status) {
  return status > 0 && status <= 4
}

/**
 * Null while the explanation has not loaded.
 *
 * @param {object} [explanation] - status-explanation response
 * @param {number} [childCount] - from the children list; tells "no children" apart from "no child
 *   with a known status"
 * @returns {string|null}
 */
export function statusOriginSummary(explanation, childCount = 0) {
  if (!explanation) return null

  const label = explanation.statusText || getStatusInfo(explanation.status).label
  if (explanation.unmanaged) return `${label}. Status is not calculated for unmanaged objects.`

  if (explanation.decidingFactor === 'alarms') {
    return `${label}, decided by alarms on this object rather than by its children.`
  }
  if (explanation.decidingFactor === 'additional' && explanation.additionalExplanation) {
    return `${label}, decided by ${explanation.additionalExplanation} rather than by its children.`
  }

  const children = explanation.children ?? []
  if (!children.length) {
    if (childCount === 1) return `${label}. Its only child has no known status to derive one from.`
    if (childCount > 1) {
      return `${label}. None of its ${childCount} children has a known status to derive one from.`
    }
    return `${label}. This object has no children to derive a status from.`
  }

  if (explanation.decidingFactor === 'additional') {
    return `${label}, decided by this object's own data collection rather than by its children.`
  }

  const contributors = children.filter((child) => child.contributor).length
  return `${label}, decided by ${contributors} of ${children.length} ${
    children.length === 1 ? 'child' : 'children'
  }.`
}

/**
 * Rows come from the children list (it carries `class`) annotated from the explanation, the only
 * source for propagation. A child is listed when its own or its propagated status is a problem,
 * which catches a Normal child propagating Critical. Without an explanation, ordering degrades to
 * severity then name.
 *
 * @param {object[]} [children] - `GET /v1/objects/{id}/children` results
 * @param {object} [explanation] - status-explanation response
 * @returns {object[]} children with `contributor`, `propagatedStatus`, `propagation` and
 *   `propagationDiffers` added
 */
export function buildStatusIssueRows(children, explanation) {
  const detailsById = new Map((explanation?.children ?? []).map((child) => [child.objectId, child]))

  return (children ?? [])
    .map((child) => {
      const detail = detailsById.get(child.id)
      return {
        ...child,
        contributor: detail?.contributor === true,
        propagatedStatus: detail?.propagatedStatus ?? child.status,
        propagatedStatusText: detail?.propagatedStatusText ?? null,
        propagation: detail?.propagation ?? null,
        propagationDiffers: detail != null && detail.propagatedStatus !== detail.status,
      }
    })
    .filter((row) => isProblemStatus(row.status ?? 0) || isProblemStatus(row.propagatedStatus ?? 0))
    .sort(
      (a, b) =>
        // Children that drive the parent's status lead, whatever their severity.
        Number(b.contributor) - Number(a.contributor) ||
        (b.status ?? 0) - (a.status ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * "Healthy" only when every child has a known status: Unknown, Unmanaged and Disabled children
 * report nothing, so no problem rows can still hide problems.
 *
 * @param {object[]} [children] - `GET /v1/objects/{id}/children` results
 * @returns {{healthy: boolean, text: string}|null} null when there are no children
 */
export function noStatusIssuesNote(children) {
  const total = children?.length ?? 0
  if (!total) return null

  const unknown = children.filter((child) => (child.status ?? 0) > 4).length
  if (!unknown) return { healthy: true, text: 'All children are healthy' }
  if (unknown === total) {
    return {
      healthy: false,
      text: total === 1 ? 'The child has no known status' : 'No child has a known status',
    }
  }
  return {
    healthy: false,
    text: `No known problems, but ${unknown} of ${total} children have no known status`,
  }
}
