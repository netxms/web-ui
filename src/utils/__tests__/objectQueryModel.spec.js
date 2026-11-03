import { describe, it, expect } from 'vitest'
import { SEARCH_MODE } from '../objectQueryScript'
import {
  RESULT_LIMIT,
  createModel,
  fromQuery,
  isBlank,
  toQuery,
  toRequest,
} from '../objectQueryModel'

describe('toQuery / fromQuery', () => {
  it('omits defaults so a simple search produces a short link', () => {
    const model = { ...createModel(), text: 'core' }
    expect(toQuery(model)).toEqual({ text: 'core' })
  })

  it('round trips a full filter', () => {
    const model = {
      ...createModel(),
      text: 'core-sw',
      mode: SEARCH_MODE.REGEXP,
      classes: ['Node', 'Interface'],
      zones: [0, 5],
      ipFrom: '10.0.0.1',
      ipTo: '10.0.0.99',
      rootObjectId: 12,
    }
    expect(fromQuery(toQuery(model))).toEqual(model)
  })

  it('serializes a script instead of the form fields when one is set', () => {
    const model = { ...createModel(), text: 'ignored', script: 'type == NODE' }
    expect(toQuery(model)).toEqual({ q: 'type == NODE' })
  })

  it('keeps the search root alongside a script', () => {
    const model = { ...createModel(), script: 'true', rootObjectId: 7 }
    expect(toQuery(model)).toEqual({ q: 'true', root: '7' })
  })

  it('trims whitespace out of the link', () => {
    const model = { ...createModel(), text: '  core  ', ipFrom: ' 10.0.0.1 ', ipTo: ' 10.0.0.2 ' }
    expect(toQuery(model)).toEqual({ text: 'core', from: '10.0.0.1', to: '10.0.0.2' })
  })

  it('falls back to defaults on a hand-edited or truncated URL', () => {
    const model = fromQuery({ mode: 'nonsense', zone: 'a,3,b', root: '-1', class: '' })
    expect(model.mode).toBe(SEARCH_MODE.NORMAL)
    expect(model.zones).toEqual([3])
    expect(model.rootObjectId).toBe(0)
    expect(model.classes).toEqual([])
  })

  it('reads an empty query as a blank model', () => {
    expect(fromQuery()).toEqual(createModel())
  })
})

describe('isBlank', () => {
  it('is true only when nothing would narrow the search', () => {
    expect(isBlank(createModel())).toBe(true)
    expect(isBlank({ ...createModel(), text: 'core' })).toBe(false)
    expect(isBlank({ ...createModel(), classes: ['Node'] })).toBe(false)
    expect(isBlank({ ...createModel(), script: 'true' })).toBe(false)
  })
})

describe('toRequest', () => {
  it('returns null for a blank model, so an empty form runs nothing', () => {
    expect(toRequest(createModel())).toBeNull()
  })

  it('names the fields the standard columns need for a compiled filter', () => {
    const request = toRequest({ ...createModel(), classes: ['Node'] })
    expect(request.query).toBe('type == NODE')
    expect(request.fields).toEqual(['zoneUIN'])
    expect(request.readAllFields).toBeUndefined()
    expect(request.limit).toBe(RESULT_LIMIT)
  })

  it('asks for every computed field when the script is hand written', () => {
    // Without readAllFields the server returns no extra fields at all, so a script that
    // builds its own columns would come back with none of them.
    const request = toRequest({ ...createModel(), script: 'type == NODE', rootObjectId: 3 })
    expect(request).toEqual({
      query: 'type == NODE',
      readAllFields: true,
      rootObjectId: 3,
      limit: RESULT_LIMIT,
    })
  })
})
