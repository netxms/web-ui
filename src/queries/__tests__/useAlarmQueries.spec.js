import { describe, it, expect } from 'vitest'
import { splitAlarmParams, applyAlarmFilters, alarmKeys } from '../useAlarmQueries'

// `GET /v1/alarms` reads only `rootObject` and `includeObjectDetails`; other filters are applied
// client-side and stay out of the query key, so callers sharing a subtree share one poll.
describe('splitAlarmParams', () => {
  it('routes server-supported params to the server side', () => {
    expect(splitAlarmParams({ rootObject: 42, includeObjectDetails: true }).server).toEqual({
      rootObject: 42,
      includeObjectDetails: true,
    })
  })

  it('keeps state and severity off the server side', () => {
    const { server, client } = splitAlarmParams({ rootObject: 42, state: 0, severity: 4 })
    expect(server).toEqual({ rootObject: 42 })
    expect(client).toEqual({ state: 0, severity: 4 })
  })

  it('omits absent params rather than sending undefined', () => {
    expect(splitAlarmParams({}).server).toEqual({})
    expect(splitAlarmParams(undefined).server).toEqual({})
    expect(splitAlarmParams(null).server).toEqual({})
  })

  it('keeps rootObject 0 (explicitly "all alarms") rather than dropping it', () => {
    expect(splitAlarmParams({ rootObject: 0 }).server).toEqual({ rootObject: 0 })
  })

  it('yields one query key for the same subtree under different client filters', () => {
    const a = splitAlarmParams({ rootObject: 7, state: 0 })
    const b = splitAlarmParams({ rootObject: 7, severity: 4 })
    const c = splitAlarmParams({ rootObject: 7 })
    expect(alarmKeys.list(a.server)).toEqual(alarmKeys.list(b.server))
    expect(alarmKeys.list(b.server)).toEqual(alarmKeys.list(c.server))
  })

  it('still separates different subtrees', () => {
    const a = splitAlarmParams({ rootObject: 7 })
    const b = splitAlarmParams({ rootObject: 8 })
    expect(alarmKeys.list(a.server)).not.toEqual(alarmKeys.list(b.server))
  })
})

describe('applyAlarmFilters', () => {
  // 0=Outstanding, 1=Acknowledged, 2=Resolved, 3=Terminated
  const alarms = [
    { id: 1, state: 0, severity: 4 },
    { id: 2, state: 1, severity: 4 },
    { id: 3, state: 2, severity: 1 },
    { id: 4, state: 0, severity: 1 },
  ]

  it('returns everything when no filters are given', () => {
    expect(applyAlarmFilters(alarms, {})).toHaveLength(4)
  })

  it('filters by state', () => {
    expect(applyAlarmFilters(alarms, { state: 0 }).map((a) => a.id)).toEqual([1, 4])
  })

  it('treats state 0 as a real filter, not a falsy no-op', () => {
    expect(applyAlarmFilters(alarms, { state: 0 })).toHaveLength(2)
  })

  it('filters by severity', () => {
    expect(applyAlarmFilters(alarms, { severity: 4 }).map((a) => a.id)).toEqual([1, 2])
  })

  it('combines state and severity', () => {
    expect(applyAlarmFilters(alarms, { state: 0, severity: 4 }).map((a) => a.id)).toEqual([1])
  })

  it('passes undefined through so loading state stays distinguishable from empty', () => {
    expect(applyAlarmFilters(undefined, { state: 0 })).toBeUndefined()
  })

  it('does not mutate the source list', () => {
    const source = [...alarms]
    applyAlarmFilters(source, { state: 0 })
    expect(source).toHaveLength(4)
  })
})
