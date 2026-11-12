// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const {
  getBusinessServiceChecks,
  createBusinessServiceCheck,
  updateBusinessServiceCheck,
  deleteBusinessServiceCheck,
} = await import('../businessServicesApi')

beforeEach(() => vi.clearAllMocks())

describe('businessServicesApi checks', () => {
  it('lists checks of the object and normalizes them', async () => {
    client.get.mockResolvedValue([{ id: 3, type: 'object', script: null, prototypeServiceId: 9 }])

    const [check] = await getBusinessServiceChecks(42)

    expect(client.get).toHaveBeenCalledWith('/v1/objects/42/business-service-checks')
    expect(check).toMatchObject({ id: 3, type: 'object', script: '', autoCreated: true })
  })

  it('answers an empty list for a non-array body', async () => {
    client.get.mockResolvedValue(null)
    expect(await getBusinessServiceChecks(42)).toEqual([])
  })

  it('creates with POST and updates with PATCH, not PUT', async () => {
    client.post.mockResolvedValue({ id: 5 })
    client.patch.mockResolvedValue({ id: 5, description: 'x' })

    await createBusinessServiceCheck(42, { type: 'script' })
    const updated = await updateBusinessServiceCheck(42, 5, { description: 'x' })

    expect(client.post).toHaveBeenCalledWith('/v1/objects/42/business-service-checks', {
      type: 'script',
    })
    expect(client.patch).toHaveBeenCalledWith('/v1/objects/42/business-service-checks/5', {
      description: 'x',
    })
    expect(updated.description).toBe('x')
  })

  it('deletes by check id', async () => {
    await deleteBusinessServiceCheck(42, 5)
    expect(client.del).toHaveBeenCalledWith('/v1/objects/42/business-service-checks/5')
  })
})
