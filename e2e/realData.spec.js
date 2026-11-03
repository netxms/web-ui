// VISUAL_PASS checks that only mean something on real data. Nothing here creates anything, and the
// guard in fixtures.js keeps the columns and tabs these tests change in the browser.
import { test, expect } from './fixtures.js'
import {
  dragHeader,
  headerLabels,
  openPerspective,
  readTargets as targets,
  settle,
  useMocks,
} from './support.js'

test.skip(useMocks, 'needs a real server')

const liveTable = (page) => page.locator('.app-table').first()
const rows = (page) => liveTable(page).locator('tbody tr:not(.app-table__expansion-row)')

/** Text of one column's cells, by the column's place among the headers. */
async function columnTexts(page, label) {
  const headers = await liveTable(page).locator('thead th').allTextContents()
  const index = headers.findIndex((text) => text.trim().startsWith(label))
  expect(index, `column ${label}`).toBeGreaterThanOrEqual(0)
  return rows(page)
    .locator(`td:nth-child(${index + 1})`)
    .allTextContents()
}

async function showColumn(page, label) {
  await page.locator('.column-chooser-button').click()
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('button', { name: 'Apply' }).click()
}

test.describe('Data Collection on the node with the most DCIs', () => {
  test.beforeEach(async ({ page, server }) => {
    server.freshAccount()
    await page.goto(`/infrastructure/${targets().dciNode}/dcis`)
    await expect(rows(page).first()).toBeVisible()
  })

  test('R15.1 R15.2 rows are one line, under the default columns', async ({ page }) => {
    const labels = await headerLabels(liveTable(page))
    expect(labels.filter((label) => label.trim())).toEqual([
      'ID',
      'Description',
      'Value',
      'Last Poll',
      'Threshold',
      'Comments',
    ])
    const box = await rows(page).first().locator('td').nth(2).boundingBox()
    expect(box.height).toBeLessThan(36)
  })

  test('R20.3 R20.4 every origin has a name, in both modes', async ({ page }) => {
    await showColumn(page, 'Origin')
    const live = await columnTexts(page, 'Origin')
    expect(live.length).toBeGreaterThan(0)
    expect(live.filter((text) => /unknown|undefined/i.test(text))).toEqual([])

    await page.getByRole('button', { name: 'Configuration', exact: true }).click()
    await expect(rows(page).first()).toBeVisible()
    const labels = await headerLabels(liveTable(page))
    if (!labels.includes('Origin')) await showColumn(page, 'Origin')
    const config = await columnTexts(page, 'Origin')
    expect(config.filter((text) => /unknown|undefined/i.test(text))).toEqual([])
  })

  test('R18.3 sweeping over rows fetches nothing, resting on one fetches once', async ({ page }) => {
    await settle(page)
    const history = []
    page.on('request', (request) => {
      if (request.url().includes('/history')) history.push(request.url())
    })

    const count = Math.min(await rows(page).count(), 8)
    for (let index = 0; index < count; index++) await rows(page).nth(index).hover()
    await page.mouse.move(5, 5)
    await page.waitForTimeout(500)
    expect(history).toEqual([])

    await rows(page).nth(1).hover()
    await expect.poll(() => history.length, { timeout: 5000 }).toBe(1)
    await page.mouse.move(5, 5)
    await rows(page).nth(1).hover()
    await page.waitForTimeout(1000)
    expect(history).toHaveLength(1)
  })

  test('R21.2 Live Data and Configuration keep separate sorts', async ({ page }) => {
    const description = liveTable(page).locator('thead th').filter({ hasText: 'Description' })
    await description.click()
    await expect(description).toHaveAttribute('aria-sort', 'descending')

    await page.getByRole('button', { name: 'Configuration', exact: true }).click()
    await expect(rows(page).first()).toBeVisible()
    const configDescription = liveTable(page).locator('thead th').filter({ hasText: 'Description' })
    await expect(configDescription).not.toHaveAttribute('aria-sort', 'descending')

    await page.getByRole('button', { name: 'Live Data', exact: true }).click()
    await expect(rows(page).first()).toBeVisible()
    await expect(description).toHaveAttribute('aria-sort', 'descending')
  })
})

// On the busiest node, whose DCIs have history: the node with the most of them may be offline.
test('R21.1 a row that comes back open draws its chart', async ({ page, server }) => {
  server.freshAccount()
  await page.goto(`/infrastructure/${targets().node}/dcis`)
  await expect(rows(page).first()).toBeVisible()
  await settle(page)

  await rows(page).first().click()
  const open = liveTable(page).locator('tbody tr.app-table__expansion-row')
  await expect(open).toHaveCount(1)
  await expect(open.locator('canvas').first()).toBeVisible()

  await openPerspective(page, 'Alarms')
  await expect(page).toHaveURL(/\/alarms/)
  await openPerspective(page, 'Infrastructure')

  await expect(open).toHaveCount(1)
  await expect(open.locator('canvas').first()).toBeVisible()
})

