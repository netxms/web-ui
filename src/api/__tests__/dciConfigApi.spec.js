// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal()),
  get: (...args) => get(...args),
  post: (...args) => post(...args),
  patch: (...args) => patch(...args),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: 'test-session', logout: vi.fn() }),
}))

const {
  listDciConfig,
  getDciConfig,
  createDci,
  updateDci,
  getAvailableMetrics,
  regenerateAnomalyProfile,
} = await import('../dciConfigApi')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
})

describe('getAvailableMetrics', () => {
  it.each(['agent', 'device-driver'])('reads the %s lists of an object', async (source) => {
    get.mockResolvedValueOnce({ metrics: [] })
    expect(await getAvailableMetrics(7, source)).toEqual({ metrics: [] })
    expect(get).toHaveBeenCalledWith(`/v1/objects/7/data-collection/available-metrics/${source}`)
  })
})

// DS_NATIVE_AGENT is "nxagent" on servers before netxms bafe8323da and "agent" after; each
// rejects the other's spelling on write.
describe('agent origin across the rename', () => {
  it('reads either spelling as "agent"', async () => {
    get.mockResolvedValueOnce([
      { id: 1, origin: 'nxagent' },
      { id: 2, origin: 'agent' },
      { id: 3, origin: 'snmp' },
    ])
    const list = await listDciConfig(7)
    expect(list.map((d) => d.origin)).toEqual(['agent', 'agent', 'snmp'])

    get.mockResolvedValueOnce({ id: 1, origin: 'nxagent', name: 'Agent.Version' })
    expect(await getDciConfig(7, 1)).toEqual({ id: 1, origin: 'agent', name: 'Agent.Version' })
  })

  it('writes the agent origin as its DS_* code, which both kinds of server accept', async () => {
    post.mockResolvedValueOnce({ id: 9, origin: 'nxagent' })
    const created = await createDci(7, { type: 'item', name: 'Agent.Version', origin: 'agent' })
    expect(post).toHaveBeenCalledWith('/v1/objects/7/data-collection/configuration', {
      type: 'item',
      name: 'Agent.Version',
      origin: 1,
    })
    expect(created.origin).toBe('agent')

    patch.mockResolvedValueOnce({ id: 9, origin: 'agent' })
    await updateDci(7, 9, { origin: 'agent', description: 'x' })
    expect(patch).toHaveBeenCalledWith('/v1/objects/7/data-collection/configuration/9', {
      origin: 1,
      description: 'x',
    })
  })

  it('writes other origins by name', async () => {
    post.mockResolvedValueOnce({ id: 10, origin: 'snmp' })
    await createDci(7, { origin: 'snmp' })
    expect(post.mock.calls[0][1]).toEqual({ origin: 'snmp' })
  })

  it('leaves a merge-patch without origin alone', async () => {
    patch.mockResolvedValueOnce({ id: 9, origin: 'agent', status: 'disabled' })
    await updateDci(7, 9, { status: 'disabled' })
    expect(patch.mock.calls[0][1]).toEqual({ status: 'disabled' })
  })
})

describe('anomaly detection', () => {
  it('writes the editable settings with flag bits that agree', async () => {
    patch.mockResolvedValueOnce({ id: 9 })
    await updateDci(7, 9, {
      type: 'item',
      origin: 'agent',
      flags: 0x1,
      anomalyDetection: {
        enabled: false,
        llmTuning: true,
        sensitivity: 3.5,
        direction: 'up',
        mode: 'rate',
        minTrainingDays: 7,
        detector: { id: 'cusum', k: 1, h: 5 },
        model: { learning: true },
      },
    })
    expect(patch.mock.calls[0][1]).toEqual({
      type: 'item',
      origin: 1,
      flags: 0,
      anomalyDetection: {
        enabled: false,
        llmTuning: false,
        sensitivity: 3.5,
        direction: 'up',
        mode: 'rate',
        minTrainingDays: 7,
      },
    })
  })

  it('posts a profile regeneration to the item', async () => {
    post.mockResolvedValueOnce(null)
    await regenerateAnomalyProfile(7, 9)
    expect(post).toHaveBeenCalledWith(
      '/v1/objects/7/data-collection/configuration/9/regenerate-anomaly-profile',
    )
  })
})
