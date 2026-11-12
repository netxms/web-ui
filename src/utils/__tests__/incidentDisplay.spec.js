// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  INCIDENT_STATE,
  normalizeIncidentState,
  getIncidentState,
  incidentStateValue,
  canModify,
  canBlock,
  canStart,
  canResolve,
  canReopen,
  canClose,
  getIncidentActivity,
  describeIncidentActivity,
} from '@/utils/incidentDisplay'
import { INCIDENT_ACTIVITY, normalizeIncident } from '@/api/incidentsApi'

describe('normalizeIncidentState', () => {
  it('maps the server integers 0-4 to state keys', () => {
    expect(normalizeIncidentState(INCIDENT_STATE.OPEN)).toBe('open')
    expect(normalizeIncidentState(INCIDENT_STATE.IN_PROGRESS)).toBe('inProgress')
    expect(normalizeIncidentState(INCIDENT_STATE.BLOCKED)).toBe('blocked')
    expect(normalizeIncidentState(INCIDENT_STATE.RESOLVED)).toBe('resolved')
    expect(normalizeIncidentState(INCIDENT_STATE.CLOSED)).toBe('closed')
  })

  it('passes through keys already in canonical form', () => {
    expect(normalizeIncidentState('inProgress')).toBe('inProgress')
    expect(normalizeIncidentState('closed')).toBe('closed')
  })

  it('tolerates the server enum and display spellings', () => {
    expect(normalizeIncidentState('IN_PROGRESS')).toBe('inProgress')
    expect(normalizeIncidentState('In Progress')).toBe('inProgress')
    expect(normalizeIncidentState('in-progress')).toBe('inProgress')
    expect(normalizeIncidentState('OPEN')).toBe('open')
  })

  it('falls back to open for unknown values, as the server enum does', () => {
    expect(normalizeIncidentState(99)).toBe('open')
    expect(normalizeIncidentState('nonsense')).toBe('open')
    expect(normalizeIncidentState(undefined)).toBe('open')
  })
})

describe('getIncidentState', () => {
  it('returns the display config for the incident state', () => {
    expect(getIncidentState({ state: INCIDENT_STATE.BLOCKED }).label).toBe('Blocked')
    expect(getIncidentState({ state: INCIDENT_STATE.RESOLVED }).severity).toBe('success')
  })

  it('defaults to open config for a null incident', () => {
    expect(getIncidentState(null).label).toBe('Open')
  })
})

describe('incidentStateValue', () => {
  it('round-trips back to the server integer', () => {
    for (const value of Object.values(INCIDENT_STATE)) {
      expect(incidentStateValue({ state: value })).toBe(value)
    }
  })
})

describe('lifecycle guards', () => {
  // Mirrors legacy IncidentList/IncidentDetails.updateActionStates and server Incident::changeState.
  const matrix = [
    {
      state: INCIDENT_STATE.OPEN,
      start: true,
      block: true,
      resolve: true,
      reopen: false,
      close: true,
      modify: true,
    },
    {
      state: INCIDENT_STATE.IN_PROGRESS,
      start: false,
      block: true,
      resolve: true,
      reopen: false,
      close: true,
      modify: true,
    },
    {
      state: INCIDENT_STATE.BLOCKED,
      start: true,
      block: false,
      resolve: true,
      reopen: false,
      close: true,
      modify: true,
    },
    {
      state: INCIDENT_STATE.RESOLVED,
      start: false,
      block: false,
      resolve: false,
      reopen: true,
      close: true,
      modify: true,
    },
    {
      state: INCIDENT_STATE.CLOSED,
      start: false,
      block: false,
      resolve: false,
      reopen: false,
      close: false,
      modify: false,
    },
  ]

  for (const row of matrix) {
    const key = normalizeIncidentState(row.state)
    it(`allows exactly the right actions in "${key}"`, () => {
      const incident = { state: row.state }
      expect(canStart(incident)).toBe(row.start)
      expect(canBlock(incident)).toBe(row.block)
      expect(canResolve(incident)).toBe(row.resolve)
      expect(canReopen(incident)).toBe(row.reopen)
      expect(canClose(incident)).toBe(row.close)
      expect(canModify(incident)).toBe(row.modify)
    })
  }

  it('refuses every action for a missing incident', () => {
    for (const guard of [canStart, canBlock, canResolve, canReopen, canClose, canModify]) {
      expect(guard(null)).toBe(false)
      expect(guard(undefined)).toBe(false)
    }
  })

  it('closed is terminal - nothing but reading is allowed', () => {
    const closed = { state: INCIDENT_STATE.CLOSED }
    expect(canModify(closed)).toBe(false)
    expect(canClose(closed)).toBe(false)
    expect(canReopen(closed)).toBe(false)
  })
})

