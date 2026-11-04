// The Alarms rail badge and Home tile on real CSS and the real poll, with alarms the test controls.
import { test, expect } from './fixtures.js'

const base = {
  source: 1,
  sourceName: 'web-01',
  zoneUIN: 0,
  message: 'Test alarm',
  repeatCount: 1,
  commentCount: 0,
  helpdeskReference: '',
  creationTime: '2026-11-04T08:00:00Z',
  lastChangeTime: '2026-11-04T08:00:00Z',
  ackByUserName: '',
  resolvedByUserName: '',
  categories: [],
}

const ALARMS = [
  { ...base, id: 1, state: 0, severity: 1 },
  { ...base, id: 2, state: 0, severity: 2 },
  { ...base, id: 3, state: 1, severity: 4 },
]

/** What `var(--netxms-status-<key>)` computes to, whichever theme is on. */
function fillOf(page, key) {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(--netxms-status-${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, key)
}

const railItem = (page) =>
  page
    .getByRole('navigation', { name: 'Perspectives' })
    .getByRole('link', { name: 'Alarms 2, worst Minor' })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/alarms', (route) => route.fulfill({ json: ALARMS }))
  await page.goto('/home')
})

test("the rail and the Home tile count outstanding alarms, in the worst one's color", async ({
  page,
}) => {
  const badge = railItem(page).locator('.p-badge')
  await expect(badge).toHaveText('2')
  await expect(badge).toHaveCSS('background-color', await fillOf(page, 'minor'))

  const tile = page.locator('.quick-action-card', { hasText: 'Alarms' })
  await expect(tile.locator('.quick-action-badge')).toHaveText('2')
})

test("the badge takes the active item's colors on the Alarms perspective", async ({ page }) => {
  const item = railItem(page)
  await item.click()

  await expect(item).toHaveAttribute('aria-current', 'page')
  await expect(item.locator('.p-badge')).not.toHaveCSS(
    'background-color',
    await fillOf(page, 'minor'),
  )
})
