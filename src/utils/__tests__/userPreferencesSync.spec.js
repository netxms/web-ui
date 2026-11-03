import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/api/userPreferencesApi', () => ({
  getUserVariables: vi.fn(),
  setUserVariable: vi.fn(),
  deleteUserVariable: vi.fn(),
}))

const api = await import('@/api/userPreferencesApi')
const { userPrefs } = await import('@/utils/appStorage')
const { syncUserPreferences, disconnectUserPreferences, variableName } =
  await import('@/utils/userPreferencesSync')

const USER = { id: 1, username: 'admin' }

/** Let the write queue run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Server answer in wire form: prefixed names, JSON string values. */
function serverHas(values) {
  api.getUserVariables.mockResolvedValue(
    Object.fromEntries(Object.entries(values).map(([k, v]) => [`webui.${k}`, JSON.stringify(v)])),
  )
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  disconnectUserPreferences()
  localStorage.clear()
  vi.mocked(api.getUserVariables).mockReset().mockResolvedValue({})
  vi.mocked(api.setUserVariable).mockReset().mockResolvedValue(null)
  vi.mocked(api.deleteUserVariable).mockReset().mockResolvedValue(null)
})

describe('variableName', () => {
  it('prefixes our fields', () => {
    expect(variableName('tables.alarm.columns')).toBe('webui.tables.alarm.columns')
  })

  it('refuses what the server would not take or could not address', () => {
    expect(variableName('a/b')).toBeNull()
    expect(variableName('a:b')).toBeNull()
    expect(variableName('x'.repeat(122))).toBeNull()
    expect(variableName('x'.repeat(121))).not.toBeNull()
  })
})

describe('syncUserPreferences', () => {
  it('asks the server for our prefix only, and skips what it cannot read', async () => {
    api.getUserVariables.mockResolvedValue({
      'webui.theme': '"dark"',
      'webui.broken': '{not json',
      'AlarmList.ShowStatusColumn': 'true',
    })

    await syncUserPreferences(USER)

    expect(api.getUserVariables).toHaveBeenCalledWith(1, 'webui.*')
    expect(userPrefs.read()).toEqual({ theme: 'dark' })
  })

  it("takes the server's values over this browser's, for the account it already belongs to", async () => {
    userPrefs.replace({ theme: 'light', rtl: true }, '1')
    serverHas({ theme: 'dark' })

    await syncUserPreferences(USER)

    // A field the server lacks goes back to its default; nothing is uploaded.
    expect(userPrefs.read()).toEqual({ theme: 'dark' })
    expect(userPrefs.owner()).toBe('1')
    expect(api.setUserVariable).not.toHaveBeenCalled()
  })

  it("never shows or uploads another account's values", async () => {
    userPrefs.replace({ theme: 'dark', recentSearchItems: [{ id: 5 }] }, '2')

    await syncUserPreferences(USER)

    expect(userPrefs.read()).toEqual({})
    expect(userPrefs.owner()).toBe('1')
    expect(api.setUserVariable).not.toHaveBeenCalled()
  })

  it('uploads what the server lacks from values no account has claimed, then claims them', async () => {
    userPrefs.replace({ theme: 'dark', rtl: true }, null)
    serverHas({ theme: 'light' })

    await syncUserPreferences(USER)

    expect(api.setUserVariable).toHaveBeenCalledTimes(1)
    expect(api.setUserVariable).toHaveBeenCalledWith(1, 'webui.rtl', 'true')
    expect(userPrefs.read()).toEqual({ theme: 'light', rtl: true })
    expect(userPrefs.owner()).toBe('1')
  })

  it('leaves the values unclaimed when an upload fails, so the next sign-in retries', async () => {
    userPrefs.replace({ theme: 'dark', rtl: true }, null)
    api.setUserVariable.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('500'))

    await syncUserPreferences(USER)

    expect(userPrefs.read()).toEqual({ theme: 'dark', rtl: true })
    expect(userPrefs.owner()).toBeNull()
  })

  it('drops the answer for a session that has since been replaced', async () => {
    const slow = deferred()
    api.getUserVariables.mockReturnValueOnce(slow.promise)
    const first = syncUserPreferences(USER)

    serverHas({ theme: 'light' })
    await syncUserPreferences({ id: 2, username: 'guest' })

    slow.resolve({ 'webui.theme': '"dark"' })
    await first

    expect(userPrefs.read()).toEqual({ theme: 'light' })
    expect(userPrefs.owner()).toBe('2')
  })

  it('does nothing without a user id', async () => {
    await syncUserPreferences({ username: 'admin' })
    await syncUserPreferences(null)

    expect(api.getUserVariables).not.toHaveBeenCalled()
  })
})

describe('when the server cannot be reached', () => {
  beforeEach(() => {
    api.getUserVariables.mockRejectedValue(new Error('Network error'))
  })

  it("keeps the account's own cache", async () => {
    userPrefs.replace({ theme: 'dark' }, '1')

    await syncUserPreferences(USER)

    expect(userPrefs.read()).toEqual({ theme: 'dark' })
    expect(userPrefs.owner()).toBe('1')
  })

  it("does not show another account's cache", async () => {
    userPrefs.replace({ theme: 'dark' }, '2')

    await syncUserPreferences(USER)

    expect(userPrefs.read()).toEqual({})
    expect(userPrefs.owner()).toBe('1')
  })

  it('keeps unclaimed values unclaimed, for the server to receive later', async () => {
    userPrefs.replace({ theme: 'dark' }, null)

    await syncUserPreferences(USER)

    expect(userPrefs.read()).toEqual({ theme: 'dark' })
    expect(userPrefs.owner()).toBeNull()
  })

  it('writes nothing to the server for the rest of the session', async () => {
    await syncUserPreferences(USER)

    userPrefs.set('theme', 'dark')
    await settle()

    expect(api.setUserVariable).not.toHaveBeenCalled()
    expect(userPrefs.get('theme')).toBe('dark')
  })
})

