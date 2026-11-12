// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  getBlob: vi.fn(),
  post: vi.fn(),
}))

const client = await import('../client')
const { previewDataExport, startDataExport, getDataExportState, downloadDataExportFile } =
  await import('../dataExportApi')

beforeEach(() => vi.clearAllMocks())

describe('dataExportApi', () => {
  it('previews a selection, keeping a 403 out of the global toast', async () => {
    client.post.mockResolvedValue({ metrics: [{ ownerId: 1, dciId: 2 }], skippedCount: 3 })

    const result = await previewDataExport({ rootObjectId: 1 }, { signal: 'sig' })

    expect(client.post).toHaveBeenCalledWith(
      '/v1/data-export/metrics',
      { rootObjectId: 1 },
      { signal: 'sig', suppressForbidden: true },
    )
    expect(result).toEqual({ metrics: [{ ownerId: 1, dciId: 2 }], skippedCount: 3 })
  })

  it('answers an empty preview for an empty body', async () => {
    client.post.mockResolvedValue(null)
    expect(await previewDataExport({})).toEqual({ metrics: [], skippedCount: 0 })
  })

  it('starts an export and returns the task id', async () => {
    client.post.mockResolvedValue({ taskId: 77 })

    expect(await startDataExport({ rootObjectId: 1 })).toBe(77)
    expect(client.post).toHaveBeenCalledWith(
      '/v1/data-export',
      { rootObjectId: 1 },
      { suppressForbidden: true },
    )
  })

  it('reads the task state', async () => {
    client.get.mockResolvedValue({ taskId: 77, state: 'running' })
    await getDataExportState(77, { signal: 'sig' })
    expect(client.get).toHaveBeenCalledWith('/v1/data-export/77', { signal: 'sig' })
  })

  it('downloads either file as a blob', async () => {
    client.getBlob.mockResolvedValue(new Blob(['x']))
    await downloadDataExportFile(77, 'archive')
    await downloadDataExportFile(77, 'mapping')
    expect(client.getBlob).toHaveBeenNthCalledWith(1, '/v1/data-export/77/file?type=archive')
    expect(client.getBlob).toHaveBeenNthCalledWith(2, '/v1/data-export/77/file?type=mapping')
  })
})
