// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/client', () => ({
  get: vi.fn(),
  getBlob: vi.fn(),
  put: vi.fn(),
  postRaw: vi.fn(),
  putRaw: vi.fn(),
  del: vi.fn(),
}))

import * as client from '@/api/client'
import * as api from '@/api/imageLibraryApi'

const IMAGE = {
  guid: 'g1',
  name: 'Switch',
  category: 'Network',
  mimeType: 'image/png',
  isProtected: false,
}

describe('imageLibraryApi', () => {
  let created

  beforeEach(() => {
    vi.clearAllMocks()
    created = 0
    globalThis.URL.createObjectURL = vi.fn(() => `blob:url-${++created}`)
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('getImages fetches metadata only and never touches the blob endpoint', async () => {
    client.get.mockResolvedValue([IMAGE, { ...IMAGE, guid: 'g2', name: 'Router' }])

    const images = await api.getImages()

    expect(client.get).toHaveBeenCalledTimes(1)
    expect(client.get).toHaveBeenCalledWith('/v1/image-library')
    expect(client.getBlob).not.toHaveBeenCalled()
    expect(images).toEqual([
      { id: 'g1', name: 'Switch', category: 'Network', mimeType: 'image/png', protected: false },
      { id: 'g2', name: 'Router', category: 'Network', mimeType: 'image/png', protected: false },
    ])
  })

  it('getImageDataUrl fetches the bytes once per guid and reuses the blob URL', async () => {
    client.getBlob.mockResolvedValue(new Blob(['x']))

    const first = await api.getImageDataUrl('cached-guid')
    const second = await api.getImageDataUrl('cached-guid')

    expect(first).toBe(second)
    expect(client.getBlob).toHaveBeenCalledTimes(1)
    expect(client.getBlob).toHaveBeenCalledWith('/v1/image-library/cached-guid/data')
  })

  it('getImageBlobInfo reports size and type of resolved bytes, and forgets them on delete', async () => {
    client.getBlob.mockResolvedValue(new Blob(['12345'], { type: 'image/svg+xml' }))
    expect(api.getImageBlobInfo('sized')).toBeNull()

    await api.getImageDataUrl('sized')
    expect(api.getImageBlobInfo('sized')).toEqual({ size: 5, type: 'image/svg+xml' })

    client.del.mockResolvedValue(null)
    await api.deleteImage('sized')
    expect(api.getImageBlobInfo('sized')).toBeNull()
  })

  it('getImageDataUrl resolves to null instead of throwing when the fetch fails', async () => {
    client.getBlob.mockRejectedValue(new Error('502'))
    await expect(api.getImageDataUrl('broken-guid')).resolves.toBeNull()
  })

  it('getImageDataUrls caps how many blob requests are in flight at once', async () => {
    let inFlight = 0
    let peak = 0
    client.getBlob.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return new Blob(['x'])
    })

    const guids = Array.from({ length: 12 }, (_, i) => `bulk-${i}`)
    const map = await api.getImageDataUrls(guids)

    expect(Object.keys(map)).toHaveLength(12)
    expect(client.getBlob).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('getImageDataUrls de-duplicates repeated guids', async () => {
    client.getBlob.mockResolvedValue(new Blob(['x']))

    const map = await api.getImageDataUrls(['dup', 'dup', 'dup'])

    expect(client.getBlob).toHaveBeenCalledTimes(1)
    expect(Object.keys(map)).toEqual(['dup'])
  })

  it('updateImage revokes the stale blob URL so replaced bytes are re-fetched', async () => {
    client.getBlob.mockResolvedValue(new Blob(['x']))
    const before = await api.getImageDataUrl('replaced')

    client.put.mockResolvedValue({ ...IMAGE, guid: 'replaced' })
    const result = await api.updateImage('replaced', { name: 'New name' })

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(before)
    expect(result.dataUrl).not.toBe(before)
    expect(client.getBlob).toHaveBeenCalledTimes(2)
  })

  it('deleteImage revokes the cached blob URL', async () => {
    client.getBlob.mockResolvedValue(new Blob(['x']))
    const url = await api.getImageDataUrl('doomed')

    client.del.mockResolvedValue(null)
    await api.deleteImage('doomed')

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })
})
