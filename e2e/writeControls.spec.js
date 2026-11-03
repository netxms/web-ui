// Where a section's reads are open and its writes are not, an account with only the read right must
// be offered nothing the server would refuse. On fixtures: `/v1/status` says what the account may do.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'simulates the account on fixtures')

const VIEW_EVENT_DB = 2 ** 4
const EPP = 2 ** 6
const USE_AI_ASSISTANT = 2 ** 53
const MANAGE_AI_SKILLS = 2 ** 54

/** Object Tools' label also holds the required marker. */
const nameField = (page) => page.getByLabel(/^Name/)

async function signInWithRights(page, rights) {
  // The browser's copy too: the router's guard reads it before `/v1/status` has answered.
  await page.addInitScript((value) => {
    const user = JSON.parse(window.localStorage.getItem('user'))
    window.localStorage.setItem('user', JSON.stringify({ ...user, systemAccessRights: value }))
  }, String(rights))
  await page.route('**/api/v1/status', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      json: { ...(await response.json()), systemAccessRights: rights },
    })
  })
}

const button = (page, name) => page.getByRole('button', { name, exact: true })
const firstRow = (page) => page.locator('.app-table tbody tr').first()

async function expectReadOnlyDetail(page) {
  await expect(page.getByText('You have read-only access')).toBeVisible()
  await expect(button(page, 'Save')).toHaveCount(0)
  await expect(button(page, 'Discard')).toHaveCount(0)
  await expect(nameField(page)).toBeDisabled()
}

async function openRowMenu(page) {
  await firstRow(page).getByRole('button', { name: 'Actions' }).click()
  return page.getByRole('menuitem')
}

test.describe('Object Tools', () => {
  test('without Manage object tools it is read-only', async ({ page }) => {
    await signInWithRights(page, 0)
    await page.goto('/configuration/object-tools')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'New Tool')).toHaveCount(0)
    await expect(firstRow(page).locator('.p-toggleswitch input')).toBeDisabled()

    const items = await openRowMenu(page)
    await expect(items).toHaveText(['View'])
    await page.keyboard.press('Escape')

    await firstRow(page).locator('td').first().click()
    await expectReadOnlyDetail(page)

    // The tabs still work: it is there to be read.
    await page.getByRole('tab', { name: 'Filter' }).click()
    await expect(page.getByRole('tab', { name: 'Filter' })).toHaveAttribute('aria-selected', 'true')
  })

  test('without the right the custom fields are out of reach too', async ({ page }) => {
    await signInWithRights(page, 0)
    // Ping: it has a macro field, which not every tool type does.
    await page.goto('/configuration/object-tools/1')

    await expect(page.locator('.macro-native').first()).toBeDisabled()
    await expect(page.locator('.p-toggleswitch input').first()).toBeDisabled()
    await expect(page.locator('.p-select').first()).toHaveClass(/p-disabled/)
  })

  test('a link to a new tool does not open the editor', async ({ page }) => {
    await signInWithRights(page, 0)
    await page.goto('/configuration/object-tools/new')
    await expect(page.getByText('Configure object tools')).toBeVisible()
    await expect(button(page, 'Save')).toHaveCount(0)
  })

  test('with the right everything is on offer', async ({ page }) => {
    await page.goto('/configuration/object-tools')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'New Tool')).toBeVisible()
    await expect(firstRow(page).locator('.p-toggleswitch input')).toBeEnabled()
    const items = await openRowMenu(page)
    await expect(items).toHaveText(['Edit', /Enable|Disable/, 'Delete'])
    await page.keyboard.press('Escape')

    await firstRow(page).locator('td').first().click()
    await expect(button(page, 'Save')).toBeVisible()
    await expect(page.getByText('You have read-only access')).toHaveCount(0)
    await expect(nameField(page)).toBeEnabled()
  })
})

test.describe('Event Templates', () => {
  test('with only View event configuration it is read-only', async ({ page }) => {
    await signInWithRights(page, VIEW_EVENT_DB)
    await page.goto('/configuration/event-templates')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'Add Event Template')).toHaveCount(0)
    const items = await openRowMenu(page)
    await expect(items).toHaveText(['View'])
    await page.keyboard.press('Escape')

    await firstRow(page).locator('td').first().click()
    await expectReadOnlyDetail(page)
  })

  test('with the right everything is on offer', async ({ page }) => {
    await page.goto('/configuration/event-templates')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'Add Event Template')).toBeVisible()
    const items = await openRowMenu(page)
    await expect(items).toHaveText(['Edit', 'Delete'])
    await page.keyboard.press('Escape')

    await firstRow(page).locator('td').first().click()
    await expect(button(page, 'Save')).toBeVisible()
    await expect(nameField(page)).toBeEnabled()
  })
})

test.describe('Actions', () => {
  test('with only Manage event processing it is read-only', async ({ page }) => {
    await signInWithRights(page, EPP)
    await page.goto('/configuration/actions')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'Add Action')).toHaveCount(0)
    const items = await openRowMenu(page)
    await expect(items).toHaveText(['View'])
    await page.keyboard.press('Escape')

    await firstRow(page).locator('td').first().click()
    await expectReadOnlyDetail(page)
  })

  test('with the right everything is on offer', async ({ page }) => {
    await page.goto('/configuration/actions')
    await expect(firstRow(page)).toBeVisible()

    await expect(button(page, 'Add Action')).toBeVisible()
    const items = await openRowMenu(page)
    await expect(items).toHaveText(['Edit', 'Delete'])
  })
})

test.describe('Event Processing', () => {
  test('a link to it when the chains are refused offers no way to add a rule', async ({ page }) => {
    await signInWithRights(page, 0)
    await page.route(/\/api\/v1\/event-processing-policy\/chains/, (route) =>
      route.fulfill({ status: 403, json: { reason: 'Access denied' } }),
    )
    await page.goto('/configuration/epp')
    await expect(page.getByText('Event Processing').first()).toBeVisible()
    await expect(page.getByText('does not have permission')).toBeVisible()

    await expect(button(page, 'Add Rule')).toHaveCount(0)
  })

  test('with the right a rule can be added', async ({ page }) => {
    await page.goto('/configuration/epp')
    await expect(button(page, 'Add Rule')).toBeVisible()
  })
})

test.describe('AI skills and functions', () => {
  test('without Manage AI skills the stop list cannot be changed', async ({ page }) => {
    await signInWithRights(page, USE_AI_ASSISTANT)
    await page.goto('/configuration/ai-assistant?tab=skills')
    await expect(page.getByRole('tab', { name: 'Skills & Functions' })).toBeVisible()

    for (const name of ['Add', 'Disable', 'Enable', 'Remove']) {
      await expect(button(page, name), name).toHaveCount(0)
    }
  })

  test('with the right it can', async ({ page }) => {
    await signInWithRights(page, MANAGE_AI_SKILLS)
    await page.goto('/configuration/ai-assistant?tab=skills')
    await expect(button(page, 'Add')).toBeVisible()
    await expect(button(page, 'Disable')).toBeVisible()
  })
})
