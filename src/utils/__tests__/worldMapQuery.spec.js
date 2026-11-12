// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { toMapElements, worldMapRequest, WORLD_MAP_QUERY } from '../worldMapQuery'

describe('worldMapRequest', () => {
  it('asks for the coordinate globals the script assigns', () => {
    expect(worldMapRequest().fields).toEqual(['lat', 'lon'])
  })

  // GeoLocation::isValid() is true for the UNSET location (GL_UNSET = 0) too.
  it('filters on the location type, not on isValid', () => {
    expect(WORLD_MAP_QUERY).toContain('geolocation->type != 0')
    expect(WORLD_MAP_QUERY).not.toContain('isValid')
  })

  // A bare trailing expression is the script's value only when it is the whole body; after
  // the assignments it is a syntax error, and `expr;` returns NULL.
  it('returns the filter explicitly, and terminates every statement', () => {
    const lines = WORLD_MAP_QUERY.split('\n')
    expect(lines.at(-1)).toMatch(/^return .+;$/)
    for (const line of lines) expect(line.endsWith(';')).toBe(true)
  })

  // The server reads requested fields from globals; a bare assignment creates a local,
  // discarded on return, and the coordinates come back empty.
  it('declares the coordinate fields global, where the server looks for them', () => {
    for (const field of worldMapRequest().fields) {
      expect(WORLD_MAP_QUERY).toMatch(new RegExp(`^global ${field} = `, 'm'))
    }
  })
})

describe('toMapElements', () => {
  const result = {
    object: { id: 12, name: 'branch-fw', class: 'Node', status: 2 },
    fields: { lat: '56.9496', lon: '24.1052' },
  }

  it('maps a hit onto the canvas element shape', () => {
    expect(toMapElements([result])).toEqual([
      {
        id: '12',
        type: 'object',
        objectId: 12,
        objectName: 'branch-fw',
        objectClass: 'Node',
        objectStatus: 2,
        geolocation: { lat: 56.9496, lng: 24.1052 },
      },
    ])
  })

  // Query fields always arrive as strings, so a bad one parses to NaN rather than throwing.
  it('drops an object whose coordinates do not parse', () => {
    expect(toMapElements([{ ...result, fields: { lat: '', lon: '24.1' } }])).toEqual([])
    expect(toMapElements([{ ...result, fields: {} }])).toEqual([])
  })

  it('keeps zero coordinates, which are a real position', () => {
    const [element] = toMapElements([{ ...result, fields: { lat: '0', lon: '0' } }])
    expect(element.geolocation).toEqual({ lat: 0, lng: 0 })
  })

  it('survives an empty or malformed result set', () => {
    expect(toMapElements(undefined)).toEqual([])
    expect(toMapElements([{ fields: { lat: '1', lon: '2' } }])).toEqual([])
  })
})
