import { describe, expect, it } from 'vitest'
import { filterMapObjects, mapObjectEntries, matchesMapSearch } from '@/utils/networkMapObjectList'

describe('mapObjectEntries', () => {
  it('lists object elements only, sorted by name with numbers in order', () => {
    const map = {
      elements: [
        {
          id: 'e1',
          type: 'object',
          objectId: 10,
          objectName: 'sw-10',
          objectClass: 'Node',
          objectStatus: 0,
        },
        {
          id: 'e2',
          type: 'object',
          objectId: 2,
          objectName: 'sw-2',
          objectClass: 'Node',
          objectStatus: 2,
          objectCategory: 4,
        },
        { id: 'e3', type: 'decoration' },
      ],
    }
    expect(mapObjectEntries(map).map((e) => e.name)).toEqual(['sw-2', 'sw-10'])
    expect(mapObjectEntries(map)[0]).toEqual({
      id: 'e2',
      objectId: 2,
      name: 'sw-2',
      objectClass: 'Node',
      objectStatus: 2,
      objectCategory: 4,
    })
  })

  it('names an object it cannot read by id', () => {
    const map = { elements: [{ id: 'e1', type: 'object', objectId: 77 }] }
    expect(mapObjectEntries(map)[0]).toMatchObject({
      name: '[77]',
      objectClass: 'Node',
      objectStatus: 5,
    })
  })

  it('on a geographical map, leaves out objects without a geolocation', () => {
    const map = {
      elements: [
        {
          id: 'a',
          type: 'object',
          objectId: 1,
          objectName: 'here',
          geolocation: { lat: 1, lng: 2 },
        },
        { id: 'b', type: 'object', objectId: 2, objectName: 'nowhere' },
      ],
    }
    expect(mapObjectEntries(map, { geo: true }).map((e) => e.id)).toEqual(['a'])
    expect(mapObjectEntries(map).map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('is empty for no map', () => {
    expect(mapObjectEntries(null)).toEqual([])
    expect(mapObjectEntries({})).toEqual([])
  })
})

describe('matchesMapSearch', () => {
  it('matches a case-insensitive substring', () => {
    expect(matchesMapSearch('Core-Router', 'rout')).toBe(true)
    expect(matchesMapSearch('Core-Router', 'ROUT')).toBe(true)
    expect(matchesMapSearch('Core-Router', 'switch')).toBe(false)
    expect(matchesMapSearch(null, 'x')).toBe(false)
  })
})

describe('filterMapObjects', () => {
  it('keeps the entries whose name matches', () => {
    const entries = [{ name: 'core-router' }, { name: 'access-switch' }]
    expect(filterMapObjects(entries, 'rout')).toEqual([{ name: 'core-router' }])
  })

  it('a blank term keeps everything', () => {
    const entries = [{ name: 'a' }, { name: 'b' }]
    expect(filterMapObjects(entries, '  ')).toEqual(entries)
    expect(filterMapObjects(entries, '')).toEqual(entries)
    expect(filterMapObjects(entries, null)).toEqual(entries)
  })
})
