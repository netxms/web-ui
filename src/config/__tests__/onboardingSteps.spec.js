import { describe, it, expect } from 'vitest'
import { ONBOARDING_STEPS, STEP_GROUPS, getStep } from '@/config/onboardingSteps'
import { ALL_OBJECT_VIEWS, isViewCompatible } from '@/config/objectViews'
import { CAN_KEY_TO_RIGHT } from '@/auth/systemRights'
import { OBJECT_ACCESS } from '@/auth/objectAccessRights'

const SERVICE_ROOT = { id: 2, class: 'ServiceRoot' }
const NODE_10 = { id: 10, class: 'Node' }
const NODE_42 = { id: 42, class: 'Node' }

function emptyContext() {
  return {
    nodes: [],
    targetNode: null,
    dashboards: [],
    channels: [],
    users: [],
    infrastructureRoot: SERVICE_ROOT,
  }
}

function contextWith(overrides) {
  return { ...emptyContext(), ...overrides }
}

/** @param {string} id */
function target(id, ctx) {
  return getStep(id).action.target(ctx)
}

describe('onboardingSteps', () => {
  it('assigns every step to a known group', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(STEP_GROUPS).toContain(step.group)
    }
  })

  it('gives every step a unique id', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // A step may carry no signal (its tour completing records progress), but a declared one
  // must be callable.
  it('declares completion signals as functions, never literals', () => {
    const declared = ONBOARDING_STEPS.filter((s) => s.isDone !== undefined)
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.map((s) => typeof s.isDone)).toEqual(declared.map(() => 'function'))
  })

  it('asks Infrastructure to open the create-node dialog on arrival', () => {
    expect(target('add-node', emptyContext())).toEqual({
      name: 'infrastructure',
      params: { objectId: 2 },
      query: { create: 'Node' },
    })
  })

  // A dialog opening on arrival would cover the button the tour highlights.
  it('starts the add-node tour without the create param', () => {
    const entry = getStep('add-node').tourEntry(emptyContext())
    expect(entry).toEqual({ name: 'infrastructure', params: { objectId: 2 } })
    expect(entry.query).toBeUndefined()
  })

  it('falls back to the bare perspective before the root object has loaded', () => {
    const ctx = contextWith({ infrastructureRoot: null })
    expect(target('add-node', ctx)).toEqual({ name: 'infrastructure', query: { create: 'Node' } })
  })

  it('completes once a node exists', () => {
    const step = getStep('add-node')
    expect(step.isDone(emptyContext())).toBe(false)
    expect(step.isDone(contextWith({ nodes: [NODE_10] }))).toBe(true)
  })

  it('opens the target node Communication properties, not the perspective root', () => {
    const ctx = contextWith({ nodes: [NODE_42], targetNode: NODE_42 })
    expect(target('node-credentials', ctx)).toEqual({
      name: 'infrastructure',
      params: { objectId: 42, viewId: 'properties' },
      query: { section: 'communication' },
    })
  })

  it('opens the target node Data Collection view', () => {
    const ctx = contextWith({ nodes: [NODE_42], targetNode: NODE_42 })
    expect(target('collect-metric', ctx)).toEqual({
      name: 'infrastructure',
      params: { objectId: 42, viewId: 'dcis' },
    })
  })

  it.each(['node-credentials', 'collect-metric'])(
    'falls back to the perspective for %s when no node exists',
    (id) => {
      expect(target(id, emptyContext())).toEqual({
        name: 'infrastructure',
        params: { objectId: 2 },
      })
    },
  )

  it('sends the notification step to notification channels', () => {
    expect(target('get-notified', emptyContext())).toEqual({
      name: 'configuration',
      params: { sectionId: 'notification-channels' },
    })
  })

  it('completes the notification step once a channel exists', () => {
    const step = getStep('get-notified')
    expect(step.isDone(emptyContext())).toBe(false)
    expect(step.isDone(contextWith({ channels: [{ name: 'SMTP' }] }))).toBe(true)
  })

  it('sends the dashboard step to the perspective with no id param', () => {
    expect(target('build-dashboard', emptyContext())).toEqual({ name: 'dashboards', params: {} })
  })

  it('completes the dashboard step once a dashboard exists', () => {
    const step = getStep('build-dashboard')
    expect(step.isDone(emptyContext())).toBe(false)
    expect(step.isDone(contextWith({ dashboards: [{ id: 700 }] }))).toBe(true)
  })

  // A lone admin account is the starting state, so one user is not progress.
  it('completes the user step only past the first account', () => {
    const step = getStep('add-user')
    expect(step.isDone(contextWith({ users: [{ id: 0 }] }))).toBe(false)
    expect(step.isDone(contextWith({ users: [{ id: 0 }, { id: 1 }] }))).toBe(true)
  })

  // Non-admins get an empty list from the 403-tolerant query.
  it('treats an unreadable user list as no signal', () => {
    expect(getStep('add-user').isDone(emptyContext())).toBe(false)
  })

  it('returns null for an unknown step id', () => {
    expect(getStep('nope')).toBeNull()
  })

  // ObjectsView silently replaces an unknown or class-incompatible viewId.
  describe.each([
    ['node-credentials', 'properties'],
    ['collect-metric', 'dcis'],
  ])('%s → %s', (stepId, viewId) => {
    const ctx = {
      ...emptyContext(),
      nodes: [NODE_42],
      targetNode: NODE_42,
    }

    it('names a view that exists', () => {
      expect(ALL_OBJECT_VIEWS.map((v) => v.id)).toContain(viewId)
      expect(target(stepId, ctx).params.viewId).toBe(viewId)
    })

    it('names a view a Node supports', () => {
      expect(isViewCompatible(viewId, 'Node', { id: 42, class: 'Node' })).toBe(true)
    })
  })
})

describe('onboardingSteps rights declarations', () => {
  it('declares system rights using keys from the shared vocabulary', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step.requiredRight === undefined) continue
      const keys = Array.isArray(step.requiredRight) ? step.requiredRight : [step.requiredRight]
      for (const key of keys) {
        expect(CAN_KEY_TO_RIGHT[key], `${step.id} declares unknown right ${key}`).toBeDefined()
      }
    }
  })

  it('declares object rights as a known key plus a selector function', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step.requiredObjectRight === undefined) continue
      expect(OBJECT_ACCESS[step.requiredObjectRight.key]).toBeDefined()
      expect(typeof step.requiredObjectRight.from).toBe('function')
    }
  })

  it('gates every step on something', () => {
    for (const step of ONBOARDING_STEPS) {
      const gated = step.requiredRight !== undefined || step.requiredObjectRight !== undefined
      expect(gated, `${step.id} has no rights gate`).toBe(true)
    }
  })

  it('selects objects from the step context without throwing on an empty install', () => {
    const ctx = { ...emptyContext(), dashboardRoot: null }
    for (const step of ONBOARDING_STEPS) {
      if (step.requiredObjectRight === undefined) continue
      expect(() => step.requiredObjectRight.from(ctx)).not.toThrow()
    }
  })
})
