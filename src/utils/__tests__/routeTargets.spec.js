import { describe, it, expect } from 'vitest'
import {
  objectTarget,
  mapTarget,
  dashboardTarget,
  alarmTarget,
  configTarget,
  eppChainTarget,
  perspectiveForClass,
  toolTarget,
  macSearchTarget,
  objectQueryTarget,
  perspectiveTarget,
  dciTarget,
  objectIdFromRoute,
  aiTarget,
} from '@/utils/routeTargets'

describe('perspectiveForClass', () => {
  it('routes each object class to its perspective', () => {
    expect(perspectiveForClass('Node')).toBe('infrastructure')
    expect(perspectiveForClass('Container')).toBe('infrastructure')
    expect(perspectiveForClass('Template')).toBe('templates')
    expect(perspectiveForClass('TemplateGroup')).toBe('templates')
    expect(perspectiveForClass('Asset')).toBe('assets')
    expect(perspectiveForClass('BusinessService')).toBe('business-services')
    expect(perspectiveForClass('Dashboard')).toBe('dashboards')
    expect(perspectiveForClass('NetworkMap')).toBe('network-maps')
  })

  it('falls back to infrastructure for unknown or missing classes', () => {
    expect(perspectiveForClass('SomethingNew')).toBe('infrastructure')
    expect(perspectiveForClass(undefined)).toBe('infrastructure')
  })
})

describe('dciTarget', () => {
  it("opens a node's DCI on the Infrastructure Data Collection tab", () => {
    expect(dciTarget({ id: 10, class: 'Node' }, 1465)).toEqual({
      name: 'infrastructure',
      params: { objectId: 10, viewId: 'dcis', entityId: '1465' },
    })
  })

  // Same view, different tab id: Templates names its Data Collection tab differently.
  it("opens a template's DCI on the Templates Data Collection tab", () => {
    expect(dciTarget({ id: 20, class: 'Template' }, 2243)).toEqual({
      name: 'templates',
      params: { objectId: 20, viewId: 'dataCollection', entityId: '2243' },
    })
  })
})

describe('objectTarget', () => {
  it('builds an infrastructure target with view and entity segments', () => {
    const target = objectTarget({ id: 10, class: 'Node' }, 'polls', { entityId: 'status' })
    expect(target).toEqual({
      name: 'infrastructure',
      params: { objectId: 10, viewId: 'polls', entityId: 'status' },
    })
  })

  it('omits optional params rather than sending undefined', () => {
    expect(objectTarget({ id: 10, class: 'Node' })).toEqual({
      name: 'infrastructure',
      params: { objectId: 10 },
    })
  })

  it('carries a query when given one', () => {
    const target = objectTarget({ id: 10, class: 'Node' }, 'polls', {
      entityId: 'status',
      query: { autorun: '1' },
    })
    expect(target.query).toEqual({ autorun: '1' })
  })

  it('routes non-infrastructure classes to their own perspective', () => {
    expect(objectTarget({ id: 7, class: 'Template' }, 'status').name).toBe('templates')
    expect(objectTarget({ id: 8, class: 'Asset' }).name).toBe('assets')
    expect(objectTarget({ id: 9, class: 'BusinessService' }).name).toBe('business-services')
  })

  it('uses the single id param for dashboards and maps, ignoring view ids', () => {
    expect(objectTarget({ id: 42, class: 'NetworkMap' }, 'status')).toEqual({
      name: 'network-maps',
      params: { mapId: 42 },
    })
    expect(objectTarget({ id: 43, class: 'Dashboard' }, 'status')).toEqual({
      name: 'dashboards',
      params: { dashboardId: 43 },
    })
  })

  it('honours an explicit perspective override', () => {
    const target = objectTarget({ id: 10, class: 'Node' }, 'status', { perspective: 'templates' })
    expect(target.name).toBe('templates')
  })
})

describe('single-entity targets', () => {
  it('builds map, dashboard and alarm targets', () => {
    expect(mapTarget(3)).toEqual({ name: 'network-maps', params: { mapId: 3 } })
    expect(dashboardTarget(4)).toEqual({ name: 'dashboards', params: { dashboardId: 4 } })
    expect(alarmTarget(5)).toEqual({ name: 'alarms', params: { alarmId: 5 } })
  })

  it('builds an alarm list target when no id is given', () => {
    expect(alarmTarget()).toEqual({ name: 'alarms', params: {} })
  })

  // An `undefined` id must not become an undefined param — the landing links (quick actions,
  // getting-started cards) mean "the perspective", not "the object called undefined".
  it('omits the id param entirely when no id is given', () => {
    expect(mapTarget()).toEqual({ name: 'network-maps', params: {} })
    expect(dashboardTarget()).toEqual({ name: 'dashboards', params: {} })
  })
})

