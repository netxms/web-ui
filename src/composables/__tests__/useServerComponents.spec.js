import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const serverInfo = ref(undefined)
const isLoading = ref(false)

vi.mock('@/queries/useServerQueries', () => ({
  useServerInfo: () => ({ data: serverInfo, isLoading }),
}))

const { useServerComponents } = await import('@/composables/useServerComponents')
const { SERVER_COMPONENTS } = await import('@/config/serverComponents')

describe('useServerComponents', () => {
  beforeEach(() => {
    serverInfo.value = undefined
    isLoading.value = false
  })

  it('reports a registered component', () => {
    serverInfo.value = { components: ['CORE', SERVER_COMPONENTS.AI_ASSISTANT] }
    const { has, components } = useServerComponents()
    expect(has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(true)
    expect(components.value).toEqual(['CORE', SERVER_COMPONENTS.AI_ASSISTANT])
  })

  it('reports a component the server did not register', () => {
    serverInfo.value = { components: ['CORE'] }
    expect(useServerComponents().has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(false)
  })

  it('answers false while server-info is still in flight', () => {
    isLoading.value = true
    expect(useServerComponents().has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(false)
  })

  it('answers false when the request failed outright', () => {
    serverInfo.value = undefined
    expect(useServerComponents().has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(false)
  })

  it('treats a server that omits the field as having no optional components', () => {
    // Servers too old to send `components` predate every component this gate guards.
    serverInfo.value = { version: '4.5.6' }
    const { has, components } = useServerComponents()
    expect(components.value).toEqual([])
    expect(has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(false)
  })

  it('ignores non-string entries rather than throwing on a malformed response', () => {
    serverInfo.value = { components: [null, 42, { id: 'CORE' }, SERVER_COMPONENTS.AI_ASSISTANT] }
    const { components, has } = useServerComponents()
    expect(components.value).toEqual([SERVER_COMPONENTS.AI_ASSISTANT])
    expect(has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(true)
  })

  it('tracks a late response without needing a remount', () => {
    const { has } = useServerComponents()
    expect(has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(false)
    serverInfo.value = { components: [SERVER_COMPONENTS.AI_ASSISTANT] }
    expect(has(SERVER_COMPONENTS.AI_ASSISTANT)).toBe(true)
  })
})
