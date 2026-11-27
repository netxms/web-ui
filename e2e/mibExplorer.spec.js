// MIB Explorer walks stream over a WebSocket. On fixtures, the stream and a small MIB tree are
// replayed; on a server, the system group of an SNMP node is walked for real.
import { test, expect } from './fixtures.js'
import { readTargets, useMocks } from './support.js'

const SYSTEM = '1.3.6.1.2.1.1'
const SYS_NAME = '1.3.6.1.2.1.1.5.0'

const snmpNode = () => (useMocks ? 522 : readTargets().snmpNode)

function mibNode(oid, name, children) {
  return {
    oid,
    name,
    children: children.map(([subId, childName, hasChildren]) => ({
      subId,
      oid: oid ? `${oid}.${subId}` : String(subId),
      name: childName,
      hasChildren,
    })),
  }
}

const MIB_TREE = {
  '': mibNode('', null, [[1, 'iso', true]]),
  '1': mibNode('1', 'iso', [[3, 'org', true]]),
  '1.3': mibNode('1.3', 'org', [[6, 'dod', true]]),
  '1.3.6': mibNode('1.3.6', 'dod', [[1, 'internet', true]]),
  '1.3.6.1': mibNode('1.3.6.1', 'internet', [[2, 'mgmt', true]]),
  '1.3.6.1.2': mibNode('1.3.6.1.2', 'mgmt', [[1, 'mib-2', true]]),
  '1.3.6.1.2.1': mibNode('1.3.6.1.2.1', 'mib-2', [[1, 'system', true]]),
  [SYSTEM]: mibNode(SYSTEM, 'system', [
    [1, 'sysDescr', false],
    [3, 'sysUpTime', false],
    [5, 'sysName', false],
  ]),
}

const VARIABLES = [
  { oid: '1.3.6.1.2.1.1.1.0', type: 'STRING', value: 'FortiGate-100F v7.4.3', rawValue: '466f' },
  { oid: '1.3.6.1.2.1.1.3.0', type: 'TIMETICKS', value: '123456' },
  { oid: SYS_NAME, type: 'STRING', value: 'fw-dmz-01', rawValue: '6677' },
]

/** @returns {{ bodies: object[] }} what the page asked the walk endpoint */
async function replayWalk(page, nodeId) {
  const seen = { bodies: [] }
  await page.route(/\/api\/v1\/snmp-mib(\/[\d.]+)?$/, (route) => {
    const oid = new URL(route.request().url()).pathname.split('/snmp-mib')[1].replace('/', '')
    const node = MIB_TREE[oid]
    return node ? route.fulfill({ json: node }) : route.fulfill({ status: 404, json: {} })
  })
  await page.route(`**/api/v1/objects/${nodeId}/snmp-walk`, (route) => {
    seen.bodies.push(route.request().postDataJSON())
    return route.fulfill({
      status: 202,
      json: { oid: SYSTEM, token: 't', expiresIn: 30, wsUrl: '/v1/snmp-walks/output/t' },
    })
  })
  await page.routeWebSocket(/snmp-walks\/output/, (socket) => {
    socket.send(JSON.stringify({ type: 'data', variables: VARIABLES.slice(0, 2) }))
    socket.send(JSON.stringify({ type: 'data', variables: VARIABLES.slice(2) }))
    socket.send(JSON.stringify({ type: 'completed', count: 3, truncated: false }))
    socket.close()
  })
  return seen
}

const resultsFilter = (page) => page.getByPlaceholder('Filter by value, OID or name...')
const resultRows = (page) => page.locator('.explorer-results .app-table tbody tr')