describe('objectIdFromRoute', () => {
  it('reads the object id back from every object perspective', () => {
    for (const object of [
      { id: 7, class: 'Node' },
      { id: 8, class: 'Template' },
      { id: 9, class: 'Dashboard' },
      { id: 10, class: 'NetworkMap' },
    ]) {
      const { name, params } = objectTarget(object, 'overview')
      const route = { name, params: { ...params, [Object.keys(params)[0]]: String(object.id) } }
      expect(objectIdFromRoute(route)).toBe(object.id)
    }
  })

  // An alarm or incident id is not an object id, and a perspective root names no object.
  it('returns null outside object perspectives and at a perspective root', () => {
    expect(objectIdFromRoute({ name: 'alarms', params: { alarmId: '5' } })).toBeNull()
    expect(objectIdFromRoute({ name: 'incidents', params: { incidentId: '6' } })).toBeNull()
    expect(objectIdFromRoute({ name: 'infrastructure', params: { objectId: '' } })).toBeNull()
    expect(objectIdFromRoute({ name: 'dashboards', params: {} })).toBeNull()
    expect(objectIdFromRoute(undefined)).toBeNull()
  })
})

describe('aiTarget', () => {
  it('builds a tab target, and the incident chat as a query', () => {
    expect(aiTarget()).toEqual({ name: 'ai', params: {} })
    expect(aiTarget('observations')).toEqual({ name: 'ai', params: { tab: 'observations' } })
    expect(aiTarget('chat', { incidentId: 42 })).toEqual({
      name: 'ai',
      params: { tab: 'chat' },
      query: { incident: '42' },
    })
  })
})

describe('perspectiveTarget', () => {
  it('builds a bare perspective target with no params', () => {
    expect(perspectiveTarget('infrastructure')).toEqual({ name: 'infrastructure' })
  })
})

describe('tool targets', () => {
  it('builds the catalog target when no tool is named', () => {
    expect(toolTarget()).toEqual({ name: 'tools' })
  })

  it('builds a tool target, with query state when given', () => {
    expect(toolTarget('mib-explorer')).toEqual({ name: 'tool', params: { toolId: 'mib-explorer' } })
    expect(toolTarget('mib-explorer', { oid: '1.3.6' })).toEqual({
      name: 'tool',
      params: { toolId: 'mib-explorer' },
      query: { oid: '1.3.6' },
    })
  })

  it('omits an empty query object rather than sending one', () => {
    expect(toolTarget('mac-search', {})).toEqual({ name: 'tool', params: { toolId: 'mac-search' } })
  })

  // Existing links depend on this shape.
  it('routes the MAC search through the tools perspective', () => {
    expect(macSearchTarget('00:50:56')).toEqual({
      name: 'tool',
      params: { toolId: 'mac-search' },
      query: { mac: '00:50:56' },
    })
    expect(macSearchTarget()).toEqual({ name: 'tool', params: { toolId: 'mac-search' } })
  })

  it('routes the object query through the tools perspective', () => {
    expect(objectQueryTarget({ text: 'core' })).toEqual({
      name: 'tool',
      params: { toolId: 'object-query' },
      query: { text: 'core' },
    })
    expect(objectQueryTarget()).toEqual({ name: 'tool', params: { toolId: 'object-query' } })
  })
})

describe('configTarget', () => {
  it('builds a section target', () => {
    expect(configTarget('users-groups')).toEqual({
      name: 'configuration',
      params: { sectionId: 'users-groups' },
    })
  })

  it('adds the entity param and tab query when given', () => {
    expect(configTarget('users-groups', { entityId: 12, tab: 'groups' })).toEqual({
      name: 'configuration',
      params: { sectionId: 'users-groups', entityId: 12 },
      query: { tab: 'groups' },
    })
  })
})

describe('eppChainTarget', () => {
  it('leaves the main chain as the bare section URL', () => {
    expect(eppChainTarget(0)).toEqual({
      name: 'configuration',
      params: { sectionId: 'epp' },
    })
  })

  it('carries a sub-chain in the query', () => {
    expect(eppChainTarget(3)).toEqual({
      name: 'configuration',
      params: { sectionId: 'epp' },
      query: { chain: '3' },
    })
  })

  it('opens a rule within its chain', () => {
    expect(eppChainTarget(3, { ruleGuid: 'abc-123' })).toEqual({
      name: 'configuration',
      params: { sectionId: 'epp', entityId: 'abc-123' },
      query: { chain: '3' },
    })
  })
})
