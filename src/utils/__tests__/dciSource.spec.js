// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dciSource, isTemplateItem, resolveDciSourceRoot } from '@/utils/dciSource'
import { DCF_TEMPLATE_OVERRIDE } from '@/composables/useDciFlags'

describe('dciSource', () => {
  it('has no source for a DCI created on the object itself', () => {
    expect(dciSource({ templateId: 0, templateItemId: 0, flags: 0 }, 100)).toBeNull()
    expect(dciSource({}, 100)).toBeNull()
    expect(dciSource(null, 100)).toBeNull()
  })

  it('names the template and its DCI for a template-added DCI', () => {
    expect(dciSource({ templateId: 20, templateItemId: 2243, flags: 0 }, 100)).toEqual({
      kind: 'object',
      objectId: 20,
      dciId: 2243,
      isProtected: false,
    })
  })

  // templateId pointing back at the owner is how the server marks instance discovery.
  it('names the prototype on the same object for an instance-discovered DCI', () => {
    expect(dciSource({ templateId: 100, templateItemId: 1533, flags: 0 }, 100)).toMatchObject({
      kind: 'instanceDiscovery',
      objectId: 100,
      dciId: 1533,
    })
  })

  it('reports local changes as protected when the override flag is set', () => {
    const dci = { templateId: 20, templateItemId: 2243, flags: DCF_TEMPLATE_OVERRIDE | 0x8 }
    expect(dciSource(dci, 100).isProtected).toBe(true)
  })
})

describe('isTemplateItem', () => {
  it('reads templateId on configuration rows', () => {
    expect(isTemplateItem({ templateId: 20, templateItemId: 2243 })).toBe(true)
    expect(isTemplateItem({ templateId: 0, templateItemId: 0 })).toBe(false)
  })

  // Current-values rows have no templateId at all.
  it('falls back to templateItemId on current-values rows', () => {
    expect(isTemplateItem({ templateItemId: 2243 })).toBe(true)
    expect(isTemplateItem({ templateItemId: 0 })).toBe(false)
  })
})

describe('resolveDciSourceRoot', () => {
  const owner = { id: 100, class: 'Node', name: 'sw-core' }

  // A fake server: anything absent rejects like a 403 or 404. Records every request.
  function fakeApi({ objects = {}, dcis = {} }) {
    const calls = []
    return {
      calls,
      getObject: async (id) => {
        calls.push(`object ${id}`)
        if (!objects[id]) throw new Error('403')
        return objects[id]
      },
      getDci: async (objectId, dciId) => {
        calls.push(`dci ${objectId}/${dciId}`)
        const dci = dcis[`${objectId}/${dciId}`]
        if (!dci) throw new Error('404')
        return dci
      },
    }
  }

  const template = { id: 20, class: 'Template', name: 'Interface Traffic SNMP' }
  const cluster = { id: 30, class: 'Cluster', name: 'db-cluster' }

  it('has nothing to resolve for a DCI created on its own object', async () => {
    const api = fakeApi({})
    expect(await resolveDciSourceRoot({ templateId: 0 }, owner, api)).toBeNull()
    expect(api.calls).toEqual([])
  })

  it('stops at the template that added the DCI, without reading its DCI', async () => {
    const api = fakeApi({ objects: { 20: template } })
    const root = await resolveDciSourceRoot({ templateId: 20, templateItemId: 2243 }, owner, api)

    expect(root).toMatchObject({ objectId: 20, dciId: 2243, object: template })
    expect(api.calls).toEqual(['object 20'])
  })

  // The node's copy of the prototype is overwritten from the template, so it is not the end.
  it('follows an instance-discovered DCI past its prototype to the template', async () => {
    const prototype = { id: 1533, templateId: 20, templateItemId: 1532 }
    const api = fakeApi({ objects: { 20: template }, dcis: { '100/1533': prototype } })
    const root = await resolveDciSourceRoot({ templateId: 100, templateItemId: 1533 }, owner, api)

    expect(root).toEqual({ objectId: 20, dciId: 1532, object: template, prototype })
  })

  it('ends at a prototype created on the object itself', async () => {
    const prototype = { id: 1533, templateId: 0, templateItemId: 0 }
    const api = fakeApi({ dcis: { '100/1533': prototype } })
    const root = await resolveDciSourceRoot({ templateId: 100, templateItemId: 1533 }, owner, api)

    expect(root).toEqual({ objectId: 100, dciId: 1533, object: owner, prototype })
  })

  it("follows a cluster's DCI to the template it came from", async () => {
    const api = fakeApi({
      objects: { 30: cluster, 20: template },
      dcis: { '30/77': { id: 77, templateId: 20, templateItemId: 2243 } },
    })
    const root = await resolveDciSourceRoot({ templateId: 30, templateItemId: 77 }, owner, api)

    expect(root).toMatchObject({ objectId: 20, dciId: 2243, object: template })
  })

  it("ends at a cluster's own DCI", async () => {
    const api = fakeApi({
      objects: { 30: cluster },
      dcis: { '30/77': { id: 77, templateId: 0, templateItemId: 0 } },
    })
    const root = await resolveDciSourceRoot({ templateId: 30, templateItemId: 77 }, owner, api)

    expect(root).toMatchObject({ objectId: 30, dciId: 77, object: cluster })
  })

  it('stops at an object it cannot read, keeping its id', async () => {
    const api = fakeApi({})
    const root = await resolveDciSourceRoot({ templateId: 20, templateItemId: 2243 }, owner, api)

    expect(root).toEqual({ objectId: 20, dciId: 2243, object: null, prototype: null })
  })

  it('gives up on a chain that does not end', async () => {
    // Two clusters pointing at each other: a broken configuration, not a reason to hang.
    const other = { id: 31, class: 'Cluster', name: 'other' }
    const api = fakeApi({
      objects: { 30: cluster, 31: other },
      dcis: {
        '30/77': { id: 77, templateId: 31, templateItemId: 78 },
        '31/78': { id: 78, templateId: 30, templateItemId: 77 },
      },
    })
    const root = await resolveDciSourceRoot({ templateId: 30, templateItemId: 77 }, owner, api)

    expect(api.calls.filter((c) => c.startsWith('object'))).toHaveLength(9)
    expect(root.object).not.toBeNull()
  })
})
