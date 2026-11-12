// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

const hooks = { leave: null, update: null }
const confirmRequire = vi.fn()

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (fn) => {
    hooks.leave = fn
  },
  onBeforeRouteUpdate: (fn) => {
    hooks.update = fn
  },
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

const { useUnsavedChangesGuard } = await import('../useUnsavedChangesGuard')

describe('useUnsavedChangesGuard', () => {
  const dirty = ref(false)
  const isDirty = computed(() => dirty.value)

  beforeEach(() => {
    hooks.leave = null
    hooks.update = null
    dirty.value = false
    confirmRequire.mockReset()
  })

  it('guards only route leaves by default', () => {
    useUnsavedChangesGuard(isDirty)
    expect(hooks.leave).toBeTypeOf('function')
    expect(hooks.update).toBeNull()
  })

  it('lets a clean view go without asking', () => {
    useUnsavedChangesGuard(isDirty, { includeRouteUpdates: true })
    expect(hooks.update({ path: '/configuration/x' }, { path: '/configuration/x/3' })).toBe(true)
    expect(confirmRequire).not.toHaveBeenCalled()
  })

  it('asks before a path-changing update leaves a dirty view, and follows the answer', async () => {
    useUnsavedChangesGuard(isDirty, { includeRouteUpdates: true })
    dirty.value = true

    const stay = hooks.update({ path: '/configuration/x' }, { path: '/configuration/x/3' })
    confirmRequire.mock.calls[0][0].reject()
    expect(await stay).toBe(false)

    const leave = hooks.update({ path: '/configuration/y' }, { path: '/configuration/x/3' })
    confirmRequire.mock.calls[1][0].accept()
    expect(await leave).toBe(true)
  })

  it('ignores updates that keep the path', () => {
    useUnsavedChangesGuard(isDirty, { includeRouteUpdates: true })
    dirty.value = true
    expect(hooks.update({ path: '/a', query: { q: 1 } }, { path: '/a' })).toBe(true)
    expect(confirmRequire).not.toHaveBeenCalled()
  })
})
