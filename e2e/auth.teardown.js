import fs from 'node:fs'
import { test as teardown, expect } from '@playwright/test'
import { AUTH_FILE, TARGETS_FILE, TEST_PREFIX, useMocks } from './support.js'

/** Everything a test may have created that is still on the server. */
async function leftovers(request, headers) {
  const read = async (path) => {
    const response = await request.get(`/api${path}`, { headers })
    return response.ok() ? response.json() : null
  }
  const flatten = (entries) =>
    (entries ?? []).flatMap((entry) => [entry, ...flatten(entry.children)])
  const objects = [
    ...flatten(await read('/v1/objects/2/sub-tree')),
    ...flatten(await read('/v1/objects/9/sub-tree')),
  ]
  const names = [
    ...Object.keys((await read('/v1/persistent-storage')) ?? {}),
    ...((await read('/v1/mapping-tables')) ?? []).map((table) => table.name),
    ...((await read('/v1/snmp-trap-mappings')) ?? []).map((trap) => trap.description ?? ''),
    ...((await read('/v1/users')) ?? []).map((user) => user.name),
    ...objects.map((object) => object.name),
  ]
  return names.filter((name) => name.startsWith(TEST_PREFIX))
}

// The run's session ends with the run: signed out on the server, and nothing left on disk. Whatever
// else happens, the session goes; the check for leftovers then fails the run if it found any.
teardown('sign out', async ({ request }) => {
  let found = []
  if (fs.existsSync(AUTH_FILE)) {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'))
    const session = state.origins
      .flatMap((origin) => origin.localStorage)
      .find((item) => item.name === 'sessionGuid')?.value
    if (session) {
      const headers = { Authorization: `Bearer ${session}` }
      if (!useMocks) found = await leftovers(request, headers)
      await request.post('/api/v1/logout', { headers })
    }
  }
  fs.rmSync(AUTH_FILE, { force: true })
  fs.rmSync(TARGETS_FILE, { force: true })
  expect(found, 'test data left on the server').toEqual([])
})
