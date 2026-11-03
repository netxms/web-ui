import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/serverApi', () => ({
  getServerInfo: vi.fn(),
  getServerStatus: vi.fn(),
}))

const { serverKeys, useClientConfigurationHints } = await import('../useServerQueries')

// Hints are human-typed config strings. Like the Java client's
// `getClientConfigurationHintAsBoolean`, "true"/"yes" and non-zero numbers are true, and
// anything unreadable falls back to the caller's default.
describe('useClientConfigurationHints', () => {
  let queryClient
  let wrapper

  function withHints(hints) {
    queryClient.setQueryData(serverKeys.info(), {
      version: '5.2.0',
      clientConfigurationHints: hints,
    })
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = useClientConfigurationHints()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('reads a string hint and falls back when it is absent', () => {
    const { hint } = withHints({ BaseURL: 'https://nms.example.com' })
    expect(hint('BaseURL')).toBe('https://nms.example.com')
    expect(hint('AclReportVariant', 'standard')).toBe('standard')
    expect(hint('AclReportVariant')).toBeNull()
  })

  it('treats an empty hint as unset', () => {
    const { hint } = withHints({ BaseURL: '' })
    expect(hint('BaseURL', 'fallback')).toBe('fallback')
  })

  it('reads booleans written as numbers and as words', () => {
    const { hintAsBoolean } = withHints({
      A: '1',
      B: '0',
      C: 'true',
      D: 'FALSE',
      E: 'yes',
      F: ' no ',
    })
    expect(hintAsBoolean('A')).toBe(true)
    expect(hintAsBoolean('B')).toBe(false)
    expect(hintAsBoolean('C')).toBe(true)
    expect(hintAsBoolean('D')).toBe(false)
    expect(hintAsBoolean('E')).toBe(true)
    expect(hintAsBoolean('F')).toBe(false)
  })

  it('falls back rather than to false for a missing or unreadable boolean', () => {
    const { hintAsBoolean } = withHints({ Broken: 'perhaps' })
    expect(hintAsBoolean('EnableWelcomePage', true)).toBe(true)
    expect(hintAsBoolean('Broken', true)).toBe(true)
  })

  it('reads integer hints, falling back on anything unparseable', () => {
    const { hintAsInt } = withHints({ Timeout: ' 300 ', Bad: 'soon' })
    expect(hintAsInt('Timeout')).toBe(300)
    expect(hintAsInt('Bad', 60)).toBe(60)
    expect(hintAsInt('Missing', 42)).toBe(42)
  })

  it('reports no hints when the server omits the field entirely', () => {
    queryClient.setQueryData(serverKeys.info(), { version: '5.2.0' })
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = useClientConfigurationHints()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    expect(api.hints.value).toEqual({})
    expect(api.hintAsBoolean('EnableWelcomePage', true)).toBe(true)
  })
})
