// @vitest-environment node
/**
 * Old/new UI parity for network map content against a live server; skipped unless the env
 * vars are set:
 *
 *   NETXMS_URL=http://your-server:8000 NETXMS_USER=admin NETXMS_PASSWORD=... yarn test:parity
 *
 * Every map on the server must survive the adapt -> serialize round trip; PUT
 * /v1/objects/{id}/map is checked on a scratch map reused by name (the WebAPI has no object
 * deletion), including the server behaviors the UI works around. Uses raw fetch:
 * src/api/client.js needs Pinia and the router. 2FA-enabled accounts are not supported.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  adaptApiNetworkMap,
  serializeNetworkMapContent,
  MAP_CONTENT_SETTING_KEYS,
  parseMapFlags,
  serializeMapFlags,
} from '@/utils/networkMapAdapters'
import { LEGACY_MAP_CONTENT, toPutShape } from '@/utils/__tests__/fixtures/legacyMapContent'

const BASE = process.env.NETXMS_URL
const USER = process.env.NETXMS_USER
const PASSWORD = process.env.NETXMS_PASSWORD ?? ''
const SCRATCH_NAME = '__ui-map-parity-test__'
const EMPTY_CONTENT = { elements: [], links: [] }

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

let token = null

async function api(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
  if (body !== undefined) options.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${path} -> HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

async function login() {
  const res = await fetch(`${BASE}/v1/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  })
  if (res.status === 401 && (res.headers.get('WWW-Authenticate') ?? '').startsWith('2FA')) {
    throw new Error(`User ${USER} requires 2FA - use a plain test account for parity runs`)
  }
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`)
  const data = await res.json()
  token = data.token
}

function collectMaps(nodes, acc = []) {
  for (const node of nodes ?? []) {
    if (node.class === 'NetworkMap') acc.push(node)
    if (node.children?.length) collectMaps(node.children, acc)
  }
  return acc
}

/** Adapt -> serialize with no edits (object resolution is irrelevant here). */
function uiSaveCycle(content) {
  return serializeNetworkMapContent(adaptApiNetworkMap(structuredClone(content), new Map()))
}

