import { test, expect } from './fixtures.js'
import { settle, useMocks, watchProblems } from './support.js'

test('the home page opens with no uncaught errors', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto('/home')
  await expect(page.getByRole('navigation', { name: 'Perspectives' })).toBeVisible()
  await settle(page)

  expect(problems.errors).toEqual([])
})

test('the infrastructure tree lists objects', async ({ page }) => {
  await page.goto('/infrastructure')

  await expect(page.locator('.tree-node-row').first()).toBeVisible()
})

test('the header toggle switches between light and dark', async ({ page }) => {
  await page.goto('/home')
  const html = page.locator('html')
  const wasDark = await html.evaluate((el) => el.classList.contains('app-dark'))

  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*app-dark)/ : /app-dark/)

  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click()
  await expect(html).toHaveClass(wasDark ? /app-dark/ : /^(?!.*app-dark)/)
})

// The panel slides off-screen when closed, and stays in the DOM. jsdom has no `inert`.
test('the closed AI panel stays out of reach of the keyboard', async ({ page }) => {
  await page.goto('/home')
  await settle(page)
  const panelClose = page.locator('.ai-chat-panel').getByRole('button', { name: 'Close' })
  const open = page.getByRole('button', { name: 'AI Assistant' })
  // The fixtures have the assistant, so on them a missing button fails below instead of skipping.
  test.skip(!useMocks && (await open.count()) === 0, 'server without the AI assistant')

  await panelClose.focus()
  await expect(panelClose).not.toBeFocused()

  await open.click()
  await panelClose.focus()
  await expect(panelClose).toBeFocused()

  await panelClose.click()
  await panelClose.focus()
  await expect(panelClose).not.toBeFocused()
})

test('the mock tree holds only synthetic objects', async ({ page }) => {
  test.skip(!useMocks, 'mock fixtures only')

  await page.goto('/infrastructure')

  await expect(page.locator('.tree-node-row').filter({ hasText: 'DataCenter-Alpha' })).toBeVisible()
})
