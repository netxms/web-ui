// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const { getUserDirectory } = await import('../usersApi')

function httpError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

/** @param {Record<string, unknown>} answers - path to body, or to an Error to throw */
function answer(answers) {
  client.get.mockImplementation(async (path) => {
    const value = answers[path]
    if (value instanceof Error) throw value
    return value
  })
}

beforeEach(() => vi.clearAllMocks())

describe('getUserDirectory', () => {
  it('answers the directory as the server sends it', async () => {
    const directory = [
      { id: 1, name: 'admin', fullName: 'Admin', isGroup: false, isDisabled: false },
      { id: 0x40000000, name: 'Everyone', isGroup: true, isDisabled: false },
    ]
    answer({ '/v1/user-directory': directory })

    expect(await getUserDirectory()).toEqual(directory)
    expect(client.get).toHaveBeenCalledTimes(1)
  })

  it('reads the user and group lists from a server without the route', async () => {
    answer({
      '/v1/user-directory': httpError(404),
      '/v1/users': [
        { id: 2, name: 'jsmith', fullName: 'John Smith', flags: { disabled: false } },
        { id: 4, name: 'bwilson', flags: { disabled: true } },
      ],
      '/v1/user-groups': [{ id: 0x40000001, name: 'Admins', members: [1], flags: {} }],
    })

    expect(await getUserDirectory()).toEqual([
      { id: 2, name: 'jsmith', fullName: 'John Smith', isGroup: false, isDisabled: false },
      { id: 4, name: 'bwilson', fullName: '', isGroup: false, isDisabled: true },
      { id: 0x40000001, name: 'Admins', isGroup: true, isDisabled: false },
    ])
  })

  it('is empty there without "manage users"', async () => {
    answer({
      '/v1/user-directory': httpError(404),
      '/v1/users': httpError(403),
      '/v1/user-groups': httpError(403),
    })

    expect(await getUserDirectory()).toEqual([])
  })

  it('does not fall back on other failures', async () => {
    answer({ '/v1/user-directory': httpError(500) })

    await expect(getUserDirectory()).rejects.toMatchObject({ status: 500 })
    expect(client.get).toHaveBeenCalledTimes(1)
  })
})