describe.skipIf(!BASE || !USER)('live network map parity (test server)', () => {
  let rootId = null
  let scratchId = null

  beforeAll(async () => {
    await login()
    const objects = await api('GET', '/v1/objects')
    rootId = (objects ?? []).find((o) => o.class === 'NetworkMapRoot')?.id
    if (!rootId) throw new Error('NetworkMapRoot object not found on server')
  })

  afterAll(async () => {
    // Best-effort: leave the scratch map empty for the next run
    if (token && scratchId) {
      await api('PUT', `/v1/objects/${scratchId}/map`, EMPTY_CONTENT).catch(() => {})
    }
  })

  it('every existing map survives the adapter round trip and /map agrees with object GET', async () => {
    const tree = await api('GET', `/v1/objects/${rootId}/sub-tree`)
    const maps = collectMaps(tree).filter((m) => m.name !== SCRATCH_NAME)
    const allFailures = []

    for (const { id, name } of maps) {
      const content = await api('GET', `/v1/objects/${id}/map`)
      const full = await api('GET', `/v1/objects/${id}`)

      for (const key of [...MAP_CONTENT_SETTING_KEYS, 'elements', 'links']) {
        if (JSON.stringify(content[key]) !== JSON.stringify(full[key])) {
          allFailures.push(`"${name}" [${id}]: /map and object GET disagree on ${key}`)
        }
      }

      // Losslessness: an unedited UI save cycle must produce the GET content
      // plus only the documented PUT-shape transforms (TextBox/DCIList key
      // duplication, null NXSL scripts normalized to '')
      const serialized = uiSaveCycle(content)
      const expected = toPutShape(content)
      if (JSON.stringify(serialized) !== JSON.stringify(expected)) {
        allFailures.push(`"${name}" [${id}]: adapter round trip is not lossless`)
      }
    }

    expect(maps.length).toBeGreaterThan(0)
    expect(allFailures).toEqual([])
  })

  it('finds or creates the scratch map', async () => {
    const tree = await api('GET', `/v1/objects/${rootId}/sub-tree`)
    scratchId = collectMaps(tree).find((m) => m.name === SCRATCH_NAME)?.id
    if (!scratchId) {
      const created = await api('POST', '/v1/objects', {
        class: 'NetworkMap',
        name: SCRATCH_NAME,
        parentId: rootId,
      })
      scratchId = created.id
    }
    // Reset so element flags from previous runs cannot leak into this one
    // (flags of elements that survive a PUT are carried forward server-side)
    await api('PUT', `/v1/objects/${scratchId}/map`, EMPTY_CONTENT)
    const content = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(scratchId).toBeTruthy()
    expect(content.elements).toEqual([])
    expect(content.links).toEqual([])
  })

  it('PUT round-trips the legacy corpus exactly', async () => {
    const body = toPutShape(LEGACY_MAP_CONTENT)
    // Servers before the defaultLinkWidht -> defaultLinkWidth rename read the old spelling; the
    // properties view writes both.
    body.defaultLinkWidth = body.defaultLinkWidht
    await api('PUT', `/v1/objects/${scratchId}/map`, body)
    const content = await api('GET', `/v1/objects/${scratchId}/map`)

    for (const key of MAP_CONTENT_SETTING_KEYS) {
      // Keys the legacy corpus does not carry (map-level `flags`) or whose
      // spelling is server-version dependent are asserted separately.
      if (LEGACY_MAP_CONTENT[key] === undefined) continue
      if (key === 'defaultLinkWidht' || key === 'defaultLinkWidth') continue
      expect(content[key], `setting ${key}`).toEqual(LEGACY_MAP_CONTENT[key])
    }
    expect(content.defaultLinkWidth ?? content.defaultLinkWidht).toBe(
      LEGACY_MAP_CONTENT.defaultLinkWidht,
    )
    expect(content.elements).toEqual(LEGACY_MAP_CONTENT.elements)
    expect(content.links).toEqual(LEGACY_MAP_CONTENT.links)
  })

  // Since 1a59cce3 the server takes map `flags` as a boolean object (PATCH semantics: omitted
  // keys keep their bit); skipped on older servers.
  it('accepts a boolean-object flags patch and leaves unlisted bits alone', async () => {
    const before = await api('GET', `/v1/objects/${scratchId}/map`)
    if (typeof before.flags !== 'object' || before.flags === null) return // pre-1a59cce3 server

    await api('PUT', `/v1/objects/${scratchId}/map`, {
      flags: { showStatusIcon: true, calculateStatus: false },
    })
    const after = await api('GET', `/v1/objects/${scratchId}/map`)

    expect(after.flags.showStatusIcon).toBe(true)
    expect(after.flags.calculateStatus).toBe(false)
    for (const key of Object.keys(before.flags)) {
      if (key === 'showStatusIcon' || key === 'calculateStatus') continue
      expect(after.flags[key], `unlisted flag ${key}`).toBe(before.flags[key])
    }
    // The UI's parse -> serialize pair agrees with the server's own encoding
    expect(serializeMapFlags(parseMapFlags(after.flags))).toEqual(after.flags)
  })

  it('an unedited UI save cycle is a no-op', async () => {
    const before = await api('GET', `/v1/objects/${scratchId}/map`)
    await api('PUT', `/v1/objects/${scratchId}/map`, uiSaveCycle(before))
    const after = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(after).toEqual(before)
  })

  it('settings-only PUT leaves elements and links untouched', async () => {
    const before = await api('GET', `/v1/objects/${scratchId}/map`)
    await api('PUT', `/v1/objects/${scratchId}/map`, { width: 2222 })
    const after = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(after.width).toBe(2222)
    expect(after.elements).toEqual(before.elements)
    expect(after.links).toEqual(before.links)
  })

  // Server behavior: flags of surviving elements (same id+type) are carried forward and the
  // value in the PUT body is ignored.
  it('ignores flag changes on surviving elements', async () => {
    const flipped = toPutShape(LEGACY_MAP_CONTENT)
    flipped.elements = flipped.elements.map((el) => (el.id === 2 ? { ...el, flags: 1 } : el))
    await api('PUT', `/v1/objects/${scratchId}/map`, flipped)
    const content = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(content.elements.find((e) => e.id === 2).flags).toBe(0)
  })

  // Documented server behavior: links are only processed
  // when the elements key is present - a links-only PUT is silently ignored.
  it('silently ignores a links-only PUT', async () => {
    const before = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(before.links.length).toBeGreaterThan(0)
    await api('PUT', `/v1/objects/${scratchId}/map`, { links: [] })
    const after = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(after.links).toEqual(before.links)
  })

  // Documented server behavior: PUTting elements without a
  // links key clears all links - which is why serializeNetworkMapContent()
  // always sends both arrays.
  it('clears links when elements are sent without a links key', async () => {
    const { links: _omitted, ...withoutLinks } = toPutShape(LEGACY_MAP_CONTENT)
    await api('PUT', `/v1/objects/${scratchId}/map`, withoutLinks)
    const content = await api('GET', `/v1/objects/${scratchId}/map`)
    expect(content.elements).toEqual(LEGACY_MAP_CONTENT.elements)
    expect(content.links).toEqual([])
  })
})
