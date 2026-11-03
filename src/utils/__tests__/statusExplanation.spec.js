import { describe, it, expect } from 'vitest'
import {
  statusOriginSummary,
  buildStatusIssueRows,
  noStatusIssuesNote,
} from '@/utils/statusExplanation'

/** Explanation child as `NetObj::buildStatusExplanation` emits it. */
function explanationChild(overrides = {}) {
  return {
    objectId: 1,
    name: 'child',
    status: 4,
    statusText: 'Critical',
    propagatedStatus: 4,
    propagatedStatusText: 'Critical',
    propagation: 'Unchanged',
    contributor: true,
    ...overrides,
  }
}

describe('statusOriginSummary', () => {
  it('returns null before the explanation loads', () => {
    expect(statusOriginSummary(undefined)).toBeNull()
  })

  it('counts contributing children when the status comes from children', () => {
    const summary = statusOriginSummary({
      status: 4,
      statusText: 'Critical',
      decidingFactor: 'children',
      children: [
        explanationChild({ objectId: 1 }),
        explanationChild({ objectId: 2 }),
        explanationChild({ objectId: 3, contributor: false }),
      ],
    })
    expect(summary).toBe('Critical, decided by 2 of 3 children.')
  })

  it('uses the singular for a single child', () => {
    const summary = statusOriginSummary({
      statusText: 'Major',
      decidingFactor: 'children',
      children: [explanationChild()],
    })
    expect(summary).toBe('Major, decided by 1 of 1 child.')
  })

  it('names alarms when they, not the children, decided the status', () => {
    const summary = statusOriginSummary({
      statusText: 'Critical',
      decidingFactor: 'alarms',
      children: [explanationChild({ status: 0, contributor: false })],
    })
    expect(summary).toBe('Critical, decided by alarms on this object rather than by its children.')
  })

  it('quotes the server explanation for an additional status source', () => {
    const summary = statusOriginSummary({
      statusText: 'Major',
      decidingFactor: 'additional',
      additionalExplanation: 'DCI 42 "Status" = 3',
      children: [],
    })
    expect(summary).toBe('Major, decided by DCI 42 "Status" = 3 rather than by its children.')
  })

  it('falls back to a generic phrase for an additional source with no explanation text', () => {
    const summary = statusOriginSummary({
      statusText: 'Normal',
      decidingFactor: 'additional',
      children: [explanationChild({ status: 0, contributor: false })],
    })
    expect(summary).toBe(
      "Normal, decided by this object's own data collection rather than by its children.",
    )
  })

  it('says so when there are no children at all', () => {
    const summary = statusOriginSummary({
      statusText: 'Normal',
      decidingFactor: 'children',
      children: [],
    })
    expect(summary).toBe('Normal. This object has no children to derive a status from.')
  })

  it('tells children with no known status apart from no children at all', () => {
    // The server leaves Unknown/Unmanaged/Disabled children out of `children` entirely
    const explanation = {
      statusText: 'Unknown',
      decidingFactor: 'children',
      children: [],
    }
    expect(statusOriginSummary(explanation, 6)).toBe(
      'Unknown. None of its 6 children has a known status to derive one from.',
    )
    expect(statusOriginSummary(explanation, 1)).toBe(
      'Unknown. Its only child has no known status to derive one from.',
    )
  })

  it('short-circuits on unmanaged objects, which carry no other fields', () => {
    expect(statusOriginSummary({ status: 6, statusText: 'Unmanaged', unmanaged: true })).toBe(
      'Unmanaged. Status is not calculated for unmanaged objects.',
    )
  })
})

describe('buildStatusIssueRows', () => {
  const children = [
    { id: 1, name: 'alpha', class: 'Node', status: 3 },
    { id: 2, name: 'bravo', class: 'Node', status: 4 },
    { id: 3, name: 'charlie', class: 'Node', status: 0 },
  ]

  it('lists non-Normal children by severity when no explanation is available yet', () => {
    const rows = buildStatusIssueRows(children, undefined)
    expect(rows.map((r) => r.name)).toEqual(['bravo', 'alpha'])
    expect(rows.every((r) => r.contributor === false)).toBe(true)
  })

  it('puts contributing children first even when they are less severe', () => {
    const rows = buildStatusIssueRows(children, {
      children: [
        explanationChild({ objectId: 1, status: 3, propagatedStatus: 3, contributor: true }),
        explanationChild({
          objectId: 2,
          status: 4,
          propagatedStatus: 0,
          propagatedStatusText: 'Normal',
          propagation: 'Fixed to Normal',
          contributor: false,
        }),
      ],
    })
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'bravo'])
    expect(rows[1].propagationDiffers).toBe(true)
    expect(rows[1].propagatedStatusText).toBe('Normal')
  })

  it('includes a Normal child that propagates a problem status', () => {
    const rows = buildStatusIssueRows([children[2]], {
      children: [
        explanationChild({
          objectId: 3,
          status: 0,
          statusText: 'Normal',
          propagatedStatus: 4,
          propagation: 'Fixed to Critical',
          contributor: true,
        }),
      ],
    })
    expect(rows.map((r) => r.name)).toEqual(['charlie'])
    expect(rows[0].propagationDiffers).toBe(true)
  })

  it('ignores statuses above Critical, which are not problems to act on', () => {
    const rows = buildStatusIssueRows(
      [{ id: 9, name: 'unmanaged', class: 'Node', status: 6 }],
      undefined,
    )
    expect(rows).toEqual([])
  })

  it('tolerates missing inputs', () => {
    expect(buildStatusIssueRows(undefined, undefined)).toEqual([])
  })
})

describe('noStatusIssuesNote', () => {
  it('says nothing when there are no children', () => {
    expect(noStatusIssuesNote([])).toBeNull()
    expect(noStatusIssuesNote(undefined)).toBeNull()
  })

  it('claims healthy only when every child has a known status', () => {
    expect(noStatusIssuesNote([{ status: 0 }, { status: 0 }])).toEqual({
      healthy: true,
      text: 'All children are healthy',
    })
  })

  it('does not claim healthy when no child has a known status', () => {
    expect(noStatusIssuesNote([{ status: 5 }, { status: 6 }, { status: 7 }])).toEqual({
      healthy: false,
      text: 'No child has a known status',
    })
    expect(noStatusIssuesNote([{ status: 5 }]).text).toBe('The child has no known status')
  })

  it('counts the children with no known status when only some lack one', () => {
    expect(noStatusIssuesNote([{ status: 0 }, { status: 5 }, { status: 0 }])).toEqual({
      healthy: false,
      text: 'No known problems, but 1 of 3 children have no known status',
    })
  })
})
