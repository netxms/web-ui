// The approval flow through a real panel and context menu. Its own routes, not the shared mock
// store: approving changes state that a server left running would carry into the next run.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'approving would change a real server')

const HOUR = 60 * 60 * 1000

function seed() {
  const now = Date.now()
  const base = {
    relatedObjectId: 0,
    isInitiator: true,
    readTime: null,
    creationTime: new Date(now - HOUR).toISOString(),
    expirationTime: new Date(now + 20 * HOUR).toISOString(),
  }
  return [
    {
      ...base,
      id: 1,
      type: 'approvalRequest',
      status: 'read',
      title: 'Restart the agent',
      text: 'The agent stopped answering.',
      spawnTaskData: { taskType: 'ai_chat', userPrompt: 'Restart the agent on web-server-02.' },
    },
    { ...base, id: 2, type: 'informational', status: 'read', title: 'Weekly report', text: 'Fine.' },
  ]
}

async function serveMessages(page) {
  const messages = seed()
  await page.route('**/api/v1/ai/messages', (route) => route.fulfill({ json: messages }))
  await page.route('**/api/v1/ai/messages/*/status', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-2))
    const message = messages.find((item) => item.id === id)
    message.status = route.request().postDataJSON().status
    await route.fulfill({ json: message })
  })
}

const row = (page, title) => page.locator('.app-table tbody tr', { hasText: title })
const panel = (page) => page.locator('.record-panel.is-open')
const panelButton = (page, name) => panel(page).getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await serveMessages(page)
  await page.goto('/ai/messages')
  await expect(row(page, 'Restart the agent')).toBeVisible()
})

test('a request can be approved from its panel', async ({ page }) => {
  await expect(row(page, 'Restart the agent')).toContainText('Awaiting decision')

  await row(page, 'Restart the agent').click()
  await expect(panel(page)).toContainText('The agent stopped answering.')
  await expect(panel(page)).not.toContainText('Restart the agent on web-server-02.')

  await panelButton(page, 'Approve').click()

  await expect(row(page, 'Restart the agent')).toContainText('Approved')
  await expect(panelButton(page, 'Approve')).toHaveCount(0)
  await expect(panelButton(page, 'Reject')).toHaveCount(0)
})

test('a message that asks for nothing offers no decision', async ({ page }) => {
  await row(page, 'Weekly report').click()

  await expect(panel(page)).toContainText('Fine.')
  await expect(panelButton(page, 'Approve')).toHaveCount(0)
  await expect(panelButton(page, 'Reject')).toHaveCount(0)
})

test('a request can be rejected from the context menu', async ({ page }) => {
  await row(page, 'Weekly report').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Approve' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await row(page, 'Restart the agent').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Approve' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Reject' }).click()

  await expect(row(page, 'Restart the agent')).toContainText('Rejected')
})

test('the tab and the rail count what waits on the user', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Perspectives' })
  const tab = page.getByRole('tab', { name: /Messages/ })
  await expect(rail.getByRole('link', { name: 'AI 1' })).toBeVisible()
  await expect(tab.locator('.p-badge')).toHaveText('1')

  await row(page, 'Restart the agent').click()
  await panelButton(page, 'Reject').click()

  await expect(rail.getByRole('link', { name: 'AI', exact: true })).toBeVisible()
  await expect(tab.locator('.p-badge')).toHaveCount(0)
})

test('the rail badge clears the icon and stays inside the rail at both widths', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Perspectives' })
  const item = rail.getByRole('link', { name: 'AI 1' })

  async function expectClear() {
    const [badge, icon, railBox] = await Promise.all([
      item.locator('.p-badge').boundingBox(),
      item.locator('svg').boundingBox(),
      rail.boundingBox(),
    ])
    expect(badge.x).toBeGreaterThanOrEqual(icon.x + icon.width)
    expect(badge.x + badge.width).toBeLessThanOrEqual(railBox.x + railBox.width)
  }

  await expectClear()

  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await expect(rail).toHaveCSS('width', '60px')
  await expectClear()
})
