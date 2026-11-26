// Asset links. On the fixtures (mocks/v1/_lib/assets.js) srv-dc-02 is linked to node web-01 itself,
// srv-dc-01 to a component of blade-01, spare-ssd-01 to nothing; links are kept by the mock server,
// so every test leaves them as it found them. On a server the test links an asset and a rack it
// creates itself.
import { test, expect } from './fixtures.js'
import { useMocks, watchProblems } from './support.js'

const LINUX_NODE = 502
const BLADE_NODE = 516
const SPARE_ASSET = 853
const SSD_SERIAL = 'S6KNNE0T512345'

const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })
const tableRow = (page, text) => page.locator('.node-table tbody tr').filter({ hasText: text })
const treeRow = (dialog, name) => dialog.locator('.tree-node-row', { hasText: name })

function linkRequests(page) {
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/asset-link')) {
      requests.push({ method: request.method(), body: request.postDataJSON() })
    }
  })
  return requests
}

test.describe('on the fixtures', () => {
  test.skip(!useMocks, 'links and unlinks fixture assets')

  test('a component is linked to an asset and unlinked again from its row', async ({ page }) => {
    const problems = watchProblems(page)
    const requests = linkRequests(page)
    await page.goto(`/infrastructure/${LINUX_NODE}/hardwareInventory`)
    const ssd = tableRow(page, SSD_SERIAL)
    await expect(ssd).toBeVisible()

    await ssd.click({ button: 'right' })
    await menuItem(page, 'Link to asset...').click()
    const picker = page.getByRole('dialog', { name: `Link Component ${SSD_SERIAL} to Asset` })
    await expect(picker.locator('.footer-hint')).toHaveText(
      "The component's serial number is written into the asset.",
    )
    await expect(picker.locator('.picker-intro')).toHaveCount(0)
    await expect(picker.getByRole('checkbox')).toHaveCount(0)
    await treeRow(picker, 'spare-ssd-01').click()
    await picker.getByRole('button', { name: 'Select', exact: true }).click()

    await expect(ssd.getByRole('link', { name: 'spare-ssd-01' })).toBeVisible()
    expect(requests).toEqual([
      { method: 'PUT', body: { objectId: LINUX_NODE, componentSerial: SSD_SERIAL } },
    ])

    await ssd.click({ button: 'right' })
    await menuItem(page, 'Unlink from asset').click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText(
      `Unlink asset "spare-ssd-01" from component ${SSD_SERIAL} of "web-01`,
    )
    await confirm.getByRole('button', { name: 'Unlink' }).click()

    await expect(ssd.getByRole('link', { name: 'spare-ssd-01' })).toHaveCount(0)
    expect(requests.at(-1)).toEqual({ method: 'DELETE', body: null })
    expect(problems.errors).toEqual([])
  })

  test('taking an asset from another object asks first, and Cancel sends nothing', async ({
    page,
  }) => {
    const requests = linkRequests(page)
    await page.goto(`/infrastructure/${BLADE_NODE}/hardwareInventory`)
    await page.locator('.tree-node-row.selected').click({ button: 'right' })
    await menuItem(page, 'Organize').hover()
    await menuItem(page, 'Link to asset...').click()

    const picker = page.getByRole('dialog', { name: /^Link blade-01.* to Asset$/ })
    await expect(picker.getByRole('checkbox')).toHaveCount(0)
    await treeRow(picker, 'Servers').locator('.tree-toggle').click()
    await treeRow(picker, 'srv-dc-02').click()
    await picker.getByRole('button', { name: 'Select', exact: true }).click()

    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText('Replace Asset Link')
    await expect(confirm).toContainText('Asset "srv-dc-02" is linked to "web-01')
    await confirm.getByRole('button', { name: 'Cancel' }).click()

    await expect(confirm).toBeHidden()
    expect(requests).toEqual([])
  })

  test('an asset is linked to a rack and unlinked again', async ({
    page,
  }) => {
    const requests = linkRequests(page)
    // A built bundle serves /assets/* as its own files, so the asset is opened from the tree.
    await page.goto('/assets')
    await page.locator('.tree-node-row', { hasText: 'Assets' }).locator('.tree-toggle').click()
    await page.locator('.tree-node-row', { hasText: 'spare-ssd-01' }).click()
    await expect(page).toHaveURL(new RegExp(`/assets/${SPARE_ASSET}`))
    await expect(page.getByText('Linked to')).toHaveCount(0)

    await page.locator('.tree-node-row.selected').click({ button: 'right' })
    await menuItem(page, 'Organize').hover()
    await menuItem(page, 'Link to object...').click()

    const picker = page.getByRole('dialog', { name: 'Link spare-ssd-01 to Object' })
    await expect(picker.getByRole('tab', { name: 'Infrastructure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(picker.getByRole('checkbox')).toHaveCount(0)
    await treeRow(picker, 'DataCenter-Alpha').locator('.tree-toggle').click()
    await treeRow(picker, 'Rack-DC-A-01').click()
    await picker.getByRole('button', { name: 'Select', exact: true }).click()

    await expect(page.getByText('Linked to Rack-DC-A-01')).toBeVisible()
    expect(requests[0].body).toEqual({ objectId: 514, updateIdentification: true })

    await page.locator('.tree-node-row.selected').click({ button: 'right' })
    await menuItem(page, 'Organize').hover()
    await menuItem(page, 'Unlink from object').click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText('Unlink asset "spare-ssd-01" from "Rack-DC-A-01"?')
    await confirm.getByRole('button', { name: 'Unlink' }).click()

    await expect(page.getByText('Linked to Rack-DC-A-01')).toHaveCount(0)
  })
})

test.describe('on a server', () => {
  test.skip(useMocks, 'creates its own asset and rack on the server')

  const INFRASTRUCTURE_ROOT = 2
  const ASSET_ROOT = 5

  test('a rack is linked to an asset and unlinked again', async ({ page, server }) => {
    const problems = watchProblems(page)
    // Created first, so the cleanup removes the rack first and that unlinks the asset.
    const asset = await server.createObject('Asset', ASSET_ROOT, 'asset', {
      assetProperties: { status: 'In storage' },
    })
    const rack = await server.createObject('Rack', INFRASTRUCTURE_ROOT, 'rack')

    await page.goto(`/infrastructure/${rack.id}`)
    await page.locator('.tree-node-row.selected').click({ button: 'right' })
    await menuItem(page, 'Organize').hover()
    await menuItem(page, 'Link to asset...').click()

    const picker = page.getByRole('dialog', { name: `Link ${rack.name} to Asset` })
    await picker.getByPlaceholder('Filter objects...').fill(asset.name)
    await treeRow(picker, asset.name).click()
    await picker.getByRole('button', { name: 'Select', exact: true }).click()

    await expect(page.getByText('Asset linked')).toBeVisible()
    const linked = await server.read(`/v1/objects/${asset.id}`)
    expect([linked.linkedObjectId, linked.componentSerial]).toEqual([rack.id, ''])

    await page.locator('.tree-node-row.selected').click({ button: 'right' })
    await menuItem(page, 'Organize').hover()
    await menuItem(page, 'Unlink from asset').click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText(`Unlink asset "${asset.name}" from "${rack.name}"?`)
    await confirm.getByRole('button', { name: 'Unlink' }).click()

    await expect(page.getByText('Asset unlinked')).toBeVisible()
    expect((await server.read(`/v1/objects/${asset.id}`)).linkedObjectId).toBe(0)
    expect(problems.errors).toEqual([])
    expect(problems.failedRequests).toEqual([])
  })
})
