// The side toolbar grid toggle on the fixture map 604 (mocks/v1/objects/604.json), a plain map
// with no demo bar.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'needs the fixture map')

const canvas = (page) => page.locator('.network-map-canvas-wrap')
const grid = (page) => canvas(page).locator('svg.network-map-grid')
const gridButton = (page) => page.getByRole('button', { name: 'Show grid' })

test('the grid follows the side toolbar toggle', async ({ page }) => {
  await page.goto('/network-maps/604')
  await expect(canvas(page).locator('text', { hasText: 'db-primary' })).toBeVisible()

  await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(grid(page)).toHaveCount(0)

  await gridButton(page).click()
  await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(grid(page)).toHaveCount(1)

  await gridButton(page).click()
  await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(grid(page)).toHaveCount(0)
})
