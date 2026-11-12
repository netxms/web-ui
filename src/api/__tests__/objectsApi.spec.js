// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal()),
  get: (...args) => get(...args),
  post: (...args) => post(...args),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: 'test-session', logout: vi.fn() }),
}))

const { getObject } = await import('../objectsApi')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('getObject', () => {
  it('batches concurrent calls into one POST /v1/objects/details', async () => {
    post.mockImplementation(async (path, body) => ({
      objects: body.ids.map((id) => ({ id })),
      notFound: [],
      denied: [],
    }))

    const docs = await Promise.all([getObject(1), getObject('2')])

    expect(docs.map((d) => d.id)).toEqual([1, 2])
    expect(post).toHaveBeenCalledTimes(1)
    const [path, body, options] = post.mock.calls[0]
    expect(path).toBe('/v1/objects/details')
    expect(body).toEqual({ ids: [1, 2] })
    // A 403 on this POST means "delegate unreadable" and is handled by falling back;
    // the global forbidden toast must not fire for it.
    expect(options.suppressForbidden).toBe(true)
    expect(get).not.toHaveBeenCalled()
  })

  it('sends the delegate for delegated reads', async () => {
    post.mockResolvedValue({ objects: [{ id: 5, partial: true }], notFound: [], denied: [] })

    await getObject(5, { delegate: 700 })

    expect(post.mock.calls[0][1]).toEqual({ ids: [5], delegate: 700 })
  })

  it('uses the single GET for an id that is not a positive integer', async () => {
    get.mockResolvedValue({ id: 0 })

    await getObject('abc')

    expect(get).toHaveBeenCalledWith('/v1/objects/abc', undefined)
    expect(post).not.toHaveBeenCalled()
  })
})
