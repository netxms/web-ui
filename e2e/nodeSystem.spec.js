// System views of a node: inventories, processes, services and user sessions. On the fixtures
// (mocks/v1/_lib/nodeInventory.js) 516 is a Windows node with an agent and ENTITY-MIB, 502 a Linux
// node and 522 an SNMP-only firewall; agent actions go out as execute-agent-command lines.
import { test, expect } from './fixtures.js'
import { readTargets, useMocks, watchProblems } from './support.js'

const WINDOWS_NODE = 516
const LINUX_NODE = 502
const FIREWALL_NODE = 522

const rows = (page) => page.locator('.node-table tbody tr')
const row = (page, text) => rows(page).filter({ hasText: text })
const selection = (page) => page.getByRole('group', { name: 'Selection' })
const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })

/** Command lines the page sends, in order. */
function agentCommands(page) {
  const commands = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/execute-agent-command')) {
      commands.push(request.postDataJSON().command)
    }
  })
  return commands
}

test.describe('on the fixtures', () => {
  test.skip(!useMocks, 'agent actions and the component tree need the fixtures')

  test('a package is uninstalled through the agent after a confirmation', async ({ page }) => {
    const commands = agentCommands(page)
    await page.goto(`/infrastructure/${WINDOWS_NODE}/softwareInventory`)
    await expect(page.getByText('8 packages')).toBeVisible()

    await row(page, 'Microsoft SQL Server 2022').click({ button: 'right' })
    await menuItem(page, 'Uninstall...').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Microsoft SQL Server 2022 (64-bit)')
    await dialog.getByRole('button', { name: 'Uninstall' }).click()

    await expect(page.getByText('Uninstall requested')).toBeVisible()
    expect(commands).toEqual(['System.UninstallProduct "Microsoft SQL Server SQL2022"'])
  })

  test('hardware switches to the component tree, which folds and filters', async ({ page }) => {
    await page.goto(`/infrastructure/${WINDOWS_NODE}/hardwareInventory`)
    await expect(page.getByText('7 components')).toBeVisible()
    await expect(row(page, 'PROC 1 DIMM 1')).toContainText('64 GiB')
    await expect(row(page, 'Motherboard').getByRole('link', { name: 'srv-dc-01' })).toBeVisible()

    await page.getByRole('button', { name: 'ENTITY-MIB' }).click()
    await expect(page.getByText('6 components')).toBeVisible()

    await page.getByRole('button', { name: 'Collapse FlexFabric 650FLB' }).click()
    await expect(page.getByText('4 components')).toBeVisible()

    await page.getByPlaceholder('Filter components...').fill('LOM2')
    await expect(page.getByText('3 components')).toBeVisible()
    await expect(row(page, 'LOM2')).toBeVisible()
  })

  test('an SNMP-only node gets the component tree alone', async ({ page }) => {
    await page.goto(`/infrastructure/${FIREWALL_NODE}/hardwareInventory`)
    await expect(page.getByText('20 components')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agent', exact: true })).toHaveCount(0)
    await expect(
      row(page, 'FG200FT921900123').getByRole('link', { name: 'sw-core-01' }),
    ).toBeVisible()
    await expect(row(page, 'PS-200F-0001')).not.toContainText('PowerSupply')
  })

  test('terminating processes asks first and reports what the agent refused', async ({ page }) => {
    const commands = agentCommands(page)
    await page.goto(`/infrastructure/${LINUX_NODE}/processes`)
    await expect(page.getByText('12 processes')).toBeVisible()

    await row(page, '/usr/lib/systemd/systemd --system').getByRole('checkbox').click()
    await row(page, '/opt/app/worker.py').getByRole('checkbox').click()
    await expect(selection(page)).toContainText('2 selected')
    await selection(page).getByRole('button', { name: 'Terminate' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Terminate 2 selected processes?')
    expect(commands).toEqual([])
    await dialog.getByRole('button', { name: 'Terminate' }).click()

    await expect(page.getByText('1 of 2 failed: Access denied')).toBeVisible()
    expect(commands.toSorted()).toEqual(['Process.Terminate 1', 'Process.Terminate 2207'])
  })

  test('services start on a selection and change start type on Windows', async ({ page }) => {
    const commands = agentCommands(page)
    await page.goto(`/infrastructure/${WINDOWS_NODE}/services`)
    await expect(page.getByText('10 services')).toBeVisible()

    await row(page, 'SQL Server Agent (SQL2022)').getByRole('checkbox').click()
    await row(page, 'Windows Update').getByRole('checkbox').click()
    await selection(page).getByRole('button', { name: 'Start' }).click()
    await expect(page.getByText('Service started')).toBeVisible()

    await row(page, 'Xbox Live Game Save').click({ button: 'right' })
    await menuItem(page, 'Change Start Type').hover()
    await menuItem(page, 'Manual').click()
    await expect(page.getByText('Start type set to Manual')).toBeVisible()

    expect(commands).toEqual([
      'Service.Start SQLAgent$SQL2022',
      'Service.Start wuauserv',
      'Service.SetStartType.Manual XblGameSave',
    ])
  })

  test('a screenshot needs a session agent; log off asks first', async ({ page }) => {
    const commands = agentCommands(page)
    await page.goto(`/infrastructure/${WINDOWS_NODE}/userSessions`)
    await expect(page.getByText('3 sessions')).toBeVisible()
    await expect(row(page, 'svc-backup')).toContainText('Disconnected')

    await row(page, 'svc-backup').click({ button: 'right' })
    await expect(menuItem(page, 'Take Screenshot')).toHaveAttribute('aria-disabled', 'true')
    await menuItem(page, 'Log Off...').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Log off svc-backup (session 2)?')
    await dialog.getByRole('button', { name: 'Log Off' }).click()
    await expect(page.getByText('Session logged off')).toBeVisible()
    expect(commands).toEqual(['System.TerminateUserSession 2'])

    await row(page, 'LAPTOP-BOB').click({ button: 'right' })
    await expect(menuItem(page, 'Take Screenshot')).not.toHaveAttribute('aria-disabled', 'true')
  })

  test('an unreachable agent is an error in the view, not a server outage', async ({ page }) => {
    await page.addInitScript(() => {
      window.serverUnavailableEvents = 0
      window.addEventListener('app:server-unavailable', () => window.serverUnavailableEvents++)
    })
    await page.route('**/api/v1/objects/*/user-sessions', (route) =>
      route.fulfill({ status: 503, json: { reason: 'No connection to agent' } }),
    )
    await page.goto(`/infrastructure/${WINDOWS_NODE}/userSessions`)

    await expect(page.getByText('No connection to agent')).toBeVisible()
    expect(await page.evaluate(() => window.serverUnavailableEvents)).toBe(0)
  })

  test('a server without the component tree says so', async ({ page }) => {
    await page.route('**/api/v1/objects/*/physical-components', (route) =>
      route.fulfill({ status: 404, json: {} }),
    )
    await page.goto(`/infrastructure/${FIREWALL_NODE}/hardwareInventory`)
    await expect(
      page.getByText('This server does not provide the ENTITY-MIB component tree.'),
    ).toBeVisible()
  })
})

test.describe('on a server', () => {
  test.skip(useMocks, 'needs a real server')

  test('stored inventories of an agent node read without errors', async ({ page }) => {
    const { agentNode } = readTargets()
    test.skip(!agentNode, 'the server has no node with an agent')
    const problems = watchProblems(page)

    await page.goto(`/infrastructure/${agentNode}/softwareInventory`)
    await expect(
      page.getByText(/\d+ packages?$|No software inventory collected/).first(),
    ).toBeVisible()
    await page.goto(`/infrastructure/${agentNode}/hardwareInventory`)
    await expect(
      page.getByText(/\d+ components?$|No hardware inventory collected/).first(),
    ).toBeVisible()

    expect(problems.errors).toEqual([])
    // The rest of the page (the object tree) can meet the server's transport 502s.
    expect(problems.failedRequests.filter((text) => text.includes('inventory'))).toEqual([])
  })
})
