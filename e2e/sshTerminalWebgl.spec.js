// The default renderer in a real browser: the canvas it re-creates on every return to the tab is
// where a re-attach would break. Its output is pixels, so the checks are behavior, and a picture of
// each state stays in test-results for review.
import { Buffer } from 'node:buffer'
import { test, expect } from './fixtures.js'
import { fakeSshServer, openFromMenu } from './sshTerminalServer.js'
import { useMocks, watchProblems } from './support.js'

test.skip(!useMocks, 'replays the session on a fixture node, and opens no shell on a real one')

test('a shell survives leaving and returning, in both themes', async ({ page }) => {
  const shots = 'test-results/ssh-terminal'
  const problems = watchProblems(page)
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expect(page.locator('.ssh-status')).toContainText('Connected')
  await expect(page.locator('.xterm-screen')).toBeVisible()
  server.sockets[0].send(
    Buffer.from('\x1b[32mgreen\x1b[0m \x1b[33myellow\x1b[0m \x1b[31mred\x1b[0m plain\r\n$ '),
  )
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/connected-light.png` })

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/connected-dark.png` })

  await page.getByRole('tab', { name: 'Status' }).click()
  await expect(page.locator('.ssh-terminal-view')).toHaveCount(0)
  await page.getByRole('tab', { name: 'SSH Terminal' }).click()
  await expect(page.locator('.xterm-screen')).toBeVisible()

  await page.keyboard.type('x')
  await expect.poll(() => server.typed).toBe('x')

  server.sockets[0].send(JSON.stringify({ type: 'close', reason: 'overflow' }))
  await server.sockets[0].close({ code: 1000 })
  await expect(page.locator('.ssh-status')).toContainText('too fast')
  await page.screenshot({ path: `${shots}/ended-dark.png` })

  await page.getByRole('button', { name: 'Reconnect' }).click()
  await expect(page.locator('.ssh-status')).toContainText('Connected')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/reconnected-dark.png` })

  await page.getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('button', { name: 'Change login' }).click()
  await expect(page.locator('.ssh-connect')).toBeVisible()
  await page.screenshot({ path: `${shots}/form-dark.png` })

  let release
  server.gate = new Promise((resolve) => (release = resolve))
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Connecting...' })).toBeVisible()
  await page.screenshot({ path: `${shots}/connecting-dark.png` })
  release()
  await expect(page.locator('.ssh-status')).toContainText('Connected')

  expect(problems.errors).toEqual([])
})