test('walks the system group of a node from the Tools perspective', async ({ page }) => {
  const nodeId = snmpNode()
  test.skip(!nodeId, 'the server has no SNMP node')
  const seen = useMocks ? await replayWalk(page, nodeId) : null

  await page.goto(`/tools/mib-explorer?node=${nodeId}&oid=${SYSTEM}`)
  // The selection from the URL is revealed in the tree.
  await expect(page.locator(`.mib-tree-item[data-oid="${SYSTEM}"]`)).toHaveClass(/is-selected/)
  await page.getByRole('button', { name: 'Walk', exact: true }).click()

  await expect(resultRows(page).filter({ hasText: SYS_NAME })).toHaveCount(1)
  await expect(resultRows(page).filter({ hasText: SYS_NAME })).toContainText('sysName.0')
  await expect(page.getByRole('button', { name: 'Walk', exact: true })).toBeEnabled()
  if (seen) {
    expect(seen.bodies).toEqual([{ oid: SYSTEM, stream: true, limit: 100000 }])
    await expect(page.locator('.node-table-count')).toHaveText('3 variables')
  }

  await resultsFilter(page).fill(SYS_NAME)
  await expect(resultRows(page)).toHaveCount(1)

  // Long names come back after a reload.
  await page.getByLabel('Short names').uncheck()
  await expect(resultRows(page).first()).toContainText('iso.org.dod.internet.mgmt.mib-2.system')
  await page.reload()
  await expect(page.getByLabel('Short names')).not.toBeChecked()
  await page.getByLabel('Short names').check()
})

test('a result row selects its MIB object in the tree', async ({ page }) => {
  test.skip(!useMocks, 'needs a known MIB tree')
  await replayWalk(page, 522)

  await page.goto(`/tools/mib-explorer?node=522&oid=${SYSTEM}`)
  await page.getByRole('button', { name: 'Walk', exact: true }).click()
  await resultRows(page).filter({ hasText: SYS_NAME }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Select in MIB tree' }).click()

  await expect(page).toHaveURL(/oid=1\.3\.6\.1\.2\.1\.1\.5(&|$)/)
  await expect(page.locator('.mib-tree-item[data-oid="1.3.6.1.2.1.1.5"]')).toHaveClass(
    /is-selected/,
  )
})

test('typing an instance OID selects and reveals its MIB object, keeping the text', async ({
  page,
}) => {
  test.skip(!useMocks, 'needs a known MIB tree')
  await replayWalk(page, 522)

  await page.goto('/tools/mib-explorer?node=522')
  const field = page.getByLabel('Object identifier (OID)')
  await field.fill(SYS_NAME)

  await expect(page.locator('.mib-tree-item[data-oid="1.3.6.1.2.1.1.5"]')).toHaveClass(
    /is-selected/,
  )
  await expect(page).toHaveURL(/oid=1\.3\.6\.1\.2\.1\.1\.5(&|$)/)
  await expect(field).toHaveValue(SYS_NAME)
})

test("Tools > MIB Explorer walks the node it was opened on, without a picker", async ({
  page,
}) => {
  test.skip(!useMocks, 'replays the walk on a fixture node')
  const seen = await replayWalk(page, 522)

  // The tree's summaries carry no capabilities; the header must use the node's document.
  await page.goto('/infrastructure/522/status')
  await page.getByRole('button', { name: 'Tools', exact: true }).click()
  await page.getByRole('menuitem', { name: 'MIB Explorer' }).click()
  await expect(page).toHaveURL(/\/infrastructure\/522\/mibExplorer/)
  await expect(page.getByRole('tab', { name: 'MIB Explorer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose...' })).toHaveCount(0)

  await page.getByLabel('Object identifier (OID)').fill(SYSTEM)
  await page.getByRole('button', { name: 'Walk', exact: true }).click()

  await expect(resultRows(page)).toHaveCount(3)
  expect(seen.bodies).toHaveLength(1)
})

test('a walk the server refuses says why', async ({ page }) => {
  test.skip(!useMocks, 'needs a scripted refusal')
  await page.route('**/api/v1/objects/522/snmp-walk', (route) =>
    route.fulfill({ status: 400, json: { reason: 'SNMP is not supported on this node' } }),
  )

  await page.goto(`/tools/mib-explorer?node=522&oid=${SYSTEM}`)
  await page.getByRole('button', { name: 'Walk', exact: true }).click()

  await expect(page.locator('.explorer-results')).toContainText(
    'SNMP is not supported on this node',
  )
})
