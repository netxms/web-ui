import { describe, it, expect, beforeEach, vi } from 'vitest'

const bindAsync = vi.fn()
const unbindAsync = vi.fn()
const confirmRequire = vi.fn()

vi.mock('@/queries/useObjectQueries', () => ({
  useBindObjectChild: () => ({ mutateAsync: bindAsync }),
  useUnbindObjectChild: () => ({ mutateAsync: unbindAsync }),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

const { useTemplateBinding } = await import('@/composables/useTemplateBinding')

const TARGETS = [
  { id: 10, name: 'server-01' },
  { id: 11, name: 'server-02' },
]

describe('useTemplateBinding', () => {
  beforeEach(() => {
    bindAsync.mockReset()
    unbindAsync.mockReset()
    confirmRequire.mockReset()
  })

  it('binds every target to the template', async () => {
    bindAsync.mockResolvedValue({})
    const { applyTemplate } = useTemplateBinding()
    const result = await applyTemplate(5, TARGETS)

    expect(bindAsync).toHaveBeenCalledTimes(2)
    expect(bindAsync).toHaveBeenCalledWith({ parentId: 5, childId: 10 })
    expect(result).toEqual({ applied: 2, failed: 0 })
  })

  it('retries with force when the user accepts an exclusion-group conflict', async () => {
    bindAsync.mockRejectedValueOnce({ status: 409 }).mockResolvedValue({})
    confirmRequire.mockImplementation((opts) => opts.accept())

    const { applyTemplate } = useTemplateBinding()
    const result = await applyTemplate(5, [TARGETS[0]])

    expect(bindAsync).toHaveBeenNthCalledWith(2, { parentId: 5, childId: 10, force: true })
    expect(result).toEqual({ applied: 1, failed: 0 })
  })

  it('skips the target when the user declines the conflict', async () => {
    bindAsync.mockRejectedValueOnce({ status: 409 })
    confirmRequire.mockImplementation((opts) => opts.reject())

    const { applyTemplate } = useTemplateBinding()
    const result = await applyTemplate(5, [TARGETS[0]])

    expect(bindAsync).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ applied: 0, failed: 0 })
  })

  it('skips the target and keeps going when the conflict dialog is dismissed', async () => {
    bindAsync.mockRejectedValueOnce({ status: 409 }).mockResolvedValue({})
    // Escape / close icon: PrimeVue calls onHide only, neither accept nor reject.
    confirmRequire.mockImplementation((opts) => opts.onHide())

    const { applyTemplate } = useTemplateBinding()
    const result = await applyTemplate(5, TARGETS)

    expect(bindAsync).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ applied: 1, failed: 0 })
  })

  it('counts a failing target instead of aborting the rest', async () => {
    bindAsync.mockRejectedValueOnce({ status: 500 }).mockResolvedValue({})
    const { applyTemplate } = useTemplateBinding()
    const result = await applyTemplate(5, TARGETS)

    expect(bindAsync).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ applied: 1, failed: 1 })
  })

  it('unbinds every template from every target, carrying removeDci', async () => {
    unbindAsync.mockResolvedValue({})
    const { removeTemplate } = useTemplateBinding()
    const result = await removeTemplate([5, 6], TARGETS, { removeDci: true })

    expect(unbindAsync).toHaveBeenCalledTimes(4)
    expect(unbindAsync).toHaveBeenCalledWith({ parentId: 5, childId: 10, removeDci: true })
    expect(result).toEqual({ removed: 4, failed: 0 })
  })
})
