// What a jsdom spec cannot see: real xterm.js in a real layout, focus, keys, tab switches. The
// session endpoints are replayed, so what is measured is the client.
import { Buffer } from 'node:buffer'
import { test, expect } from './fixtures.js'
import { BANNER, fakeSshServer, openFromMenu } from './sshTerminalServer.js'
import { useMocks, watchProblems } from './support.js'

test.skip(!useMocks, 'replays the session on a fixture node, and opens no shell on a real one')

// The WebGL renderer draws to a canvas, and the DOM renderer leaves text a test can read.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] } })

const terminalText = (page) => page.locator('.xterm-rows')

async function expectLive(page) {
  await expect(terminalText(page)).toContainText(BANNER)
  await expect(page.locator('.ssh-status')).toContainText('Connected')
}

function pasteIntoTerminal(page, text) {
  return page.locator('.xterm-helper-textarea').evaluate((field, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', value)
    field.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, composed: true }),
    )
  }, text)
}

test('the menu goes straight into a shell with the stored credentials, sized to the view', async ({
  page,
}) => {
  const problems = watchProblems(page)
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  expect(server.posts).toHaveLength(1)
  const [body] = server.posts
  expect(body.login).toBeUndefined()
  expect(body.terminalType).toBe('xterm-256color')
  // A real measurement of a wide view, not a default.
  expect(body.columns).toBeGreaterThan(80)
  expect(body.rows).toBeGreaterThan(24)
  expect(problems.errors).toEqual([])
})

test('a right click on another tree row leaves the terminal on screen', async ({ page }) => {
  await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)
  const terminalUrl = page.url()

  await page.locator('.tree-node-row').filter({ hasText: 'web-02' }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Properties', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  expect(page.url()).toBe(terminalUrl)
  await expectLive(page)
})

test('typing goes straight to the shell without clicking first', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.keyboard.type('ls -l')
  await page.keyboard.press('Enter')

  await expect.poll(() => server.typed).toBe('ls -l\r')
})

test('keys the console also uses reach the shell while it has focus', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.keyboard.press('Control+k')
  await page.keyboard.press('F6')
  await page.keyboard.press('/')
  await page.keyboard.press('Control+c')

  await expect.poll(() => server.typed).toBe('\x0b\x1b[17~/\x03')
  await expect(page.getByPlaceholder(/search/i)).toHaveCount(0)
})

test('the reserved key combination leaves the terminal, so the keyboard is not trapped', async ({
  page,
}) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused()

  await page.keyboard.press('Control+Shift+F6')

  await expect(page.locator('.xterm-helper-textarea')).not.toBeFocused()
  expect(server.typed).toBe('')
})

test('the shell and its output survive switching to another view and back', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.getByRole('tab', { name: 'Status' }).click()
  await expect(page.locator('.ssh-terminal-view')).toHaveCount(0)
  server.sockets[0].send(Buffer.from('written while away\r\n'))

  await page.getByRole('tab', { name: 'SSH Terminal' }).click()
  await expect(terminalText(page)).toContainText(BANNER)
  await expect(terminalText(page)).toContainText('written while away')

  await page.keyboard.type('x')
  await expect.poll(() => server.typed).toBe('x')
  expect(server.posts).toHaveLength(1)
  expect(server.closedByClient).toBe(0)
})

test('the header lists the open shell and leads back to it', async ({ page }) => {
  await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.getByRole('tab', { name: 'Status' }).click()
  await page.getByRole('button', { name: '1 open SSH terminal' }).click()
  await page.locator('.ssh-session-link').click()

  await expect(page.locator('.ssh-terminal-view')).toBeVisible()
  await expect(terminalText(page)).toContainText(BANNER)
})

test('the first size sent is the real one, so the shell is not told again after login', async ({
  page,
}) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.waitForTimeout(500)

  expect(server.controlMessages.filter((message) => message.type === 'resize')).toEqual([])
})

test('resizing the window tells the shell once, with the new size', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)
  const [{ columns }] = server.posts

  await page.setViewportSize({ width: 1000, height: 700 })

  await expect
    .poll(() => server.controlMessages.filter((message) => message.type === 'resize').length)
    .toBeGreaterThan(0)
  const resizes = server.controlMessages.filter((message) => message.type === 'resize')
  expect(resizes.at(-1).columns).toBeLessThan(columns)

  // Nothing changed, so nothing more goes out: RouterOS redraws on every notification.
  const sent = resizes.length
  await page.waitForTimeout(500)
  expect(server.controlMessages.filter((message) => message.type === 'resize')).toHaveLength(sent)
})

test('a failed login stays on the form with the reason, and the console stays online', async ({
  page,
}) => {
  const server = await fakeSshServer(page)
  server.failNext = { status: 502, json: { reason: 'Remote connect failed' } }
  await openFromMenu(page)

  const form = page.locator('.ssh-connect')
  await expect(form).toContainText('Could not connect or log in')
  await expect(form).toContainText('Remote connect failed')
  await expect(page.getByText(/reconnecting/i)).toHaveCount(0)

  await form.getByRole('button', { name: 'Enter credentials' }).click()
  await form.getByLabel('Login').fill('operator')
  await form.locator('input[type="password"]').fill('s3cret')
  await form.getByRole('button', { name: 'Connect', exact: true }).click()
  await expectLive(page)

  expect(server.posts[1]).toMatchObject({ login: 'operator', password: 's3cret', keyId: 0 })
})