test('R16.1 R16.2 Interfaces: default columns, clicking selects, Name opens', async ({
  page,
  server,
}) => {
  const { node, interfaces } = targets()
  test.skip(!interfaces, 'no node with interfaces')
  server.freshAccount()
  await page.goto(`/infrastructure/${node}/interfaces`)
  await expect(rows(page).first()).toBeVisible()

  const labels = await headerLabels(liveTable(page))
  expect(labels).toEqual(expect.arrayContaining(['Name', 'Status', 'Expected State']))

  const url = page.url()
  // The third cell: past the checkbox and the Name link, which opens the interface.
  await rows(page).first().locator('td').nth(2).click()
  await expect(page).toHaveURL(url)
  await expect(page.getByText(/\d+ interfaces?, 1 selected/)).toBeVisible()

  const utilization = await columnTextsIfShown(page, 'In Utilization')
  expect(utilization.filter((text) => text.trim() && !/^[\d.]+%$|^-+$/.test(text.trim()))).toEqual([])
})

async function columnTextsIfShown(page, label) {
  const labels = await headerLabels(liveTable(page))
  return labels.includes(label) ? columnTexts(page, label) : []
}

test('R23.6 Alarms headers reorder, and the actions column stays last', async ({ page, server }) => {
  server.freshAccount()
  await page.goto('/alarms')
  const table = liveTable(page)
  await expect(table.locator('thead th').first()).toBeVisible()
  await settle(page)
  const before = await headerLabels(table)
  const lastHeader = table.locator('thead th').last()
  await expect(lastHeader.locator('.app-table__th-label')).toHaveText('')

  await dragHeader(page, table, 'Message', 'State', 'left')

  const after = await headerLabels(table)
  expect(after.indexOf('Message')).toBeLessThan(after.indexOf('State'))
  expect(after).not.toEqual(before)
  await expect(lastHeader.locator('.app-table__th-label')).toHaveText('')
})

test('R24.1 a network map asks for its DCI values in bulk', async ({ page }) => {
  const { map } = targets()
  test.skip(!map, 'no network map')
  const perObject = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (/\/objects\/\d+\/data-collection\/current-values$/.test(pathname)) perObject.push(pathname)
  })

  await page.goto(`/network-maps/${map}`)
  await settle(page)
  await page.waitForTimeout(1500)

  expect(perObject).toEqual([])
})

test('R24.2 a dashboard asks for its DCI values in bulk', async ({ page }) => {
  const { dashboard } = targets()
  test.skip(!dashboard, 'no dashboard')
  const perObject = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (/\/objects\/\d+\/data-collection\/current-values$/.test(pathname)) perObject.push(pathname)
  })

  await page.goto(`/dashboards/${dashboard}`)
  await settle(page)
  await page.waitForTimeout(1500)

  expect(perObject).toEqual([])
})

test('R28.1 a log opens on Any time, with records', async ({ page, server }) => {
  server.freshAccount()
  await page.goto('/logs/EventLog')
  await expect(page.getByText('Any time').first()).toBeVisible()
  await expect(page.getByText(/\d+ records? loaded/)).toBeVisible()
})

test('R29.1 R29.7 the AI rail item follows the server', async ({ page, server }) => {
  const info = await server.read('/v1/server-info')
  const hasAi = (info.components ?? []).includes('AI-ASSISTANT')
  await page.goto('/home')
  await settle(page)

  const rail = page.getByRole('navigation', { name: 'Perspectives' })
  const item = rail.getByRole('link', { name: 'AI', exact: true })
  if (hasAi) {
    await expect(item).toBeVisible()
    return
  }
  await expect(item).toHaveCount(0)
  await expect(rail).not.toContainText('AI')

  await page.goto('/ai')
  await expect(page.getByText('AI assistant not available')).toBeVisible()
})

test('R27.3 the add button counts the views without a tab', async ({ page }) => {
  await page.goto(`/infrastructure/${targets().node}/status`)
  const more = page.getByRole('button', { name: /\d+ more/ })
  await expect(more).toBeVisible()
  await more.click()
  const unticked = page.locator('.p-popover input[type="checkbox"]:not(:checked)')
  await expect(unticked.first()).toBeAttached()

  // Both grow once the node's details are in (Ports, FDB, ARP, Routing), so they agree in the end.
  await expect(async () => {
    const count = Number((await more.textContent()).match(/\d+/)[0])
    expect(await unticked.count()).toBe(count)
  }).toPass({ timeout: 15_000 })
})
