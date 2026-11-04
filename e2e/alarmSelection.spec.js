// Selecting alarms and acting on them, on real layout and real focus, with alarms and state
// changes the test controls: nothing here reaches a server.
import { test, expect } from './fixtures.js'

const LONG_MESSAGE = `Package linux-firmware updated ${'from one version to another '.repeat(12)}`

const base = {
  source: 1,
  sourceName: 'web-01',
  zoneUIN: 0,
  repeatCount: 5,
  commentCount: 0,
  helpdeskReference: '',
  creationTime: '2026-11-04T08:00:00Z',
  lastChangeTime: '2026-11-04T08:00:00Z',
  ackByUserName: '',
  resolvedByUserName: '',
  categories: [],
}

const ALARMS = [
  { ...base, id: 1, state: 0, severity: 4, message: LONG_MESSAGE },
  { ...base, id: 2, state: 0, severity: 3, message: 'Node down' },
  { ...base, id: 3, state: 1, severity: 2, message: 'Link flapping' },
  { ...base, id: 4, state: 2, severity: 1, message: 'Disk almost full' },
]

const NODE = { id: 1, class: 'Node', name: 'web-01', category: 0, status: 0 }

/** Fulfils the alarm routes; the returned list collects the state changes sent. */
async function serveAlarms(page) {
  const changes = []
  await page.route(/\/api\/v1\/alarms(\?.*)?$/, (route) => {
    const details = route.request().url().includes('includeObjectDetails=true')
    return route.fulfill({
      json: details ? ALARMS.map((alarm) => ({ ...alarm, sourceObject: NODE })) : ALARMS,
    })
  })
  await page.route(/\/api\/v1\/alarms\/\d+$/, (route) =>
    route.fulfill({ json: { ...ALARMS[0], dci: 0, isSticky: false } }),
  )
  await page.route(/\/api\/v1\/alarms\/\d+\/(acknowledge|resolve|terminate)$/, (route) => {
    const [, id, action] = route
      .request()
      .url()
      .match(/alarms\/(\d+)\/(\w+)$/)
    changes.push(`${action} ${id}`)
    return route.fulfill({ status: 204 })
  })
  return changes
}

const rows = (page) => page.locator('.alarms-table tbody tr:not(.app-table__expansion-row)')
const checkbox = (page, index) => rows(page).nth(index).getByRole('checkbox')
const selection = (page) => page.getByRole('group', { name: 'Selection' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
})

test('rows are as dense as Data Collection, and messages use the whole column', async ({
  page,
}) => {
  await serveAlarms(page)
  await page.goto('/alarms')
  await expect(rows(page)).toHaveCount(4)

  const heights = await rows(page).evaluateAll((list) =>
    list.map((row) => row.getBoundingClientRect().height),
  )
  for (const height of heights) expect(height).toBeLessThan(36)

  const message = rows(page).first().locator('.alarm-message')
  expect((await message.boundingBox()).width).toBeGreaterThan(400)
})

test('the source column shows the object icon', async ({ page }) => {
  await serveAlarms(page)
  await page.goto('/alarms')

  const icon = rows(page).first().locator('.alarm-source svg')
  await expect(icon).toBeVisible()
  expect((await icon.boundingBox()).width).toBeGreaterThan(10)
})

test('an action on a selection reaches the alarms it fits and reports them', async ({ page }) => {
  const changes = await serveAlarms(page)
  await page.goto('/alarms')

  await checkbox(page, 0).click()
  await checkbox(page, 1).click()
  await checkbox(page, 2).click()
  await expect(selection(page)).toContainText('3 selected')

  await selection(page).getByRole('button', { name: 'Acknowledge (2)' }).click()

  await expect(page.getByText('Acknowledged 2 alarms')).toBeVisible()
  expect(changes.toSorted()).toEqual(['acknowledge 1', 'acknowledge 2'])
  // The third did not fit, so it stays selected.
  await expect(selection(page)).toContainText('1 selected')
})

test('terminating several asks first', async ({ page }) => {
  const changes = await serveAlarms(page)
  await page.goto('/alarms')

  await checkbox(page, 0).click()
  await checkbox(page, 1).click()
  await selection(page).getByRole('button', { name: 'Terminate (2)' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Terminate 2 alarms')
  expect(changes).toEqual([])

  await dialog.getByRole('button', { name: 'Terminate' }).click()
  await expect.poll(() => changes.length).toBe(2)
})

test('the keyboard selects, extends and clears', async ({ page }) => {
  await serveAlarms(page)
  await page.goto('/alarms')
  await expect(rows(page)).toHaveCount(4)

  await rows(page).first().focus()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(selection(page)).toContainText('3 selected')
  await expect(rows(page).nth(2)).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(selection(page)).toHaveCount(0)

  await page.keyboard.press('Control+a')
  await expect(selection(page)).toContainText('4 selected')
})

test('the menu follows the selection', async ({ page }) => {
  await serveAlarms(page)
  await page.goto('/alarms')

  await rows(page).nth(3).click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Details' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Object' })).toBeVisible()
  await page.keyboard.press('Escape')

  await checkbox(page, 0).click()
  await checkbox(page, 1).click()
  await rows(page).nth(1).click({ button: 'right' })
  await expect(menu.getByRole('menuitem', { name: 'Resolve (2)' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Details' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: 'Object' })).toHaveCount(0)
})