describe('getIncidentActivity', () => {
  it('labels every activity type the server emits', () => {
    expect(getIncidentActivity({ activityType: 0 }).label).toBe('Created')
    expect(getIncidentActivity({ activityType: 1 }).label).toBe('State changed')
    expect(getIncidentActivity({ activityType: 2 }).label).toBe('Assigned')
    expect(getIncidentActivity({ activityType: 3 }).label).toBe('Alarm linked')
    expect(getIncidentActivity({ activityType: 4 }).label).toBe('Alarm unlinked')
    expect(getIncidentActivity({ activityType: 5 }).label).toBe('Comment added')
    expect(getIncidentActivity({ activityType: 6 }).label).toBe('Updated')
  })

  it('falls back for an unknown type', () => {
    expect(getIncidentActivity({ activityType: 42 }).label).toBe('Unknown')
    expect(getIncidentActivity(null).label).toBe('Unknown')
  })
})

describe('describeIncidentActivity', () => {
  const names = new Map([[4, 'operator']])
  const resolve = (id) => names.get(id)

  it('keeps the server strings for a state change', () => {
    const entry = {
      activityType: INCIDENT_ACTIVITY.STATE_CHANGE,
      oldValue: 'Open',
      newValue: 'Resolved',
    }
    expect(describeIncidentActivity(entry, resolve)).toBe('Open -> Resolved')
  })

  it('resolves the user ids an assignment records', () => {
    const entry = { activityType: INCIDENT_ACTIVITY.ASSIGNED, oldValue: '0', newValue: '4' }
    expect(describeIncidentActivity(entry, resolve)).toBe('Unassigned -> operator')
  })

  it('reads user id 0 as unassigned in either direction', () => {
    const entry = { activityType: INCIDENT_ACTIVITY.ASSIGNED, oldValue: '4', newValue: '0' }
    expect(describeIncidentActivity(entry, resolve)).toBe('operator -> Unassigned')
  })

  it('falls back to bare ids when the user list is unavailable', () => {
    const entry = { activityType: INCIDENT_ACTIVITY.ASSIGNED, oldValue: '7', newValue: '4' }
    expect(describeIncidentActivity(entry)).toBe('[7] -> [4]')
    expect(describeIncidentActivity(entry, () => undefined)).toBe('[7] -> [4]')
  })

  it('falls back to the new value or details for other types', () => {
    expect(
      describeIncidentActivity({ activityType: INCIDENT_ACTIVITY.ALARM_LINKED, newValue: '4821' }),
    ).toBe('4821')
    expect(
      describeIncidentActivity({ activityType: INCIDENT_ACTIVITY.CREATED, details: 'By EPP rule' }),
    ).toBe('By EPP rule')
    expect(describeIncidentActivity(null)).toBe('')
  })
})

describe('normalizeIncident', () => {
  it('drops the "system" name the server resolves for the unassigned sentinel', () => {
    const incident = { id: 1, assignedUserId: 0, assignedUserName: 'system' }
    expect(normalizeIncident(incident).assignedUserName).toBeNull()
    expect(normalizeIncident(incident).assignedUserId).toBe(0)
  })

  it('leaves a real assignee and the created/resolved/closed names alone', () => {
    const incident = {
      id: 1,
      assignedUserId: 4,
      assignedUserName: 'operator',
      createdByUser: 0,
      createdByUserName: 'system',
    }
    expect(normalizeIncident(incident)).toBe(incident)
  })

  it('tolerates a missing payload', () => {
    expect(normalizeIncident(null)).toBeNull()
  })
})
