import { describe, expect, it } from 'vitest'
import {
  elementLayer,
  layerCounts,
  mapLayers,
  mapSupportsLayers,
  sharedLayer,
  withoutHiddenLayers,
} from '@/utils/networkMapLayers'

const el = (id, layer) => ({ id, raw: layer === undefined ? {} : { layer } })
const link = (id, from, to) => ({ id, from, to })

const MAP = {
  elements: [el('e-1', 'Power'), el('e-2', 'Power'), el('e-3', ''), el('e-4', 'Cooling')],
  links: [link('l-0', 'e-1', 'e-3'), link('l-1', 'e-3', 'e-4'), link('l-2', null, 'e-3')],
}

describe('elementLayer', () => {
  it('reads the raw layer, with no key meaning no layer', () => {
    expect(elementLayer(el('e-1', 'Power'))).toBe('Power')
    expect(elementLayer(el('e-1'))).toBe('')
    expect(elementLayer(null)).toBe('')
  })
})

describe('mapLayers', () => {
  it('lists the layers in use once each, sorted', () => {
    expect(mapLayers(MAP)).toEqual(['Cooling', 'Power'])
  })

  it('is empty for a map without layers', () => {
    expect(mapLayers({ elements: [el('e-1', ''), el('e-2')] })).toEqual([])
    expect(mapLayers(null)).toEqual([])
  })
})

describe('layerCounts', () => {
  it('counts elements per layer and those on none', () => {
    const { counts, unlayered } = layerCounts(MAP)
    expect(Object.fromEntries(counts)).toEqual({ Power: 2, Cooling: 1 })
    expect(unlayered).toBe(1)
  })

  it('is empty for no map', () => {
    expect(layerCounts(null)).toEqual({ counts: new Map(), unlayered: 0 })
  })
})

describe('mapSupportsLayers', () => {
  it('is true when the server sent the key, even empty', () => {
    expect(mapSupportsLayers({ elements: [el('e-1', '')] })).toBe(true)
  })

  it('is false for a server that does not send it, or an empty map', () => {
    expect(mapSupportsLayers({ elements: [el('e-1')] })).toBe(false)
    expect(mapSupportsLayers({ elements: [] })).toBe(false)
  })
})

describe('withoutHiddenLayers', () => {
  it('returns the map itself when nothing is hidden', () => {
    expect(withoutHiddenLayers(MAP, new Set())).toBe(MAP)
    expect(withoutHiddenLayers(MAP, new Set(['Unused']))).toBe(MAP)
  })

  it('drops the hidden elements and every link touching one', () => {
    const shown = withoutHiddenLayers(MAP, new Set(['Power']))
    expect(shown.elements.map((e) => e.id)).toEqual(['e-3', 'e-4'])
    expect(shown.links.map((l) => l.id)).toEqual(['l-1', 'l-2'])
  })

  it('keeps elements on no layer even when every layer is hidden', () => {
    const shown = withoutHiddenLayers(MAP, new Set(['Power', 'Cooling']))
    expect(shown.elements.map((e) => e.id)).toEqual(['e-3'])
    expect(shown.links.map((l) => l.id)).toEqual(['l-2'])
  })

  it('leaves the given map untouched', () => {
    withoutHiddenLayers(MAP, new Set(['Power']))
    expect(MAP.elements).toHaveLength(4)
  })
})

describe('sharedLayer', () => {
  it('names the layer every element is on', () => {
    expect(sharedLayer([el('e-1', 'Power'), el('e-2', 'Power')])).toBe('Power')
    expect(sharedLayer([el('e-1', ''), el('e-2')])).toBe('')
  })

  it('is null when they differ or nothing is given', () => {
    expect(sharedLayer([el('e-1', 'Power'), el('e-2', '')])).toBeNull()
    expect(sharedLayer([])).toBeNull()
  })
})
