// VISUAL_PASS R21: a view is found as it was left. Client behavior, so it runs on fixtures, with
// enough DCIs served here to have pages and scrolling.
import { test, expect } from './fixtures.js'
import { openPerspective, useMocks } from './support.js'

test.skip(!useMocks, 'serves its own rows for fixture nodes')

const NODE_A = 502
const NODE_B_NAME = 'web-02.dc-alpha.example.com'

const DCI_ROWS = Array.from({ length: 300 }, (_, index) => ({
  id: 1000 + index,
  description: `${index % 2 ? 'CPU core' : 'Memory bank'} ${String(index).padStart(3, '0')}`,
  value: String(index),
  unitName: '%',
  dataType: 'float',
  status: 0,
  timestamp: '2026-07-08T09:55:00Z',
}))

function dciPage(page) {
  const table = page.locator('.app-table').first()
  return {
    table,
    filter: page.getByPlaceholder('Filter by description or metric...'),
    rows: table.locator('tbody tr:not(.app-table__expansion-row)'),
    openRows: table.locator('tbody tr.app-table__expansion-row'),
    description: table.locator('thead th').filter({ hasText: 'Description' }),
    currentPage: page.locator('.p-paginator-page-selected'),
    scroller: page.locator('.app-table-wrap').first(),
    selectedCount: page.getByText('1 selected'),
  }
}

/**
 * Filter "cpu", description sorted the other way than its default, page 2, two rows open, one
 * ticked, scrolled down.
 */
async function leaveAWorkingState(page) {
  const view = dciPage(page)
  await page.goto(`/infrastructure/${NODE_A}/dcis`)
  await expect(view.rows).toHaveCount(100)

  await view.filter.fill('cpu')
  await view.description.click()
  await expect(view.description).toHaveAttribute('aria-sort', 'descending')
  await page.locator('.p-paginator-page', { hasText: /^2$/ }).click()
  await expect(view.rows).toHaveCount(50)

  await view.rows.nth(1).click()
  await view.rows.nth(2).click()
  await expect(view.openRows).toHaveCount(2)
  await view.rows.nth(3).locator('.app-table__checkbox-wrap').click()
  await expect(view.selectedCount).toBeVisible()

  await view.scroller.evaluate((el) => (el.scrollTop = 400))
  await expect.poll(() => view.scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(300)
  return view.scroller.evaluate((el) => el.scrollTop)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/objects/*/data-collection/current-values', (route) =>
    route.fulfill({ json: { values: DCI_ROWS } }),
  )
  await page.route('**/api/v1/objects/*/data-collection/*/history*', (route) =>
    route.fulfill({ json: { values: [] } }),
  )
})

test('R21.1 everything is back after visiting another perspective', async ({ page }) => {
  const scrollTop = await leaveAWorkingState(page)
  const view = dciPage(page)

  await openPerspective(page, 'Alarms')
  await expect(page).toHaveURL(/\/alarms/)
  await openPerspective(page, 'Infrastructure')

  await expect(view.filter).toHaveValue('cpu')
  await expect(view.description).toHaveAttribute('aria-sort', 'descending')
  await expect(view.currentPage).toHaveText('2')
  await expect(view.openRows).toHaveCount(2)
  await expect(view.selectedCount).toBeVisible()
  await expect.poll(() => view.scroller.evaluate((el) => el.scrollTop)).toBe(scrollTop)
})

test('R21.2 leaving through a view tab keeps it too', async ({ page }) => {
  await leaveAWorkingState(page)
  const view = dciPage(page)

  await page.getByRole('tab', { name: 'Interfaces' }).click()
  await expect(page).toHaveURL(/\/interfaces/)
  await page.getByRole('tab', { name: 'Data Collection' }).click()

  await expect(view.filter).toHaveValue('cpu')
  await expect(view.currentPage).toHaveText('2')
  await expect(view.openRows).toHaveCount(2)
})

test('R21.3 another node keeps the filter and sort, and nothing else', async ({ page }) => {
  await leaveAWorkingState(page)
  const view = dciPage(page)

  await page.locator('.tree-node-row').filter({ hasText: NODE_B_NAME }).click()
  await expect(page).not.toHaveURL(new RegExp(`/infrastructure/${NODE_A}/`))

  await expect(view.filter).toHaveValue('cpu')
  await expect(view.description).toHaveAttribute('aria-sort', 'descending')
  await expect(view.currentPage).toHaveText('1')
  await expect(view.openRows).toHaveCount(0)
  await expect(view.selectedCount).toBeHidden()
  await expect.poll(() => view.scroller.evaluate((el) => el.scrollTop)).toBe(0)
})

test('R21.5 Interfaces keeps its filter and selection', async ({ page }) => {
  await page.goto(`/infrastructure/${NODE_A}/interfaces`)
  const filter = page.getByPlaceholder('Filter interfaces...')
  const rows = page.locator('.app-table tbody tr')
  await expect(rows).toHaveCount(2)

  await filter.fill('eth')
  await rows.nth(0).click()
  await rows.nth(1).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByText('2 selected')).toBeVisible()

  await openPerspective(page, 'Logs')
  await expect(page).toHaveURL(/\/logs/)
  await openPerspective(page, 'Infrastructure')

  await expect(filter).toHaveValue('eth')
  await expect(page.getByText('2 selected')).toBeVisible()
})

test('R21.10 a reload starts fresh', async ({ page }) => {
  await leaveAWorkingState(page)
  const view = dciPage(page)

  await page.reload()

  await expect(view.rows).toHaveCount(100)
  await expect(view.filter).toHaveValue('')
  await expect(view.currentPage).toHaveText('1')
  await expect(view.openRows).toHaveCount(0)
})

test('R21.12 the rail does nothing for the perspective you are in', async ({ page }) => {
  await page.goto(`/infrastructure/${NODE_A}/dcis`)
  await expect(dciPage(page).rows).toHaveCount(100)
  await page.locator('.tree-node-row').filter({ hasText: NODE_B_NAME }).click()
  await expect(page).not.toHaveURL(new RegExp(`/infrastructure/${NODE_A}/`))
  const url = page.url()

  await openPerspective(page, 'Infrastructure')

  await expect(page).toHaveURL(url)
})

test('R21.13 coming back within a minute fires no history requests', async ({ page }) => {
  await leaveAWorkingState(page)
  const view = dciPage(page)
  await openPerspective(page, 'Alarms')
  await expect(page).toHaveURL(/\/alarms/)

  const history = []
  page.on('request', (request) => {
    if (request.url().includes('/history')) history.push(request.url())
  })
  await openPerspective(page, 'Infrastructure')
  await expect(view.openRows).toHaveCount(2)
  await page.waitForTimeout(500)

  expect(history).toEqual([])
})
