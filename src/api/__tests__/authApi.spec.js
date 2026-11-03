import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The real transport runs underneath, so the global 403 announcement is observable. Same stub
// as client.spec.js: the client resolves the auth store once for the session token.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: null, logout: vi.fn() }),
}))

const { login, validateSession } = await import('../authApi')
const { ApiError } = await import('../client')

/** Minimal fetch Response stand-in. */
function respond(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob()),
  }
}

let forbiddenEvents

function collect(event) {
  forbiddenEvents.push(event.detail)
}

beforeEach(() => {
  forbiddenEvents = []
  window.addEventListener('app:forbidden', collect)
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  window.removeEventListener('app:forbidden', collect)
})

/** The error `login` rejects with, for assertions on its message and status. */
async function loginFailure(twoFactor = null) {
  try {
    await login('jdoe', 'secret', twoFactor)
  } catch (err) {
    return err
  }
  throw new Error('login resolved, expected a rejection')
}

describe('login failures', () => {
  it('does not raise the global access-denied toast for a refused sign-in', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { errorCode: 2 }))

    await loginFailure()

    expect(forbiddenEvents).toEqual([])
  })

  // H_Login answers 403 with the RCC from AuthenticateUser (include/nxcldefs.h).
  it.each([
    ['a wrong user name or password', 2, /incorrect user name or password/i],
    ['a disabled or locked-out account', 60, /disabled or locked/i],
    ['a password change with no grace logins left', 61, /no grace logins/i],
    ['mandatory two-factor setup not done', 187, /two-factor authentication/i],
  ])('explains %s (RCC %i)', async (_label, errorCode, expected) => {
    globalThis.fetch.mockResolvedValue(respond(403, { errorCode }))

    const err = await loginFailure()

    expect(err.message).toMatch(expected)
  })

  // The server discards the pending login request when it checks a code, so a retry with the
  // same request id can never succeed.
  it('asks to sign in again when a verification code is rejected', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, {}))

    const err = await loginFailure({
      method: 'TOTP',
      requestId: 'r-1',
      challenge: 'c',
      response: '123456',
    })

    expect(err.message).toMatch(/code was not accepted.*sign in again/i)
  })

  // deploy/nginx rate-limits /api/v1/login with limit_req_status 429.
  it('explains a rate-limited attempt', async () => {
    globalThis.fetch.mockResolvedValue(respond(429, {}))

    expect((await loginFailure()).message).toMatch(/too many sign-in attempts/i)
  })

  it.each([0, 502, 503, 504])('says the server cannot be reached (status %i)', async (status) => {
    if (status === 0) globalThis.fetch.mockRejectedValue(new TypeError('failed to fetch'))
    else globalThis.fetch.mockResolvedValue(respond(status, {}))

    expect((await loginFailure()).message).toMatch(/cannot be reached/i)
  })

  // The licence check in H_Login refuses with a `reason` and no RCC.
  it('passes through a reason the server gave for an unmapped refusal', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { reason: 'Required license not installed' }))

    expect((await loginFailure()).message).toBe('Required license not installed')
  })

  it('keeps the status and body so callers can still branch on them', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { errorCode: 60 }))

    const err = await loginFailure()

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
    expect(err.data).toEqual({ errorCode: 60 })
  })
})

// Both answers carry the full name, so the greeting needs no `GET /v1/users/{id}` (which only
// "manage users" accounts may read).
describe('session user', () => {
  it('takes the full name from the login answer', async () => {
    globalThis.fetch.mockResolvedValue(
      respond(200, { token: 't-1', userId: 7, fullName: 'Jane Doe', systemAccessRights: 0 }),
    )

    const { user } = await login('jdoe', 'secret')

    expect(user).toMatchObject({ id: 7, username: 'jdoe', fullName: 'Jane Doe' })
  })

  it('stores an empty full name when the login answer has none', async () => {
    globalThis.fetch.mockResolvedValue(respond(200, { token: 't-1', userId: 7 }))

    expect((await login('jdoe', 'secret')).user.fullName).toBe('')
  })

  it('passes the full name through from the session status', async () => {
    globalThis.fetch.mockResolvedValue(
      respond(200, { userId: 7, userName: 'jdoe', fullName: 'Jane' }),
    )

    expect(await validateSession()).toMatchObject({ userId: 7, fullName: 'Jane' })
  })
})