test('a lost connection comes back by itself, in a shell marked as new', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await server.sockets[0].close({ code: 1011 })

  await expect(page.locator('.ssh-status')).toContainText(/reconnecting/i)
  await expect(terminalText(page)).toContainText(/connection lost/i)
  await expect(terminalText(page)).toContainText(/new shell/i, { timeout: 15_000 })
  await expect(page.locator('.ssh-status')).toContainText('Connected')
  // The old output stays above the marker.
  await expect(terminalText(page)).toContainText(BANNER)
  expect(server.posts).toHaveLength(2)
})

test('logging out does not reconnect, and Enter starts a new shell', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  server.sockets[0].send(JSON.stringify({ type: 'close', reason: 'normal' }))
  await server.sockets[0].close({ code: 1000 })

  await expect(page.locator('.ssh-status')).toContainText('Session ended')
  await page.waitForTimeout(2000)
  expect(server.posts).toHaveLength(1)

  await page.keyboard.press('Enter')
  await expect(page.locator('.ssh-status')).toContainText('Connected')
  expect(server.posts).toHaveLength(2)
})

test('a new shell starts below the old output instead of writing over it', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)
  server.sockets[0].send(Buffer.from('row one\r\nrow two\r\n$ '))
  await expect(terminalText(page)).toContainText('row two')

  await page.getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('button', { name: 'Reconnect' }).click()
  await expect(terminalText(page)).toContainText(/new shell/i)

  const text = await terminalText(page).innerText()
  expect(text).toContain('row one')
  expect(text.indexOf('row two')).toBeGreaterThan(-1)
  expect(text.toLowerCase().indexOf('new shell')).toBeGreaterThan(text.indexOf('row two'))
  expect(text.lastIndexOf(BANNER)).toBeGreaterThan(text.toLowerCase().indexOf('new shell'))
})

test('a new login stays on the form until it works, and never shows the last session', async ({
  page,
}) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)
  server.sockets[0].send(Buffer.from('old output\r\n'))
  await expect(terminalText(page)).toContainText('old output')
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('button', { name: 'Change login' }).click()

  const form = page.locator('.ssh-connect')
  const toolbar = page.locator('.ssh-toolbar')
  const terminal = page.locator('.ssh-terminal-host')

  let release
  server.gate = new Promise((resolve) => (release = resolve))
  server.failNext = { status: 502, json: { reason: 'Remote connect failed' } }
  await form.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(form.getByRole('button', { name: 'Connecting...' })).toBeVisible()
  await expect(form).toBeVisible()
  await expect(toolbar).toBeHidden()
  await expect(terminal).toBeHidden()

  release()
  await expect(form).toContainText('Could not connect or log in')
  await expect(toolbar).toBeHidden()
  await expect(terminal).toBeHidden()

  server.gate = null
  await form.getByRole('button', { name: 'Connect', exact: true }).click()
  await expectLive(page)
  await expect(terminalText(page)).not.toContainText('old output')
})

test('Cancel on the form stops a login that is taking too long', async ({ page }) => {
  const server = await fakeSshServer(page)
  let release
  server.gate = new Promise((resolve) => (release = resolve))
  await openFromMenu(page)

  const form = page.locator('.ssh-connect')
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(form.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()

  release()
  await page.waitForTimeout(300)
  await expect(page.locator('.ssh-toolbar')).toBeHidden()
  await expect(form).toBeVisible()
})

test('pasting several lines asks first and sends nothing until approved', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await pasteIntoTerminal(page, 'one\ntwo')
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('2 lines')
  expect(server.typed).toBe('')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(server.typed).toBe('')

  await pasteIntoTerminal(page, 'one\ntwo')
  await dialog.getByRole('button', { name: 'Paste' }).click()
  await expect.poll(() => server.typed).toBe('one\rtwo')
})

test('pasting one line goes straight in', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await pasteIntoTerminal(page, 'show version')

  await expect.poll(() => server.typed).toBe('show version')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('closing the tab ends the shell and clears it from the header', async ({ page }) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  await page.getByRole('tab', { name: 'SSH Terminal' }).locator('.view-tab-close').click()

  await expect(page.locator('.ssh-terminal-view')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /open SSH terminal/ })).toHaveCount(0)
  await expect.poll(() => server.closedByClient).toBe(1)
})

test('leaving the page warns while a shell is live, and a reload opens none by itself', async ({
  page,
}) => {
  const server = await fakeSshServer(page)
  await openFromMenu(page)
  await expectLive(page)

  const dialogs = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type())
    await dialog.accept()
  })
  await page.locator('.xterm-helper-textarea').press('x')
  await page.reload()

  expect(dialogs).toContain('beforeunload')
  await expect(page.locator('.ssh-connect')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'SSH Terminal' })).toBeVisible()
  expect(server.posts).toHaveLength(1)
})

test('a server with no SSH proxy reads as a reason on the form', async ({ page }) => {
  const problems = watchProblems(page)
  // No fake server here: this is the fixture a demo build answers with.
  await openFromMenu(page)

  await expect(page.locator('.ssh-connect')).toContainText('No SSH proxy is available')
  await expect(page.getByText(/reconnecting/i)).toHaveCount(0)
  expect(problems.errors).toEqual([])
})
