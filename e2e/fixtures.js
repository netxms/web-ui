// The `test` every browser spec uses. On a real server it keeps runs from changing anything that
// was there before: reads pass, the account's saved preferences stay in the browser, and a test
// can only create `e2e-` items and change or delete what it created itself.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { test as base, expect } from '@playwright/test'
import { AUTH_FILE, BLOCKED_LOG, TEST_PREFIX, useMocks } from './support.js'

/** POSTs that only read. Everything else that is not a GET is refused unless a test owns it. */
const READ_ONLY_POSTS = [
  /^\/v1\/login$/,
  /^\/v1\/logout$/,
  /^\/v1\/objects\/details$/,
  /^\/v1\/objects\/query$/,
  /^\/v1\/objects\/search$/,
  /^\/v1\/objects\/\d+\/expand-text$/,
  /^\/v1\/objects\/\d+\/execute-dashboard-script$/,
  /^\/v1\/data-collection\/current-values$/,
  /^\/v1\/logs\/[^/]+\/query$/,
  /^\/v1\/dci-summary-tables\/\d+\/query$/,
  /^\/v1\/data-export\/metrics$/,
  /^\/v1\/script-library\/compile$/,
]

const USER_VARIABLE = /^\/v1\/users\/\d+\/variables\/(.+)$/
const USER_VARIABLES = /^\/v1\/users\/\d+\/variables$/

function logBlocked(method, path) {
  fs.mkdirSync('test-results', { recursive: true })
  fs.appendFileSync(BLOCKED_LOG, `${method} ${path}\n`)
}

/**
 * Puts the guard on a browser context.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<{ allow: Function, owned: Set<string>, freshAccount: Function }>} `allow` lets
 *   a test create `e2e-` items in a collection, `owned` holds the paths of what it created
 */
export async function guardServer(context) {
  const preferences = new Map()
  const collections = new Set()
  const owned = new Set()
  /** Script runs started on an owned object: stoppable, but with nothing to delete afterwards. */
  const executions = new Set()
  let freshAccount = false

  const isOwned = (path) =>
    [...owned, ...executions].some((item) => path === item || path.startsWith(`${item}/`))

  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^\/api/, '')

    if (method === 'GET' && USER_VARIABLES.test(path)) {
      if (freshAccount) {
        await route.fulfill({ json: Object.fromEntries(preferences) })
        return
      }
      const response = await route.fetch()
      const stored = response.ok() ? await response.json() : {}
      await route.fulfill({ response, json: { ...stored, ...Object.fromEntries(preferences) } })
      return
    }
    if (method === 'GET' || method === 'HEAD') return route.fallback()
    if (method === 'POST' && READ_ONLY_POSTS.some((pattern) => pattern.test(path))) {
      return route.fallback()
    }

    const variable = path.match(USER_VARIABLE)
    if (variable) {
      const name = decodeURIComponent(variable[1])
      if (method === 'PUT') preferences.set(name, request.postDataJSON()?.value)
      else preferences.delete(name)
      await route.fulfill({ status: 204 })
      return
    }

    if (method === 'POST' && collections.has(path) && request.postData()?.includes(TEST_PREFIX)) {
      const response = await route.fetch()
      const body = await response.json().catch(() => null)
      if (response.ok() && body?.id != null) owned.add(`${path}/${body.id}`)
      await route.fulfill({ response })
      return
    }
    if (isOwned(path)) {
      const response = await route.fetch()
      const body = await response.json().catch(() => null)
      if (body?.executionId != null) executions.add(`/v1/script-executions/${body.executionId}`)
      if (method === 'DELETE' && response.ok()) owned.delete(path)
      await route.fulfill({ response })
      return
    }
    const key = decodeURIComponent(path.split('/').pop())
    if (collections.has(path.slice(0, path.lastIndexOf('/'))) && key.startsWith(TEST_PREFIX)) {
      if (method === 'PUT' || method === 'PATCH') owned.add(path)
      if (method === 'DELETE') owned.delete(path)
      return route.fallback()
    }

    // A 403 and not a dropped connection, which would put up the reconnect overlay.
    logBlocked(method, path)
    await route.fulfill({ status: 403, json: { reason: 'Refused by the e2e write guard' } })
  })

  return {
    allow: (collection) => collections.add(collection),
    owned,
    /** Shows the app an account with no saved preferences, for checks of the defaults. */
    freshAccount: () => {
      freshAccount = true
    },
  }
}

/** From the run's session file, not the context: a frozen page must not stop the cleanup. */
function authHeaders() {
  const { origins } = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'))
  const session = origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'sessionGuid')?.value
  return { Authorization: `Bearer ${session}` }
}

export const test = base.extend({
  // Runs for every test, wanted or not; a test that writes asks for `server` to widen it.
  server: [
    async ({ context }, use) => {
      if (useMocks) {
        await use({
          allow: () => {},
          owned: new Set(),
          freshAccount: () => {},
          read: async () => null,
        })
        return
      }
      const guard = await guardServer(context)

      async function post(path, data) {
        const response = await context.request.post(`/api${path}`, {
          headers: authHeaders(),
          data,
        })
        expect(response.ok(), `POST ${path}: ${response.status()}`).toBe(true)
        return response.json().catch(() => null)
      }

      await use({
        ...guard,
        /** Reads straight from the server, for comparing what was there before and after. */
        read: async (path) => {
          const response = await context.request.get(`/api${path}`, { headers: authHeaders() })
          expect(response.ok(), `GET ${path}`).toBe(true)
          return response.json()
        },
        /** Creates an object of this test's own, which it may change and which is removed after. */
        createObject: async (objectClass, parentId, label) => {
          const name = `${TEST_PREFIX}${label}-${Date.now()}`
          const { id } = await post('/v1/objects', { class: objectClass, parentId, name })
          guard.owned.add(`/v1/objects/${id}`)
          return { id, name }
        },
        /**
         * Creates a user with the server's default rights, removed after the test. The password
         * is random and lives only in this call's result.
         */
        createUser: async (label) => {
          const name = `${TEST_PREFIX}${label}-${Date.now()}`
          const { id } = await post('/v1/users', { name })
          guard.owned.add(`/v1/users/${id}`)
          const password = `${crypto.randomBytes(24).toString('base64url')}aA1!`
          await post(`/v1/users/${id}/password`, { newPassword: password })
          return { id, name, password }
        },
      })

      // Only what this test created, newest first. Most is gone already; a failed test's isn't.
      const failures = []
      for (const path of [...guard.owned].reverse()) {
        const response = await context.request.delete(`/api${path}`, { headers: authHeaders() })
        if (!response.ok() && response.status() !== 404) {
          failures.push(`${path}: ${response.status()}`)
        }
      }
      expect(failures, 'test data this test could not remove').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
