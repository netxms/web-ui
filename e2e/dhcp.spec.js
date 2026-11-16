// DHCP view on the fixture DHCP server (mocks/v1/_lib/dhcp.js): a scope narrows the leases,
// tables export what they show, and agent failures stay inside the view.
import fs from 'node:fs'
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'needs a DHCP server node; the fixtures have one')

const DHCP_NODE = 395
const LEASES_URL = `**/api/v1/objects/${DHCP_NODE}/dhcp/leases*`

function dhcpPage(page) {
  const scopes = page.getByRole('region', { name: 'DHCP scopes' })
  return {
    scopes,
    scopeRow: (text) => scopes.locator('tbody tr').filter({ hasText: text }),
    chip: page.locator('.scope-chip'),
  }
}

test('a scope narrows the leases and its chip clears it', async ({ page }) => {
  const view = dhcpPage(page)
  await page.goto(`/infrastructure/${DHCP_NODE}/dhcp`)

  await expect(view.scopes.getByText('4 scopes')).toBeVisible()
  await expect(view.scopeRow('Lab').getByText('Disabled')).toBeVisible()
  await expect(page.getByText('84 leases')).toBeVisible()

  await view.scopeRow('Guest Wi-Fi').click()
  await expect(view.chip).toContainText('Scope: 10.20.2.0/24')
  await expect(page.getByText('36 leases')).toBeVisible()

  await view.scopeRow('Guest Wi-Fi').click()
  await expect(view.chip).toHaveCount(0)
  await expect(page.getByText('84 leases')).toBeVisible()

  await view.scopeRow('VoIP Phones').click()
  await expect(page.getByText('19 leases')).toBeVisible()
  await view.chip.locator('.p-chip-remove-icon').click()
  await expect(page.getByText('84 leases')).toBeVisible()
})

test('leases export to CSV in the table order', async ({ page }) => {
  await page.goto(`/infrastructure/${DHCP_NODE}/dhcp`)
  await expect(page.getByText('84 leases')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export to CSV', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('dhcp-leases-dhcp-01.office.example.com.csv')

  const text = fs.readFileSync(await file.path(), 'utf-8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const lines = text.slice(1).split('\r\n')
  expect(lines[0]).toBe(
    'IP Address,MAC Address,NIC Vendor,Host Name,Node,Client ID,Scope,Type,State,' +
      'Last Transaction,Expiration',
  )
  expect(lines).toHaveLength(85)
  expect(lines[1]).toMatch(/^10\.20\.1\.20,.*,wifi-1\.office\.example\.com,.*,10\.20\.1\.0\/24,/)
})

test('a server without a lease list keeps its scopes', async ({ page }) => {
  await page.route(LEASES_URL, (route) =>
    route.fulfill({
      status: 501,
      json: { reason: 'Requested information is not supported by DHCP server' },
    }),
  )
  await page.goto(`/infrastructure/${DHCP_NODE}/dhcp`)

  await expect(page.getByText('Lease list is not available for this DHCP server.')).toBeVisible()
  await expect(dhcpPage(page).scopes.getByText('4 scopes')).toBeVisible()
})

test('an unreachable agent is an error in the view, not a server outage', async ({ page }) => {
  await page.addInitScript(() => {
    window.serverUnavailableEvents = 0
    window.addEventListener('app:server-unavailable', () => window.serverUnavailableEvents++)
  })
  await page.route(LEASES_URL, (route) =>
    route.fulfill({ status: 503, json: { reason: 'Cannot communicate with agent' } }),
  )
  await page.goto(`/infrastructure/${DHCP_NODE}/dhcp`)

  await expect(page.getByText('Cannot communicate with agent')).toBeVisible()
  expect(await page.evaluate(() => window.serverUnavailableEvents)).toBe(0)
})
