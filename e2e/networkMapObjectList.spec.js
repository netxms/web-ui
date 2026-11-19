// The search field's object list on the fixture map 604 (mocks/v1/objects/604.json): web-01 and
// web-02 on the layer Servers, fw-dmz-01 on Security, db-primary on none. Centering needs a real
// canvas, which a jsdom spec does not have.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'needs the layered fixture map')

const MAP = 604
const canvas = (page) => page.locator('.network-map-canvas-wrap')
const label = (page, text) => canvas(page).locator('text', { hasText: text })
const field = (page) => page.getByRole('combobox', { name: 'Search objects' })
const listButton = (page) => page.getByRole('button', { name: 'Show objects on this map' })
const layersButton = (page) =>
  page.locator('.network-map-toolbar').getByRole('button', { name: /^Layers/ })
const panel = (page) => page.getByRole('region', { name: 'Layers' })

async function horizontalOffsetFromCenter(page, name) {
  const c = await canvas(page).boundingBox()
  const l = await label(page, name).boundingBox()
  return Math.abs(l.x + l.width / 2 - (c.x + c.width / 2))
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/network-maps/${MAP}`)
  await expect(label(page, 'web-01')).toBeVisible()
})

test('picking an object from the list centers the map on it', async ({ page }) => {
  await listButton(page).click()
  await expect(page.getByRole('option')).toHaveCount(4)
  await page.getByRole('option', { name: /web-01/ }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(field(page)).toHaveValue('')
  await expect.poll(() => horizontalOffsetFromCenter(page, 'web-01')).toBeLessThan(30)
})

test('typing narrows the list, and Escape closes it before anything else', async ({ page }) => {
  await field(page).fill('web')
  await expect(page.getByRole('option')).toHaveText([/web-01/, /web-02/])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue('web')
})

test('Enter on a highlighted entry picks it and keeps the typed text', async ({ page }) => {
  await field(page).fill('web-02')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(field(page)).toHaveValue('web-02')
  await expect.poll(() => horizontalOffsetFromCenter(page, 'web-02')).toBeLessThan(30)
})

test('objects on a hidden layer are not listed', async ({ page }) => {
  await layersButton(page).click()
  await panel(page).getByRole('button', { name: 'Hide layer Servers' }).click()
  await listButton(page).click()
  await expect(page.getByRole('option', { name: /db-primary/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /web-01/ })).toHaveCount(0)
})

test('the list opens again right after a pick, and after a theme switch', async ({ page }) => {
  await listButton(page).click()
  await page.getByRole('option', { name: /db-primary/ }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  await listButton(page).click()
  await expect(page.getByRole('option')).toHaveCount(4)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Switch to / }).click()
  await listButton(page).click()
  await expect(page.getByRole('option')).toHaveCount(4)
})

test('the clear button is small, keeps off the dropdown button and clears the search', async ({
  page,
}) => {
  await field(page).fill('web')
  await page.keyboard.press('Escape')
  const clear = page.getByRole('button', { name: 'Clear search' })
  const button = await clear.boundingBox()
  const icon = await clear.locator('.pi').boundingBox()
  const dropdown = await listButton(page).boundingBox()
  expect(icon.height).toBeLessThanOrEqual(11)
  expect(dropdown.x - (button.x + button.width)).toBeGreaterThanOrEqual(2)

  await clear.click()
  await expect(field(page)).toHaveValue('')
})
