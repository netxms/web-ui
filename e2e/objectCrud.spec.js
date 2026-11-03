// VISUAL_PASS R6 and R7 on a real server, on objects these tests create and remove. A script only
// ever runs on the test's own container, and only prints.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(useMocks, 'streaming and checks have no fixtures')

const INFRASTRUCTURE_ROOT = 2
const BUSINESS_SERVICE_ROOT = 9

const rowWith = (page, text) => page.locator('.app-table tbody tr').filter({ hasText: text })

test.describe('R6 streamed script output', () => {
  let editor
  let output
  let running

  test.beforeEach(async ({ page, server }) => {
    const { id } = await server.createObject('Container', INFRASTRUCTURE_ROOT, 'container')
    await page.goto(`/infrastructure/${id}/script`)
    editor = page.locator('.cm-content').first()
    output = page.locator('.output-content')
    running = page.locator('.run-status')
    await expect(editor).toBeVisible()
  })

  const execute = (page) => page.getByRole('button', { name: 'Execute', exact: true }).click()

  test('R6.1 lines arrive one by one over one connection, then the result', async ({ page }) => {
    const sockets = []
    page.on('websocket', (socket) => sockets.push(socket))
    await editor.fill('for (i = 0; i < 6; i++) { println("line" .. i); sleep(500); } return 42;')

    await execute(page)

    await expect(running).toContainText('Running')
    await expect(output).toContainText('line0')
    await expect(output).not.toContainText('line5')
    await expect(output).toContainText('line5')
    await expect(page.getByText('Result', { exact: true })).toBeVisible()
    await expect(output).toContainText('42')
    await expect(running).toBeHidden()
    expect(sockets).toHaveLength(1)
    await expect.poll(() => sockets[0].isClosed()).toBe(true)
  })

  test('R6.2 Stop ends a running loop', async ({ page }) => {
    await editor.fill('for (i = 0; i < 200; i++) { println("line" .. i); sleep(200); }')
    await execute(page)
    await expect(output).toContainText('line1')

    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    await expect(output).toContainText(/stopped/i, { timeout: 20_000 })
    await expect(running).toBeHidden()
  })

  test('R6.5 a runtime error shows the server message', async ({ page }) => {
    await editor.fill('return $node->nosuch->x;')
    await execute(page)

    await expect(running).toBeHidden({ timeout: 20_000 })
    await expect(output).toContainText(/error|null|nosuch|attribute/i)
  })

  test('R6.6 a compile error marks the line', async ({ page }) => {
    await editor.fill('return (;')
    await execute(page)

    await expect(running).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText(/syntax|compil|error/i).first()).toBeVisible()
    await expect(page.locator('.cm-error-line, .cm-line[class*="error"]').first()).toBeVisible()
  })

  test('R6.7 a script that only returns shows just the result', async ({ page }) => {
    await editor.fill('return 7 * 6;')
    await execute(page)
    await expect(page.getByText('Result', { exact: true })).toBeVisible()
    await expect(output).toContainText('42')

    await page.getByRole('button', { name: 'Clear Output' }).click()
    await editor.fill('x = 1;')
    await execute(page)
    await expect(page.getByText('Result', { exact: true })).toBeVisible()
    await expect(output).toContainText('null')
  })

  test('R6.9 thousands of lines stay responsive', async ({ page }) => {
    await editor.fill('for (i = 0; i < 5000; i++) { println("line " .. i); } return "done";')
    await execute(page)

    await expect(output).toContainText('done', { timeout: 45_000 })
    await expect(output).toContainText('line 4999')
    const started = Date.now()
    await page.getByRole('button', { name: 'Clear Output' }).click()
    await expect(output).not.toContainText('line 4999')
    expect(Date.now() - started).toBeLessThan(5000)
  })
})

test.describe('R7 business service checks', () => {
  async function createScriptCheck(page, description, script) {
    await page.getByRole('button', { name: 'Create Check' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Description').fill(description)
    await dialog.locator('.p-select').first().click()
    await page.getByRole('option', { name: /script/i }).click()
    await dialog.locator('.cm-content').fill(script)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    return dialog
  }

  test('R7.1 R7.2 R7.3 R7.4 script checks: empty list, compile error, edit, delete', async ({
    page,
    server,
  }) => {
    const { id } = await server.createObject('BusinessService', BUSINESS_SERVICE_ROOT, 'service')
    await page.goto(`/business-services/${id}/checks`)
    await expect(page.getByRole('button', { name: 'Create Check' })).toBeVisible()
    await expect(page.getByText('No checks configured')).toBeVisible()

    // R7.2: the server's compile error, in the dialog, which stays open.
    const dialog = await createScriptCheck(page, 'e2e-broken', 'return (;')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/error|syntax|compil/i).first()).toBeVisible()

    await dialog.locator('.cm-content').fill('return true;')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(rowWith(page, 'e2e-broken')).toHaveCount(1)

    // R7.3: edit, which reloads from the server.
    await rowWith(page, 'e2e-broken').click()
    const edit = page.getByRole('dialog')
    await edit.getByLabel('Description').fill('e2e-edited')
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(rowWith(page, 'e2e-edited')).toHaveCount(1)
    await page.reload()
    await expect(rowWith(page, 'e2e-edited')).toHaveCount(1)

    // R7.3: duplicate, from the row menu, which creates the copy at once.
    await rowWith(page, 'e2e-edited').getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    await expect(page.locator('.app-table tbody tr')).toHaveCount(2)

    // R7.4: delete both from the selection bar.
    for (const row of await page.locator('.app-table tbody tr').all()) {
      await row.locator('.app-table__checkbox-wrap').click()
    }
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.locator('.p-confirmdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No checks configured')).toBeVisible()
  })
})
