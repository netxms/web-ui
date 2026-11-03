import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive } from 'vue'

// The real auth store needs an injection context. `reactive` unwraps the ref the way a Pinia
// store instance does.
const user = ref(null)
const authStoreStub = reactive({ user })
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authStoreStub,
}))

const { usePermissions } = await import('@/composables/usePermissions')
const { SYSTEM_RIGHTS: R } = await import('@/auth/systemRights')

// The server sends `systemAccessRights` as a JSON number.
function loginWithRights(mask) {
  user.value = { systemAccessRights: mask }
}

beforeEach(() => {
  user.value = null
})

describe('hasRight', () => {
  it('resolves low bits', () => {
    loginWithRights(Number(1n << BigInt(R.SERVER_CONFIG)))
    const { hasRight } = usePermissions()
    expect(hasRight(R.SERVER_CONFIG)).toBe(true)
    expect(hasRight(R.MANAGE_USERS)).toBe(false)
  })

  it('resolves bits past Number precision', () => {
    loginWithRights(Number(1n << BigInt(R.MANAGE_AI_OPERATORS)))
    const { hasRight } = usePermissions()
    expect(hasRight(R.MANAGE_AI_OPERATORS)).toBe(true)
    // Neighbouring high bits must not bleed through.
    expect(hasRight(R.SCAN_NETWORK)).toBe(false)
    expect(hasRight(R.MANAGE_AI_SKILLS)).toBe(false)
  })

  it('treats an anonymous session as having no rights', () => {
    const { hasRight } = usePermissions()
    expect(hasRight(R.MANAGE_AI_OPERATORS)).toBe(false)
    expect(hasRight(R.MANAGE_USERS)).toBe(false)
  })
})

describe('can', () => {
  it('exposes the AI operator flag off the same bit', () => {
    loginWithRights(Number(1n << BigInt(R.MANAGE_AI_OPERATORS)))
    const { can } = usePermissions()
    expect(can.value.manageAiOperators).toBe(true)
    expect(can.value.manageAiSkills).toBe(false)
  })

  it('gates manageEpp on the EPP right', () => {
    loginWithRights(Number(1n << BigInt(R.EPP)))
    const { can } = usePermissions()
    expect(can.value.manageEpp).toBe(true)
  })

  it('denies manageEpp without the EPP right', () => {
    loginWithRights(Number(1n << BigInt(R.MANAGE_USERS)))
    const { can } = usePermissions()
    expect(can.value.manageEpp).toBe(false)
  })

  it('denies manageEpp for an anonymous session', () => {
    const { can } = usePermissions()
    expect(can.value.manageEpp).toBe(false)
  })

  it('resolves several high rights from one combined mask', () => {
    const mask =
      (1n << BigInt(R.MANAGE_AI_OPERATORS)) |
      (1n << BigInt(R.SCAN_NETWORK)) |
      (1n << BigInt(R.MANAGE_AI_SKILLS))
    loginWithRights(Number(mask))
    const { can } = usePermissions()
    expect(can.value.manageAiOperators).toBe(true)
    expect(can.value.scanNetwork).toBe(true)
    expect(can.value.manageAiSkills).toBe(true)
    expect(can.value.useAiAssistant).toBe(false)
    expect(can.value.configureServer).toBe(false)
  })
})
