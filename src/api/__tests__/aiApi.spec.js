// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const { adaptAiSkillsAndTools, getAiSkillsAndTools, disableAiItem, enableAiItem } =
  await import('../aiApi')

beforeEach(() => vi.clearAllMocks())

const notFound = () => Object.assign(new Error('Not found'), { status: 404 })

describe('getAiSkillsAndTools', () => {
  it('reads skills-and-tools and takes skill / tool as item types', async () => {
    client.get.mockResolvedValue({
      skills: [{ name: 'log-analysis', supportsWorker: true, defaultMode: 'worker' }],
      tools: [{ name: 'get-alarm-list', parameters: [] }],
      disabledExtras: [{ type: 'tool', name: 'delete-objects' }],
    })

    const data = await getAiSkillsAndTools()

    expect(client.get).toHaveBeenCalledTimes(1)
    expect(client.get).toHaveBeenCalledWith('/v1/ai/skills-and-tools')
    expect(data.skills[0]).toMatchObject({ supportsWorker: true, defaultMode: 'worker' })
    expect(data.tools.map((t) => t.name)).toEqual(['get-alarm-list'])
    expect(data.disabledExtras).toEqual([{ type: 'tool', name: 'delete-objects' }])
    expect(data.typeCodes).toEqual({ skill: 'skill', tool: 'tool' })
  })

  // netxms 7.1 and earlier.
  it('falls back to skills-and-functions on a 404 and keeps that server type codes', async () => {
    client.get.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({
      skills: [{ name: 'log-analysis', supportsDelegation: true, defaultMode: 'delegated' }],
      functions: [{ name: 'get-alarm-list' }],
      disabledExtras: [
        { type: 'F', name: 'delete-objects' },
        { type: 'S', name: 'network-reconfiguration' },
      ],
    })

    const data = await getAiSkillsAndTools()

    expect(client.get).toHaveBeenLastCalledWith('/v1/ai/skills-and-functions')
    expect(data.skills[0]).toMatchObject({ supportsWorker: true, defaultMode: 'worker' })
    expect(data.tools.map((t) => t.name)).toEqual(['get-alarm-list'])
    expect(data.disabledExtras.map((e) => e.type)).toEqual(['tool', 'skill'])
    expect(data.typeCodes).toEqual({ skill: 'S', tool: 'F' })
  })

  it('passes any other failure on without trying the old route', async () => {
    client.get.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))

    await expect(getAiSkillsAndTools()).rejects.toMatchObject({ status: 403 })
    expect(client.get).toHaveBeenCalledTimes(1)
  })
})

describe('adaptAiSkillsAndTools', () => {
  it('maps the old skill modes and defaults a missing one to load', () => {
    const data = adaptAiSkillsAndTools(
      { skills: [{ defaultMode: 'loaded' }, { defaultMode: 'delegated' }, {}] },
      true,
    )
    expect(data.skills.map((s) => s.defaultMode)).toEqual(['load', 'worker', 'load'])
    expect(data.skills.map((s) => s.supportsWorker)).toEqual([false, false, false])
  })

  it('answers empty lists for an empty body', () => {
    expect(adaptAiSkillsAndTools(null, false)).toMatchObject({
      skills: [],
      tools: [],
      disabledExtras: [],
    })
  })
})

describe('stop list', () => {
  it('sends the type code as given', async () => {
    await disableAiItem('F', 'delete-objects')
    expect(client.post).toHaveBeenCalledWith('/v1/ai/disabled-items', {
      type: 'F',
      name: 'delete-objects',
    })

    await enableAiItem('tool', 'run workers')
    expect(client.del).toHaveBeenCalledWith('/v1/ai/disabled-items/tool/run%20workers')
  })
})
