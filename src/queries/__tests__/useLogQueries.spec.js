// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { adaptRecentEvents } from '../useLogQueries'

// There is no `/v1/events`; column names are the `EventLog` entry of the server's `s_logs[]`.
describe('adaptRecentEvents', () => {
  const page = {
    records: [
      {
        event_id: 101,
        event_timestamp: '2026-08-19T10:00:00Z',
        event_severity: 4,
        event_message: 'Node down',
        event_source: 7,
      },
    ],
    resolvedValues: { objects: { 7: { id: 7, class: 'Node', name: 'core-sw-1' } } },
  }

  it('flattens records onto the card shape', () => {
    expect(adaptRecentEvents(page)).toEqual([
      {
        id: 101,
        timestamp: '2026-08-19T10:00:00Z',
        severity: 4,
        message: 'Node down',
        sourceObject: expect.objectContaining({ id: 7, class: 'Node', name: 'core-sw-1' }),
        sourceObjectName: 'core-sw-1',
      },
    ])
  })

  // Ids the caller cannot read are omitted from resolvedValues; older servers omit the element.
  it('falls back to the bare id when the server resolved no name', () => {
    const [event] = adaptRecentEvents({ records: page.records })
    expect(event.sourceObjectName).toBe('[7]')
    expect(event.sourceObject).toBeNull()
  })

  it('renders a source-less event without an object target', () => {
    const [event] = adaptRecentEvents({
      records: [{ event_id: 5, event_source: 0, event_severity: 0 }],
    })
    expect(event.sourceObjectName).toBe('')
    expect(event.sourceObject).toBeNull()
    expect(event.message).toBe('')
  })

  it('survives an empty or malformed page', () => {
    expect(adaptRecentEvents({})).toEqual([])
    expect(adaptRecentEvents(null)).toEqual([])
  })
})
