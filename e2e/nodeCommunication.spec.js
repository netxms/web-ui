// Properties > Communication on a real server, on a node the test creates and removes: the protocol
// groups go out on the object PATCH and come back on the next GET.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(useMocks, 'the fixtures keep no saves')

const INFRASTRUCTURE_ROOT = 2

/** The collapsible panel with this title, opened. */
async function openPanel(page, title) {
  const panel = page.locator('.p-accordionpanel').filter({
    has: page.locator('.panel-header > span:first-child').getByText(title, { exact: true }),
  })
  await panel.locator('.p-accordionheader').click()
  return panel
}

async function typeNumber(input, value) {
  await input.click()
  await input.press('Control+a')
  await input.pressSequentially(String(value))
  await input.press('Tab')
}

test('node protocol settings save and read back', async ({ page, server }) => {
  const { id } = await server.createObject('Node', INFRASTRUCTURE_ROOT, 'node')
  await page.goto(`/infrastructure/${id}/properties?section=communication`)
  await expect(page.locator('legend', { hasText: 'General' })).toBeVisible()

  // Created without an address, so the box is ticked and the name field locked.
  const withoutIp = page.getByLabel('Node without IP address')
  if (await withoutIp.isChecked()) await withoutIp.uncheck()
  await page.getByLabel('Primary host name').fill('192.0.2.77')
  await page.getByLabel('Communication through external gateway').check()

  const ssh = await openPanel(page, 'SSH')
  await ssh.getByRole('textbox', { name: 'Login', exact: true }).fill('e2e-user')
  await typeNumber(ssh.getByRole('spinbutton', { name: 'Port', exact: true }), 2222)

  const vnc = await openPanel(page, 'VNC')
  await typeNumber(vnc.getByRole('spinbutton', { name: 'Port', exact: true }), 5901)

  const netconf = await openPanel(page, 'NETCONF')
  await typeNumber(netconf.getByRole('spinbutton', { name: 'Port', exact: true }), 8300)

  const modbus = await openPanel(page, 'Modbus')
  await typeNumber(modbus.getByRole('spinbutton', { name: 'Unit ID', exact: true }), 7)

  const eip = await openPanel(page, 'EtherNet/IP')
  await typeNumber(eip.getByRole('spinbutton', { name: 'TCP port', exact: true }), 44819)

  const icmp = await openPanel(page, 'ICMP')
  await icmp.getByRole('button', { name: 'On', exact: true }).click()
  await icmp.getByPlaceholder('IP address').fill('192.0.2.5')
  await icmp.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(icmp.getByText('192.0.2.5', { exact: true })).toBeVisible()

  const syslog = await openPanel(page, 'Syslog')
  await syslog.getByRole('textbox', { name: 'Codepage', exact: true }).fill('UTF-8')

  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('Unsaved changes')).toBeHidden()
  await expect(page.locator('.save-error')).toHaveCount(0)

  const node = await server.read(`/v1/objects/${id}`)
  expect(node).toMatchObject({
    primaryName: '192.0.2.77',
    externalGateway: true,
    syslogCodepage: 'UTF-8',
    ssh: { port: 2222, login: 'e2e-user', proxy: 0 },
    vnc: { port: 5901 },
    netconf: { port: 8300 },
    modbus: { tcpPort: 502, unitId: 7 },
    etherNetIp: { address: null, port: 44819 },
    icmp: { statCollectionMode: 'on', targets: ['192.0.2.5'] },
  })

  // What the server sends back is what the section shows.
  await page.reload()
  await expect(page.getByLabel('Primary host name')).toHaveValue('192.0.2.77')
  await expect(page.getByLabel('Communication through external gateway')).toBeChecked()
  const header = (title) =>
    page.locator('.p-accordionheader').filter({
      has: page.locator('.panel-header > span:first-child').getByText(title, { exact: true }),
    })
  await expect(header('SSH')).toContainText('TCP port 2222')
  await expect(header('SSH')).toContainText('login e2e-user')
  await expect(header('ICMP')).toContainText('statistics on')
  await expect(header('ICMP')).toContainText('1 additional target')
  await expect(header('Modbus')).toContainText('unit ID 7')
  await expect(header('Syslog')).toContainText('UTF-8')
})
