// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const { getUserVariables, setUserVariable, deleteUserVariable } =
  await import('../userPreferencesApi')

const QUIET = { priority: 'background', suppressForbidden: true, suppressUnauthorized: true }

beforeEach(() => vi.clearAllMocks())

describe('userPreferencesApi', () => {
  it('lists the variables matching a pattern', async () => {
    client.get.mockResolvedValue({ 'webui.theme': '"dark"' })

    expect(await getUserVariables(7, 'webui.*')).toEqual({ 'webui.theme': '"dark"' })
    expect(client.get).toHaveBeenCalledWith('/v1/users/7/variables?pattern=webui.*')
  })

  it('treats an empty answer as no variables', async () => {
    client.get.mockResolvedValue(null)

    expect(await getUserVariables(7)).toEqual({})
    expect(client.get).toHaveBeenCalledWith('/v1/users/7/variables')
  })

  it('writes and deletes one variable quietly, its name encoded', async () => {
    await setUserVariable(7, 'webui.a b(1)', '"x"')
    await deleteUserVariable(7, 'webui.a b(1)')

    expect(client.put).toHaveBeenCalledWith(
      '/v1/users/7/variables/webui.a%20b(1)',
      { value: '"x"' },
      QUIET,
    )
    expect(client.del).toHaveBeenCalledWith('/v1/users/7/variables/webui.a%20b(1)', QUIET)
  })
})
