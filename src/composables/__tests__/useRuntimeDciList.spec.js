import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, ref, toValue } from 'vue'
import { mount } from '@vue/test-utils'
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'

/** What the mocked current-values query was asked for, and the data it hands back. */
let queryCall
let valuesData

vi.mock('@/queries/useObjectQueries', () => ({
  useDciCurrentValues: (objectId, options) => {
    queryCall = { objectId, options }
    return { data: valuesData, isLoading: ref(false), error: ref(null) }
  },
}))

const { useRuntimeDciList } = await import('../useRuntimeDciList')
const { provideDashboardContext } = await import('../useDashboardContext')

const CONCRETE = { nodeId: 7, dciId: 70, name: 'Fixed' }
const TEMPLATE = {
  nodeId: CONTEXT_OBJECT_ID,
  dciId: 0,
  name: '',
  dciName: '',
  dciDescription: 'CPU usage',
  dciTag: '',
  regexMatch: false,
  multiMatch: false,
}

function run(dciList, { contextObjectId } = {}) {
  const seen = {}
  const Child = defineComponent({
    setup() {
      Object.assign(seen, useRuntimeDciList(ref({ dciList })))
      return () => h('span')
    },
  })
  const Host = defineComponent({
    setup() {
      if (contextObjectId) provideDashboardContext({ dashboardId: 1, contextObjectId })
      return () => h(Child)
    },
  })
  mount(Host)
  return seen
}

beforeEach(() => {
  queryCall = null
  valuesData = ref(null)
})

describe('useRuntimeDciList', () => {
  it('passes a concrete-only list through without an enabled query', () => {
    const seen = run([CONCRETE], { contextObjectId: 42 })
    expect(toValue(queryCall.options.enabled)).toBe(false)
    expect(seen.dciList.value).toEqual([CONCRETE])
  })

  it('resolves template entries once the context values arrive', async () => {
    const seen = run([CONCRETE, TEMPLATE], { contextObjectId: 42 })
    expect(toValue(queryCall.options.enabled)).toBe(true)
    expect(toValue(queryCall.objectId)).toBe(42)
    expect(seen.dciList.value).toEqual([CONCRETE])

    valuesData.value = { values: [{ id: 5, name: 'System.CPU', description: 'CPU usage' }] }
    await nextTick()
    expect(seen.dciList.value).toHaveLength(2)
    expect(seen.dciList.value[1]).toMatchObject({ nodeId: 42, dciId: 5, name: 'CPU usage' })
  })

  it('drops template entries without a context object', () => {
    const seen = run([CONCRETE, TEMPLATE])
    expect(toValue(queryCall.options.enabled)).toBe(false)
    expect(seen.dciList.value).toEqual([CONCRETE])
  })

  it('reports an invalid pattern while the concrete entries still render', async () => {
    const broken = { ...TEMPLATE, dciDescription: '', dciName: '([', regexMatch: true }
    const seen = run([CONCRETE, broken], { contextObjectId: 42 })
    valuesData.value = { values: [{ id: 5, name: 'x', description: 'y' }] }
    await nextTick()
    expect(seen.resolveError.value).toBeInstanceOf(SyntaxError)
    expect(seen.dciList.value).toEqual([CONCRETE])
  })
})
