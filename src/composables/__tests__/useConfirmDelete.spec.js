// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useConfirmDelete } from '../useConfirmDelete'

const require = vi.fn()
const add = vi.fn()

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add }) }))

beforeEach(() => {
  require.mockReset()
  add.mockReset()
})

function start(overrides = {}) {
  const run = vi.fn().mockResolvedValue(undefined)
  const scope = effectScope()
  const confirmDelete = scope.run(() => useConfirmDelete())
  const result = confirmDelete({
    message: 'Delete "x"?',
    run,
    successDetail: '"x" deleted.',
    failureDetail: 'Failed to delete x.',
    ...overrides,
  })
  const dialog = require.mock.calls[0][0]
  return { run: overrides.run ?? run, result, dialog, scope }
}

describe('useConfirmDelete', () => {
  it('asks with the given message before deleting anything', () => {
    const { run, dialog } = start()

    expect(dialog.message).toBe('Delete "x"?')
    expect(dialog.acceptLabel).toBe('Delete')
    expect(run).not.toHaveBeenCalled()
  })

  it('deletes nothing and resolves false when the dialog is cancelled', async () => {
    const { run, result, dialog } = start()

    dialog.reject()

    await expect(result).resolves.toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it('deletes nothing and resolves false when the dialog is dismissed', async () => {
    const { run, result, dialog } = start()

    dialog.onHide()

    await expect(result).resolves.toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('deletes, reports success and resolves true on accept', async () => {
    const { run, result, dialog } = start()

    await dialog.accept()

    await expect(result).resolves.toBe(true)
    expect(run).toHaveBeenCalledOnce()
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', detail: '"x" deleted.' }),
    )
  })

  it('resolves false when the caller is gone by the time the delete completes', async () => {
    let finish
    const { result, dialog, scope } = start({
      run: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    })

    const accepted = dialog.accept()
    scope.stop()
    finish()
    await accepted

    await expect(result).resolves.toBe(false)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }))
  })

  it('reports the errorDetail text and resolves false when the delete fails', async () => {
    const err = Object.assign(new Error('Conflict'), { status: 409 })
    const { result, dialog } = start({
      run: vi.fn().mockRejectedValue(err),
      errorDetail: (e) => (e.status === 409 ? '"x" is in use.' : null),
    })

    await dialog.accept()

    await expect(result).resolves.toBe(false)
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'error', detail: '"x" is in use.' }),
    )
  })

  it('falls back to the error message when errorDetail has nothing to say', async () => {
    const { dialog } = start({
      run: vi.fn().mockRejectedValue(new Error('Server unavailable')),
      errorDetail: () => null,
    })

    await dialog.accept()

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Server unavailable' }))
  })

  it('falls back to the failure text when the error has no message', async () => {
    const { result, dialog } = start({ run: vi.fn().mockRejectedValue({ status: 500 }) })

    await dialog.accept()

    await expect(result).resolves.toBe(false)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Failed to delete x.' }))
  })
})
