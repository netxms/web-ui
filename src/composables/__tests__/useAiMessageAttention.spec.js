import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useAiMessageAttention } from '@/composables/useAiMessageAttention'

const data = ref([])
const can = ref({})
const components = ref([])
let queryOptions

vi.mock('@/queries/useAiQueries', () => ({
  useAiMessages: (options) => {
    queryOptions = options
    return { data }
  },
}))
vi.mock('@/composables/usePermissions', () => ({ usePermissions: () => ({ can }) }))
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: (id) => components.value.includes(id) }),
}))

const FUTURE = '2099-01-01T00:00:00Z'

beforeEach(() => {
  can.value = { useAiAssistant: true }
  components.value = ['AI-ASSISTANT']
  data.value = [
    { type: 'approvalRequest', status: 'read', expirationTime: FUTURE },
    { type: 'alert', status: 'pending', expirationTime: FUTURE },
    { type: 'informational', status: 'read', expirationTime: FUTURE },
    { type: 'approvalRequest', status: 'approved', expirationTime: FUTURE },
  ]
})

describe('useAiMessageAttention', () => {
  it('counts undecided requests and unread messages', () => {
    expect(useAiMessageAttention().count.value).toBe(2)
    expect(queryOptions.enabled.value).toBe(true)
  })

  it('polls for an account that reaches the perspective through either right', () => {
    can.value = { viewEventLog: true }

    useAiMessageAttention()

    expect(queryOptions.enabled.value).toBe(true)
  })

  it('does not poll without the rights, or on a server without the assistant', () => {
    can.value = {}
    expect(useAiMessageAttention().count.value).toBe(0)
    expect(queryOptions.enabled.value).toBe(false)

    can.value = { useAiAssistant: true }
    components.value = ['CORE']
    expect(useAiMessageAttention().count.value).toBe(0)
    expect(queryOptions.enabled.value).toBe(false)
  })
})
