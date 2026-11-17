// Agent log tab (Tools > Show agent log): the tail of the agent's own log, scrolled to the end,
// and the whole file as a download. Mocks serve about 1.8 MB (mocks/v1/objects/_/agent-log.js).
import fs from 'node:fs'
import { test, expect } from './fixtures.js'
import { readTargets, useMocks } from './support.js'

const MOCK_NODE = 502
const nodeId = () => (useMocks ? MOCK_NODE : readTargets().node)

const agentLogTab = (page) => page.getByRole('tab', { name: 'Agent Log' })
const viewer = (page) => page.locator('.agent-log-view .config-viewer__scroll')
const notice = (page) => page.locator('.agent-log-view .agent-log-notice')

test('the tab shows the log tail or says why it cannot', async ({ page }) => {
  await page.goto(`/infrastructure/${nodeId()}/agentLog`)
  await expect(agentLogTab(page)).toHaveAttribute('aria-selected', 'true')
  await expect(viewer(page).or(notice(page))).toBeVisible()

  if (!useMocks) {
    const outcome = (await notice(page).isVisible())
      ? `error: ${await notice(page).innerText()}`
      : `log: ${await page.locator('.agent-log-note').innerText()}`
    test.info().annotations.push({ type: 'agent log', description: outcome })
    return
  }

  await expect(page.getByText('Last 1 MB of the log')).toBeVisible()
  await expect
    .poll(() => viewer(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(2)
  // The tail starts mid-line; that partial line is dropped, so every line has a timestamp.
  const text = await viewer(page).locator('.plain-text').innerText()
  expect(text.split('\n')[0]).toMatch(/^2026\.11\.\d\d \d\d:\d\d:\d\d\.\d{3} /)
})

test('Download saves the whole file named after the node', async ({ page }) => {
  test.skip(!useMocks, 'the live file size is unknown')
  await page.goto(`/infrastructure/${MOCK_NODE}/agentLog`)
  await expect(viewer(page)).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('web-01.dc-alpha.example.com-nxagentd.log')
  expect(fs.statSync(await file.path()).size).toBeGreaterThan(1048576)
})

test('an agent that does not log to a file is explained, not a server outage', async ({ page }) => {
  test.skip(!useMocks, 'needs a scripted agent answer')
  await page.addInitScript(() => {
    window.serverUnavailableEvents = 0
    window.addEventListener('app:server-unavailable', () => window.serverUnavailableEvents++)
  })
  await page.route(`**/api/v1/objects/${MOCK_NODE}/agent-log*`, (route) =>
    route.fulfill({
      status: 500,
      json: { reason: 'Agent error', agentErrorCode: 945, agentErrorText: 'No log file' },
    }),
  )
  await page.goto(`/infrastructure/${MOCK_NODE}/agentLog`)

  await expect(notice(page)).toContainText('does not write its log to a file')
  expect(await page.evaluate(() => window.serverUnavailableEvents)).toBe(0)
})

test('closing the tab leaves it, and it is not kept among the views', async ({ page }) => {
  await page.goto(`/infrastructure/${nodeId()}/agentLog`)
  await expect(agentLogTab(page)).toBeVisible()

  await agentLogTab(page).locator('.view-tab-close').click()
  await expect(agentLogTab(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/agentLog/)

  await page.goto(`/infrastructure/${nodeId()}/status`)
  await expect(page.getByRole('tab', { name: 'Status' })).toBeVisible()
  await expect(agentLogTab(page)).toHaveCount(0)
})
