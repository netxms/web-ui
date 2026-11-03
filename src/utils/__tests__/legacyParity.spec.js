// The legacy-authored corpus through adaptApiDashboard -> serializeDashboard with no edits must
// lose or corrupt nothing the legacy client depends on.
import { describe, it, expect } from 'vitest'
import { adaptApiDashboard, serializeDashboard } from '@/utils/dashboardAdapters'
import { ELEMENT_TYPES, getTypeDefByApi } from '@/utils/dashboardElements'
import { LEGACY_ELEMENTS, LEGACY_DASHBOARD } from './fixtures/legacyElements'

/** Round-trip the corpus dashboard once: adapt -> (no edits) -> serialize. */
function roundTrip(dashboard = LEGACY_DASHBOARD) {
  return serializeDashboard(adaptApiDashboard(structuredClone(dashboard)))
}

const serialized = roundTrip()
const byGuid = Object.fromEntries(serialized.elements.map((e) => [e.guid, e]))

describe('legacy corpus round-trip', () => {
  it('covers every element type in the registry', () => {
    const corpusTypes = new Set(LEGACY_ELEMENTS.map((e) => e.type))
    for (const apiType of Object.keys(ELEMENT_TYPES).map(Number)) {
      expect(corpusTypes.has(apiType), `corpus is missing element type ${apiType}`).toBe(true)
    }
  })

  it('preserves guid and type for every element', () => {
    for (const orig of LEGACY_ELEMENTS) {
      const rt = byGuid[orig.guid]
      expect(rt, `element type ${orig.type} lost from output`).toBeDefined()
      expect(rt.type).toBe(orig.type)
    }
  })

  for (const orig of LEGACY_ELEMENTS) {
    const def = getTypeDefByApi(orig.type)
    const label = `type ${orig.type} (${def.key})`

    it(`${label}: round-tripped data renders identically`, () => {
      const rt = byGuid[orig.guid]
      expect(def.fromApi(rt.data)).toEqual(def.fromApi(orig.data))
    })

    it(`${label}: keys not owned by the editor survive verbatim`, () => {
      const rt = byGuid[orig.guid]
      const written = new Set(Object.keys(def.toApi(def.fromApi(orig.data), orig.data)))
      for (const key of Object.keys(orig.data)) {
        if (written.has(key)) continue
        expect(rt.data[key], `data.${key} of ${label}`).toEqual(orig.data[key])
      }
    })

    it(`${label}: layout fields survive, spans intact, grid position added`, () => {
      const rt = byGuid[orig.guid]
      for (const key of Object.keys(orig.layout)) {
        if (key === 'horizontalSpan' || key === 'verticalSpan') continue
        expect(rt.layout[key], `layout.${key} of ${label}`).toEqual(orig.layout[key])
      }
      expect(rt.layout.horizontalSpan).toBe(orig.layout.horizontalSpan)
      expect(rt.layout.verticalSpan).toBe(orig.layout.verticalSpan ?? 1)
      expect(typeof rt.layout.gridX).toBe('number')
      expect(typeof rt.layout.gridY).toBe('number')
    })
  }

  it('keeps legacy flow order (elements sort back into original sequence)', () => {
    expect(serialized.elements.map((e) => e.guid)).toEqual(LEGACY_ELEMENTS.map((e) => e.guid))
  })

  it('is idempotent: a second adapt/serialize pass changes nothing', () => {
    const second = roundTrip({ ...serialized, name: LEGACY_DASHBOARD.name })
    expect(second.elements).toEqual(serialized.elements)
    expect(second.numColumns).toBe(serialized.numColumns)
  })

  it('passes an unknown element type through untouched', () => {
    const orig = LEGACY_ELEMENTS.find((e) => e.type === 9)
    const rt = byGuid[orig.guid]
    expect(rt.data).toEqual(orig.data)
  })

  it('preserves unmodeled per-entry fields inside dciList', () => {
    const orig = LEGACY_ELEMENTS.find((e) => e.type === 1)
    const rt = byGuid[orig.guid]
    orig.data.dciList.forEach((origDci, i) => {
      const rtDci = rt.data.dciList[i]
      for (const key of ['dciName', 'dciTag', 'lineWidth', 'showThresholds', 'instance']) {
        expect(rtDci[key], `dciList[${i}].${key}`).toEqual(origDci[key])
      }
    })
  })

  it('preserves unmodeled per-entry fields inside status-indicator elements', () => {
    const orig = LEGACY_ELEMENTS.find((e) => e.type === 6)
    const rt = byGuid[orig.guid]
    orig.data.elements.forEach((origEl, i) => {
      const rtEl = rt.data.elements[i]
      for (const key of ['dciName', 'dciDescription', 'templateConfig', 'tag']) {
        expect(rtEl[key], `elements[${i}].${key}`).toEqual(origEl[key])
      }
    })
  })

  it('reads rack view as legacy enum name and writes the name back', () => {
    const def = getTypeDefByApi(26)
    expect(def.fromApi({ view: 'FRONT' }).view).toBe(1)
    expect(def.fromApi({ view: 'BACK' }).view).toBe(2)
    expect(def.fromApi({ view: 2 }).view).toBe(2) // older int form still accepted
    expect(def.toApi(def.fromApi({ view: 'FRONT' })).view).toBe('FRONT')
    expect(def.toApi(def.fromApi({ view: 0 })).view).toBe('FULL')
  })
})

describe('registry-wide toApi/fromApi idempotence', () => {
  for (const [apiType, def] of Object.entries(ELEMENT_TYPES)) {
    it(`type ${apiType} (${def.key}): defaultData and corpus data are stable`, () => {
      for (const source of [
        structuredClone(def.defaultData ?? {}),
        structuredClone(LEGACY_ELEMENTS.find((e) => e.type === Number(apiType))?.data ?? {}),
      ]) {
        const config = def.fromApi(source)
        const merged = { ...source, ...def.toApi(config, source) }
        expect(def.fromApi(merged)).toEqual(config)
      }
    })
  }
})