describe('write-through', () => {
  it('sends each change as JSON under our prefix, and deletes a removed one', async () => {
    await syncUserPreferences(USER)

    userPrefs.set('views.visible', { objects: ['alarms'] })
    await settle()
    userPrefs.remove('views.visible')
    await settle()

    expect(api.setUserVariable).toHaveBeenCalledWith(
      1,
      'webui.views.visible',
      '{"objects":["alarms"]}',
    )
    expect(api.deleteUserVariable).toHaveBeenCalledWith(1, 'webui.views.visible')
  })

  it('sends one request at a time, the latest value of a field replacing a queued one', async () => {
    await syncUserPreferences(USER)
    const first = deferred()
    api.setUserVariable.mockReturnValueOnce(first.promise)

    userPrefs.set('theme', 'dark')
    userPrefs.set('rtl', true)
    userPrefs.set('rtl', false)
    expect(api.setUserVariable).toHaveBeenCalledTimes(1)

    first.resolve(null)
    await settle()

    expect(api.setUserVariable.mock.calls).toEqual([
      [1, 'webui.theme', '"dark"'],
      [1, 'webui.rtl', 'false'],
    ])
  })

  it('keeps going after a failed write', async () => {
    await syncUserPreferences(USER)
    api.setUserVariable.mockRejectedValueOnce(new Error('500'))

    userPrefs.set('theme', 'dark')
    userPrefs.set('rtl', true)
    await settle()

    expect(api.setUserVariable).toHaveBeenCalledTimes(2)
  })

  it('keeps a field the server could not address in this browser', async () => {
    await syncUserPreferences(USER)

    userPrefs.set('odd/name', 1)
    await settle()

    expect(api.setUserVariable).not.toHaveBeenCalled()
    expect(userPrefs.get('odd/name')).toBe(1)
  })

  it('writes nothing before sign-in, nor after sign-out, and drops what was queued', async () => {
    userPrefs.set('theme', 'dark')
    await settle()
    expect(api.setUserVariable).not.toHaveBeenCalled()

    // That value was unclaimed, so signing in uploads it.
    await syncUserPreferences(USER)
    expect(api.setUserVariable).toHaveBeenCalledWith(1, 'webui.theme', '"dark"')
    api.setUserVariable.mockClear()

    const first = deferred()
    api.setUserVariable.mockReturnValueOnce(first.promise)
    userPrefs.set('theme', 'light')
    userPrefs.set('rtl', true)

    disconnectUserPreferences()
    first.resolve(null)
    await settle()
    userPrefs.set('theme', 'dark')
    await settle()

    expect(api.setUserVariable).toHaveBeenCalledTimes(1)
  })
})

describe('the onboarding stub', () => {
  const STUB_KEY = 'netxms-user-attributes'
  const PROGRESS = { v: 1, hidden: true, completed: ['add-node'] }

  function seedStub(byUser) {
    localStorage.setItem(STUB_KEY, JSON.stringify({ version: 1, byUser }))
  }

  it("uploads this user's progress when the server has none, then drops the stub entry", async () => {
    seedStub({ 1: { '.Onboarding': JSON.stringify(PROGRESS) }, 9: { '.Onboarding': '{}' } })

    await syncUserPreferences(USER)

    expect(api.setUserVariable).toHaveBeenCalledWith(
      1,
      'webui.onboarding',
      JSON.stringify(PROGRESS),
    )
    expect(userPrefs.get('onboarding')).toEqual(PROGRESS)
    expect(JSON.parse(localStorage.getItem(STUB_KEY)).byUser).toEqual({
      9: { '.Onboarding': '{}' },
    })
  })

  it('finds progress stored under the login name, and removes the key once empty', async () => {
    seedStub({ admin: { '.Onboarding': JSON.stringify(PROGRESS) } })

    await syncUserPreferences(USER)

    expect(userPrefs.get('onboarding')).toEqual(PROGRESS)
    expect(localStorage.getItem(STUB_KEY)).toBeNull()
  })

  it("prefers the server's progress", async () => {
    seedStub({ 1: { '.Onboarding': JSON.stringify(PROGRESS) } })
    serverHas({ onboarding: { completed: [] } })

    await syncUserPreferences(USER)

    expect(userPrefs.get('onboarding')).toEqual({ completed: [] })
    expect(api.setUserVariable).not.toHaveBeenCalled()
  })

  it('uses the stub, and keeps it, while the server cannot be reached', async () => {
    seedStub({ 1: { '.Onboarding': JSON.stringify(PROGRESS) } })
    api.getUserVariables.mockRejectedValue(new Error('Network error'))

    await syncUserPreferences(USER)

    expect(userPrefs.get('onboarding')).toEqual(PROGRESS)
    expect(localStorage.getItem(STUB_KEY)).not.toBeNull()
  })
})
