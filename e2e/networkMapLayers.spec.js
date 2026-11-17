// Network map layers on the fixture map 604 (mocks/v1/objects/604.json): elements on the
// layers Notes, Security and Servers, one node on none. Hiding is per account and never saved.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'needs the layered fixture map')

const MAP = 604
const canvas = (page) => page.locator('.network-map-canvas-wrap')
const label = (page, text) => canvas(page).locator('text', { hasText: text })
const layersButton = (page) =>
  page.locator('.network-map-toolbar').getByRole('button', { name: /^Layers/ })
const panel = (page) => page.getByRole('region', { name: 'Layers' })
const row = (page, name) => panel(page).getByRole('button', { name: new RegExp(`^${name}\\b`) })

async function openPanel(page) {
  await expect(label(page, 'db-primary')).toBeVisible()
  await layersButton(page).click()
  await expect(panel(page)).toBeVisible()
}

/** Right click on a node: its label sits under the icon, which takes the click. */
async function clickNode(page, name, options) {
  const box = await label(page, name).boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y - 20, options)
}

/** Saves through the edit bar and returns the PUT body. */
async function saveMap(page) {
  let saved = null
  await page.route(`**/api/v1/objects/${MAP}/map`, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    saved = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => saved).not.toBeNull()
  return Object.fromEntries(saved.elements.map((e) => [e.id, e.layer]))
}

test('the panel hides a layer, and both stay that way after a reload', async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await openPanel(page)
  await expect(panel(page).locator('.layer-row__name')).toHaveText(['Notes', 'Security', 'Servers'])

  await panel(page).getByRole('button', { name: 'Hide layer Servers' }).click()
  await expect(layersButton(page)).toHaveText('Layers (1 hidden)')
  await expect(label(page, 'web-01')).toHaveCount(0)
  await expect(label(page, 'web-02')).toHaveCount(0)
  // On no layer: always shown.
  await expect(label(page, 'db-primary')).toBeVisible()

  await page.reload()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Show layer Servers' })).toBeVisible()
  await expect(label(page, 'db-primary')).toBeVisible()
  await expect(label(page, 'web-01')).toHaveCount(0)

  await panel(page).getByRole('button', { name: 'Show all' }).click()
  await expect(layersButton(page)).toHaveText('Layers')
  await expect(label(page, 'web-01')).toBeVisible()
})

test('Hide all leaves only the elements on no layer', async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await openPanel(page)
  await panel(page).getByRole('button', { name: 'Hide all' }).click()
  await expect(layersButton(page)).toHaveText('Layers (3 hidden)')
  await expect(label(page, 'db-primary')).toBeVisible()
  await expect(label(page, 'web-01')).toHaveCount(0)
  await expect(label(page, 'fw-dmz-01')).toHaveCount(0)
})

test('a layer brought forward dims the rest, and the arrow keys step through', async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await openPanel(page)

  await row(page, 'Security').click()
  await expect(row(page, 'Security')).toHaveAttribute('aria-pressed', 'true')
  await expect(label(page, 'fw-dmz-01')).toHaveAttribute('fill-opacity', '1')
  await expect(label(page, 'web-01')).toHaveAttribute('fill-opacity', '0.4')
  await expect(label(page, 'db-primary')).toHaveAttribute('fill-opacity', '0.4')

  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Servers')).toHaveAttribute('aria-pressed', 'true')
  await expect(label(page, 'web-01')).toHaveAttribute('fill-opacity', '1')
  await expect(label(page, 'fw-dmz-01')).toHaveAttribute('fill-opacity', '0.4')

  await page.keyboard.press('Escape')
  await expect(row(page, 'Servers')).toHaveAttribute('aria-pressed', 'false')
  await expect(label(page, 'fw-dmz-01')).toHaveAttribute('fill-opacity', '1')
})

test('an empty panel leads to the first layer, made from the selection', async ({ page }) => {
  await page.route(`**/api/v1/objects/${MAP}`, async (route) => {
    const response = await route.fetch()
    const map = await response.json()
    for (const el of map.elements) el.layer = ''
    await route.fulfill({ response, json: map })
  })
  await page.goto(`/network-maps/${MAP}`)
  await openPanel(page)
  await expect(panel(page)).toContainText('No layers on this map yet.')
  const create = panel(page).getByRole('button', { name: 'New layer from selection' })
  await expect(create).toBeDisabled()

  await clickNode(page, 'db-primary')
  await expect(create).toBeEnabled()
  await create.click()
  const dialog = page.getByRole('dialog', { name: 'New Layer' })
  await dialog.getByLabel('Layer name').fill('Databases')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(panel(page).locator('.layer-row__name')).toHaveText(['Databases'])
  expect(await saveMap(page)).toEqual({ 1: '', 2: '', 3: 'Databases', 4: '', 5: '', 6: '' })
})

test('Rename moves a layer to the new name', async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await openPanel(page)

  await panel(page).getByRole('button', { name: 'Layer Notes actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename...' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename Layer' })
  await expect(dialog.getByLabel('Layer name')).toHaveValue('Notes')
  await dialog.getByLabel('Layer name').fill('Annotations')
  await dialog.getByRole('button', { name: 'Rename' }).click()

  await expect(panel(page).locator('.layer-row__name')).toHaveText([
    'Annotations',
    'Security',
    'Servers',
  ])
  expect((await saveMap(page))[6]).toBe('Annotations')
})

test('Set Layer on a node puts it on a new layer through edit mode', async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await expect(label(page, 'db-primary')).toBeVisible()

  await clickNode(page, 'db-primary', { button: 'right' })
  const menu = page.locator('.p-contextmenu')
  await menu.getByRole('menuitem', { name: 'Set Layer' }).hover()
  await menu.getByRole('menuitem', { name: 'New Layer...' }).click()

  const dialog = page.getByRole('dialog', { name: 'New Layer' })
  await dialog.getByLabel('Layer name').fill('Databases')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  expect(await saveMap(page)).toEqual({
    1: 'Servers',
    2: 'Servers',
    3: 'Databases',
    4: 'Security',
    5: 'Servers',
    6: 'Notes',
  })
})
