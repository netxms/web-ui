import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@tanstack/vue-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({ clear: vi.fn() }),
}))

vi.mock('@/utils/sessionReset', () => ({ resetSessionState: vi.fn() }))

vi.mock('@/utils/userPreferencesSync', () => ({
  syncUserPreferences: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
  validateSession: vi.fn(),
}))

const authApi = await import('@/api/authApi')
const { resetSessionState } = await import('@/utils/sessionReset')
const { syncUserPreferences } = await import('@/utils/userPreferencesSync')
const { useAuthStore } = await import('../authStore')

const USER = { id: 1, username: 'admin' }
const SESSION = { sessionGuid: 'guid-1', user: USER }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(authApi.login).mockReset()
  vi.mocked(resetSessionState).mockClear()
  vi.mocked(syncUserPreferences).mockClear()
})

describe('authStore login', () => {
  it('stores the session and user for a plain login', async () => {
    authApi.login.mockResolvedValue(SESSION)
    const store = useAuthStore()

    expect(await store.login('admin', 'secret')).toBe(true)

    expect(store.sessionGuid).toBe('guid-1')
    expect(store.user).toEqual(USER)
    expect(localStorage.getItem('sessionGuid')).toBe('guid-1')
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(USER)
    expect(store.twoFactorStep).toBeNull()
    expect(store.isAuthenticated).toBe(true)
  })

  // Otherwise the shell opens on whatever account used this browser last.
  it("loads the user's preferences before reporting the login done", async () => {
    let finishSync
    syncUserPreferences.mockReturnValueOnce(new Promise((resolve) => (finishSync = resolve)))
    authApi.login.mockResolvedValue(SESSION)
    const store = useAuthStore()

    let done = false
    const login = store.login('admin', 'secret').then(() => (done = true))
    await vi.waitFor(() => expect(syncUserPreferences).toHaveBeenCalledWith(USER))
    expect(done).toBe(false)

    finishSync()
    await login
    expect(done).toBe(true)
  })

  it('does not load preferences for a rejected login', async () => {
    authApi.login.mockRejectedValue(new Error('Access denied'))
    const store = useAuthStore()

    await store.login('admin', 'wrong')

    expect(syncUserPreferences).not.toHaveBeenCalled()
  })

  it('asks for a method when the server offers several', async () => {
    authApi.login.mockResolvedValue({ twoFactorMethods: ['TOTP', 'Email'] })
    const store = useAuthStore()

    expect(await store.login('admin', 'secret')).toBe(false)

    expect(store.twoFactorStep).toBe('select-method')
    expect(store.twoFactor.availableMethods).toEqual(['TOTP', 'Email'])
    expect(store.isAuthenticated).toBe(false)
  })

  it('advances straight to the only method on offer', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['TOTP'] })
      .mockResolvedValueOnce({ method: 'TOTP', requestId: 7, challenge: 'c' })
    const store = useAuthStore()

    await store.login('admin', 'secret')

    expect(authApi.login).toHaveBeenCalledTimes(2)
    expect(authApi.login).toHaveBeenLastCalledWith('admin', 'secret', { method: 'TOTP' })
  })

  it('enters the code step on a challenge, keeping the credentials for the next call', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['TOTP', 'Email'] })
      .mockResolvedValueOnce({ method: 'TOTP', requestId: 7, challenge: 'c' })
    const store = useAuthStore()
    await store.login('admin', 'secret')

    expect(await store.selectTwoFactorMethod('TOTP')).toBe(false)

    expect(store.twoFactorStep).toBe('enter-code')
    expect(store.twoFactor).toMatchObject({
      method: 'TOTP',
      requestId: 7,
      challenge: 'c',
      credentials: { username: 'admin', password: 'secret' },
    })
  })

  it('completes the login with the submitted code', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['TOTP'] })
      .mockResolvedValueOnce({ method: 'TOTP', requestId: 7, challenge: 'c' })
      .mockResolvedValueOnce(SESSION)
    const store = useAuthStore()
    await store.login('admin', 'secret')

    expect(await store.submitTwoFactorCode('123456')).toBe(true)

    expect(authApi.login).toHaveBeenLastCalledWith('admin', 'secret', {
      method: 'TOTP',
      requestId: 7,
      challenge: 'c',
      response: '123456',
    })
    expect(store.sessionGuid).toBe('guid-1')
    expect(store.twoFactorStep).toBeNull()
    expect(syncUserPreferences).toHaveBeenCalledWith(USER)
  })

  // The server drops the pending login request once it has checked a code, so retries fail too.
  it('returns to the sign-in form when the code is rejected, keeping the reason', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['TOTP'] })
      .mockResolvedValueOnce({ method: 'TOTP', requestId: 7, challenge: 'c' })
      .mockRejectedValueOnce(new Error('The verification code was not accepted.'))
    const store = useAuthStore()
    await store.login('admin', 'secret')

    expect(await store.submitTwoFactorCode('000000')).toBe(false)

    expect(store.twoFactorStep).toBeNull()
    expect(store.error).toBe('The verification code was not accepted.')
    expect(store.loading).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('completes the login from the method choice when no challenge is needed', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['Push', 'TOTP'] })
      .mockResolvedValueOnce(SESSION)
    const store = useAuthStore()
    await store.login('admin', 'secret')

    expect(await store.selectTwoFactorMethod('Push')).toBe(true)

    expect(store.sessionGuid).toBe('guid-1')
    expect(store.twoFactorStep).toBeNull()
  })

  it('reports a rejected login and clears the loading flag', async () => {
    authApi.login.mockRejectedValue(new Error('Access denied'))
    const store = useAuthStore()

    expect(await store.login('admin', 'wrong')).toBe(false)

    expect(store.error).toBe('Access denied')
    expect(store.loading).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('cancels the two-factor flow and its error', async () => {
    authApi.login
      .mockResolvedValueOnce({ twoFactorMethods: ['TOTP', 'Email'] })
      .mockRejectedValueOnce(new Error('Method unavailable'))
    const store = useAuthStore()
    await store.login('admin', 'secret')
    await store.selectTwoFactorMethod('Email')
    expect(store.error).toBe('Method unavailable')

    store.cancelTwoFactor()

    expect(store.twoFactorStep).toBeNull()
    expect(store.error).toBeNull()
  })
})

