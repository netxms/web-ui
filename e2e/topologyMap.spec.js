// The object Topology Map tab on node 502 (mocks/v1/objects/502/topology/l2.json): ten nodes,
// links named by port, one LAG between the two core switches.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'needs the topology fixtures')

const canvas = (page) => page.locator('.topology-body .network-map-canvas-wrap')
const label = (page, text) => canvas(page).locator('text', { hasText: text })

test('the L2 map shows the objects with the port names at the link ends', async ({ page }) => {
  await page.goto('/infrastructure/502/topology')
  await expect(label(page, 'dist-sw-01')).toBeVisible()
  await expect(label(page, 'web-01')).toBeVisible()
  await expect(canvas(page).locator('.link-label-text', { hasText: 'gi0/1' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Show objects on this map' }).click()
  await expect(page.getByRole('option')).toHaveCount(10)
})

test('Physical links asks the server for L1 links', async ({ page }) => {
  await page.goto('/infrastructure/502/topology')
  await expect(label(page, 'dist-sw-01')).toBeVisible()

  const request = page.waitForRequest((r) => r.url().includes('/topology/l2?useL1Topology=true'))
  await page.getByRole('button', { name: 'Physical links' }).click()
  await request
  await expect(page.getByRole('button', { name: 'Physical links' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(label(page, 'dist-sw-01')).toBeVisible()
})

test('the grid toggle and the layout choice apply to the map', async ({ page }) => {
  await page.goto('/infrastructure/502/topology')
  await expect(label(page, 'dist-sw-01')).toBeVisible()

  await expect(canvas(page).locator('svg.network-map-grid')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show grid' }).click()
  await expect(canvas(page).locator('svg.network-map-grid')).toHaveCount(1)

  const before = await label(page, 'web-01').boundingBox()
  await page.getByRole('combobox', { name: 'Layout' }).click()
  await page.getByRole('option', { name: 'Grid' }).click()
  await expect.poll(async () => (await label(page, 'web-01').boundingBox())?.x).not.toBe(before.x)
  await expect(label(page, 'dist-sw-01')).toBeVisible()
})

const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })

async function openDisplayMenu(page) {
  await page.getByRole('button', { name: 'Display' }).click()
  await expect(menuItem(page, 'Small labels')).toBeVisible()
}

test('the Display menu sets the display mode and keeps it after a reload', async ({ page }) => {
  await page.goto('/infrastructure/502/topology')
  await expect(label(page, 'dist-sw-01')).toBeVisible()

  await openDisplayMenu(page)
  await expect(menuItem(page, 'Icons').locator('.pi-check')).toHaveCount(1)
  await expect(menuItem(page, 'Show status frame')).toHaveAttribute('aria-disabled', 'false')
  await menuItem(page, 'Small labels').click()

  await openDisplayMenu(page)
  await expect(menuItem(page, 'Small labels').locator('.pi-check')).toHaveCount(1)
  await expect(menuItem(page, 'Icons').locator('.pi-check')).toHaveCount(0)
  // Status decorations belong to the icon display, as in the map properties.
  await expect(menuItem(page, 'Show status frame')).toHaveAttribute('aria-disabled', 'true')
  await menuItem(page, 'Show link direction').click()

  await page.reload()
  await expect(label(page, 'dist-sw-01')).toBeVisible()
  await openDisplayMenu(page)
  await expect(menuItem(page, 'Small labels').locator('.pi-check')).toHaveCount(1)
  await expect(menuItem(page, 'Show link direction').locator('.pi-check')).toHaveCount(1)
})

test('a right click on the map background opens the same display options', async ({ page }) => {
  await page.goto('/infrastructure/502/topology')
  await expect(label(page, 'dist-sw-01')).toBeVisible()

  const box = await canvas(page).boundingBox()
  await page.mouse.click(box.x + 15, box.y + box.height - 15, { button: 'right' })
  await expect(menuItem(page, 'Display objects as')).toBeVisible()
  await expect(menuItem(page, 'Show link direction')).toBeVisible()
})

test('a dragged node stays where it was dropped when the merge toggle redraws the map', async ({
  page,
}) => {
  await page.goto('/infrastructure/502/topology')
  const web = label(page, 'web-01')
  await expect(web).toBeVisible()
  await page.getByRole('combobox', { name: 'Layout' }).click()
  await page.getByRole('option', { name: 'Grid' }).click()
  await page.waitForTimeout(500)

  // The label sits under the node icon, which takes the press.
  const start = await web.boundingBox()
  const grab = { x: start.x + start.width / 2, y: start.y - 20 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 60, grab.y + 40, { steps: 5 })
  await page.mouse.move(grab.x + 120, grab.y + 80, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await web.boundingBox()).x - start.x)).toBe(120)
  const dropped = await web.boundingBox()

  // Merge parallel links: the third side toolbar button.
  await page.getByRole('toolbar', { name: 'Map tools' }).getByRole('button').nth(2).click()
  await page.waitForTimeout(500)
  const after = await web.boundingBox()
  expect(Math.round(after.x)).toBe(Math.round(dropped.x))
  expect(Math.round(after.y)).toBe(Math.round(dropped.y))
})
