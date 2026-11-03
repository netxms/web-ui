// @vitest-environment node
/**
 * Old/new UI parity against a live server; skipped unless the env vars are set:
 *
 *   NETXMS_URL=http://your-server:8000 NETXMS_USER=admin NETXMS_PASSWORD=... yarn test:parity
 *
 * Every dashboard on the server must survive the adapt -> serialize round trip, and
 * PUT /v1/objects/{id}/dashboard is checked on a scratch dashboard reused by name (the WebAPI
 * has no object deletion). Uses raw fetch: src/api/client.js needs Pinia and the router.
 * 2FA-enabled accounts are not supported.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { adaptApiDashboard, serializeDashboard } from '@/utils/dashboardAdapters'
import { getTypeDefByApi } from '@/utils/dashboardElements'
import { LEGACY_ELEMENTS } from '@/utils/__tests__/fixtures/legacyElements'

const BASE = process.env.NETXMS_URL
const USER = process.env.NETXMS_USER
const PASSWORD = process.env.NETXMS_PASSWORD ?? ''
const SCRATCH_NAME = '__ui-parity-test__'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/** Element data/layout may arrive as JSON strings on older payloads - normalize. */
function asObject(value) {
  if (typeof value !== 'string') return value ?? {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function collectDashboards(nodes, acc = []) {
  for (const node of nodes ?? []) {
    if (node.class === 'Dashboard') acc.push(node)
    if (node.children?.length) collectDashboards(node.children, acc)
  }
  return acc
}

/** Round-trip invariants for one live dashboard; returns failure messages, empty on pass. */
function roundTripFailures(dashboard) {
  const failures = []
  const original = (dashboard.elements ?? []).map((e) => ({
    ...e,
    data: asObject(e.data),
    layout: asObject(e.layout),
  }))
  const serialized = serializeDashboard(
    adaptApiDashboard(structuredClone({ ...dashboard, elements: original })),
  )

  if (serialized.elements.length !== original.length) {
    failures.push(`element count ${original.length} -> ${serialized.elements.length}`)
    return failures
  }

  original.forEach((orig, i) => {
    const rt = orig.guid
      ? serialized.elements.find((e) => e.guid === String(orig.guid))
      : serialized.elements[i]
    const label = `element[${i}] type ${orig.type}`
    if (!rt) {
      failures.push(`${label}: lost from output`)
      return
    }
    if (rt.type !== orig.type) failures.push(`${label}: type changed to ${rt.type}`)

    const def = getTypeDefByApi(orig.type)
    const before = JSON.stringify(def.fromApi(orig.data))
    const after = JSON.stringify(def.fromApi(rt.data))
    if (before !== after) failures.push(`${label}: render config changed ${before} -> ${after}`)

    const written = new Set(Object.keys(def.toApi(def.fromApi(orig.data), orig.data)))
    for (const key of Object.keys(orig.data)) {
      if (written.has(key)) continue
      if (JSON.stringify(rt.data[key]) !== JSON.stringify(orig.data[key])) {
        failures.push(`${label}: unmodeled data.${key} changed`)
      }
    }

    for (const key of Object.keys(orig.layout)) {
      if (key === 'horizontalSpan' || key === 'verticalSpan') continue
      if (JSON.stringify(rt.layout[key]) !== JSON.stringify(orig.layout[key])) {
        failures.push(`${label}: layout.${key} changed`)
      }
    }
  })
  return failures
}

describe.skipIf(!BASE || !USER)('live dashboard parity (test server)', () => {
  let rootId = null
  let scratchId = null

  beforeAll(async () => {
    await login()
    const objects = await api('GET', '/v1/objects')
    rootId = (objects ?? []).find((o) => o.class === 'DashboardRoot')?.id
    if (!rootId) throw new Error('DashboardRoot object not found on server')
  })

  afterAll(async () => {
    // Best-effort: leave the scratch dashboard empty for the next run
    if (token && scratchId) {
      await api('PUT', `/v1/objects/${scratchId}/dashboard`, { numColumns: 4, elements: [] }).catch(
        () => {},
      )
    }
  })

  it('every existing dashboard survives the adapter round trip', async () => {
    const tree = await api('GET', `/v1/objects/${rootId}/sub-tree`)
    const dashboards = collectDashboards(tree).filter((d) => d.name !== SCRATCH_NAME)
    const allFailures = []

    for (const { id, name } of dashboards) {
      const content = await api('GET', `/v1/objects/${id}/dashboard`)
      const full = await api('GET', `/v1/objects/${id}`)

      if ((content.numColumns ?? 0) !== (full.numColumns ?? 0)) {
        allFailures.push(`"${name}" [${id}]: /dashboard and object GET disagree on numColumns`)
      }
      if (JSON.stringify(content.elements ?? []) !== JSON.stringify(full.elements ?? [])) {
        allFailures.push(`"${name}" [${id}]: /dashboard and object GET disagree on elements`)
      }

      for (const failure of roundTripFailures(content)) {
        allFailures.push(`"${name}" [${id}]: ${failure}`)
      }
    }

    expect(dashboards.length).toBeGreaterThan(0)
    expect(allFailures).toEqual([])
  })

  it('finds or creates the scratch dashboard', async () => {
    const tree = await api('GET', `/v1/objects/${rootId}/sub-tree`)
    scratchId = collectDashboards(tree).find((d) => d.name === SCRATCH_NAME)?.id
    if (!scratchId) {
      const created = await api('POST', '/v1/objects', {
        class: 'Dashboard',
        name: SCRATCH_NAME,
        parentId: rootId,
      })
      scratchId = created.id
    }
    expect(scratchId).toBeTruthy()
  })

  it('PUT round-trips the legacy corpus exactly', async () => {
    await api('PUT', `/v1/objects/${scratchId}/dashboard`, {
      numColumns: 12,
      elements: LEGACY_ELEMENTS,
    })
    const content = await api('GET', `/v1/objects/${scratchId}/dashboard`)
    expect(content.numColumns).toBe(12)
    expect(
      content.elements.map((e) => ({ ...e, data: asObject(e.data), layout: asObject(e.layout) })),
    ).toEqual(LEGACY_ELEMENTS)
  })

  it('assigns a guid to elements sent without one', async () => {
    await api('PUT', `/v1/objects/${scratchId}/dashboard`, {
      elements: [
        ...LEGACY_ELEMENTS,
        {
          type: 0,
          data: { title: 'no guid probe' },
          layout: { horizontalSpan: 1, verticalSpan: 1 },
        },
      ],
    })
    const content = await api('GET', `/v1/objects/${scratchId}/dashboard`)
    const probe = content.elements.find((e) => asObject(e.data).title === 'no guid probe')
    expect(probe).toBeDefined()
    expect(probe.guid).toMatch(UUID_RE)
    expect(LEGACY_ELEMENTS.some((e) => e.guid === probe.guid)).toBe(false)
  })

  it('leaves elements untouched when the key is absent', async () => {
    const before = await api('GET', `/v1/objects/${scratchId}/dashboard`)
    await api('PUT', `/v1/objects/${scratchId}/dashboard`, { numColumns: 7 })
    const after = await api('GET', `/v1/objects/${scratchId}/dashboard`)
    expect(after.numColumns).toBe(7)
    expect(after.elements).toEqual(before.elements)
  })

  it('fully replaces elements when the key is present', async () => {
    await api('PUT', `/v1/objects/${scratchId}/dashboard`, {
      numColumns: 12,
      elements: LEGACY_ELEMENTS.slice(0, 2),
    })
    const content = await api('GET', `/v1/objects/${scratchId}/dashboard`)
    expect(content.elements).toHaveLength(2)
  })
})