describe('authStore checkSession', () => {
  it("loads the user's preferences once the restored session checks out", async () => {
    localStorage.setItem('sessionGuid', 'guid-1')
    localStorage.setItem('user', JSON.stringify({ username: 'admin' }))
    authApi.validateSession.mockResolvedValue({ userId: 1, userName: 'admin' })
    const store = useAuthStore()

    expect(await store.checkSession()).toBe(true)

    expect(syncUserPreferences).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it("refreshes the cached full name from the server's answer", async () => {
    localStorage.setItem('sessionGuid', 'guid-1')
    localStorage.setItem('user', JSON.stringify({ username: 'admin', fullName: 'Old Name' }))
    authApi.validateSession.mockResolvedValue({ userId: 1, userName: 'admin', fullName: 'Ann' })
    const store = useAuthStore()

    await store.checkSession()

    expect(store.user.fullName).toBe('Ann')
    expect(JSON.parse(localStorage.getItem('user')).fullName).toBe('Ann')
  })

  // A server without the field must not wipe the name the login stored.
  it('keeps the cached full name when the server does not send one', async () => {
    localStorage.setItem('sessionGuid', 'guid-1')
    localStorage.setItem('user', JSON.stringify({ username: 'admin', fullName: 'Ann' }))
    authApi.validateSession.mockResolvedValue({ userId: 1, userName: 'admin' })
    const store = useAuthStore()

    await store.checkSession()

    expect(store.user.fullName).toBe('Ann')
  })
})

describe('authStore clearSession', () => {
  it('removes the stored session and resets the rest of the session state', async () => {
    authApi.login.mockResolvedValue(SESSION)
    const store = useAuthStore()
    await store.login('admin', 'secret')

    store.clearSession()

    expect(localStorage.getItem('sessionGuid')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(resetSessionState).toHaveBeenCalledTimes(1)
  })
})
