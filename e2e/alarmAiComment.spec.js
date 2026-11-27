// "Ask AI assistant" on an alarm, from its menu or its details: the suggested comment, read as
// rendered markdown, edited and saved as an alarm comment.
// On fixtures the account is given the right. On a server only the request and the dialog run:
// saving would write to an alarm the test does not own.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

const USE_AI_ASSISTANT = 1n << 53n

const AI_COMMENT = /\/api\/v1\/alarms\/\d+\/ai-comment$/
const COMMENTS = /\/api\/v1\/alarms\/\d+\/comments$/

/** One of the fixture alarms, on srv-db-02. */
const FIXTURE_ALARM = 'Database connection pool exhausted'

const rows = (page) => page.locator('.alarms-table tbody tr:not(.app-table__expansion-row)')
const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })
const aiDialog = (page) => page.getByRole('dialog', { name: 'AI Assistant Comment' })
const preview = (page) =>
  aiDialog(page).getByRole('region', {
    name: 'Preview',
  }) /** The header's X is a "Close" button too. */
const footerButton = (page, name) =>
  aiDialog(page).locator('.p-dialog-footer').getByRole('button', { name, exact: true })

/** Adds the right to what `/v1/status` says, which replaces the browser's copy on load. */
async function grantAiRight(page) {
  await page.addInitScript((bit) => {
    const user = JSON.parse(window.localStorage.getItem('user'))
    const rights = BigInt(user.systemAccessRights ?? 0) | BigInt(bit)
    window.localStorage.setItem(
      'user',
      JSON.stringify({ ...user, systemAccessRights: `${rights}` }),
    )
  }, String(USE_AI_ASSISTANT))
  await page.route('**/api/v1/status', async (route) => {
    const response = await route.fetch()
    // Text, not JSON: the rights exceed what a JSON number keeps exactly.
    const body = (await response.text()).replace(
      /("systemAccessRights"\s*:\s*)"?(\d+)"?/,
      (_, key, value) => `${key}${BigInt(value) | USE_AI_ASSISTANT}`,
    )
    await route.fulfill({ response, body })
  })
}

/** Switches the editor to Live and replaces the whole text. */
async function replaceComment(page, text) {
  await aiDialog(page).getByRole('button', { name: 'Live', exact: true }).click()
  await aiDialog(page).locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(text)
}

async function askAbout(page, row) {
  await row.click({ button: 'right' })
  await menuItem(page, 'Ask AI assistant...').click()
  await expect(aiDialog(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
})

test.describe('on fixtures', () => {
  test.skip(!useMocks, 'saves a comment, and fakes the failures')

  test.describe('with the right', () => {
    test.beforeEach(async ({ page }) => {
      await grantAiRight(page)
      await page.goto('/alarms')
    })

    test('suggests a comment, which is edited and saved on the alarm', async ({ page }) => {
      const row = rows(page).filter({ hasText: FIXTURE_ALARM })
      await askAbout(page, row)

      await expect(aiDialog(page)).toContainText('Querying AI assistant')
      await expect(preview(page)).toContainText('srv-db-02')
      await expect(preview(page).locator('strong').first()).toHaveText('What I found:')
      await expect(preview(page)).toBeFocused()

      const text = `Pool raised to 200 connections, run ${Date.now()}`
      await replaceComment(page, `  ${text}\n`)
      const saved = page.waitForRequest(
        (request) => request.method() === 'POST' && COMMENTS.test(request.url()),
      )
      await footerButton(page, 'Save comment').click()

      expect((await saved).postDataJSON()).toEqual({ text })
      await expect(aiDialog(page)).toBeHidden()

      await row.click({ button: 'right' })
      await menuItem(page, 'Details').click()
      await expect(page.getByText(text)).toBeVisible()
    })

    test('Alarm Details asks too, and shows the saved comment as markdown', async ({ page }) => {
      await rows(page).filter({ hasText: FIXTURE_ALARM }).click({ button: 'right' })
      await menuItem(page, 'Details').click()
      await page.getByRole('button', { name: 'Ask AI assistant', exact: true }).click()

      await expect(preview(page)).toContainText('srv-db-02')
      const marker = `run ${Date.now()}`
      await replaceComment(page, `**Checked** the pool, ${marker}`)
      await footerButton(page, 'Save comment').click()
      await expect(aiDialog(page)).toBeHidden()

      const saved = page.locator('.comment-text').filter({ hasText: marker })
      await expect(saved.locator('strong')).toHaveText('Checked')
    })

    test('Cancel while it waits closes, and asking again sends a new request', async ({ page }) => {
      let release
      const held = new Promise((resolve) => (release = resolve))
      const asked = []
      const commentsSent = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && COMMENTS.test(request.url())) commentsSent.push(request)
      })
      await page.route(AI_COMMENT, async (route) => {
        const number = asked.push(route.request().url())
        await held
        // The first one was aborted by the browser, so it cannot be fulfilled.
        await route.fulfill({ json: { comment: `Answer ${number}` } }).catch(() => {})
      })

      const row = rows(page).filter({ hasText: FIXTURE_ALARM })
      await askAbout(page, row)
      await expect(aiDialog(page)).toContainText('Querying AI assistant')
      await footerButton(page, 'Cancel').click()
      await expect(aiDialog(page)).toBeHidden()

      await askAbout(page, row)
      await expect.poll(() => asked.length).toBe(2)
      await expect(aiDialog(page)).toContainText('Querying AI assistant')
      release()
      await expect(preview(page)).toHaveText('Answer 2')
      expect(commentsSent).toEqual([])
    })

    test('says the assistant is not available, without the reconnect notice, and asks again', async ({
      page,
    }) => {
      let calls = 0
      await page.route(AI_COMMENT, (route) =>
        ++calls === 1
          ? route.fulfill({ status: 503, json: { reason: 'AI assistant is not available' } })
          : route.fallback(),
      )

      await askAbout(page, rows(page).filter({ hasText: FIXTURE_ALARM }))
      await expect(aiDialog(page)).toContainText('The AI assistant is not available.')
      await expect(page.locator('.reconnect-toast')).toHaveCount(0)

      await footerButton(page, 'Try again').click()
      await expect(preview(page)).toContainText('srv-db-02')
    })

    test('a refusal names what is missing, in the dialog only', async ({ page }) => {
      await page.route(AI_COMMENT, (route) =>
        route.fulfill({ status: 403, json: { reason: 'Access denied' } }),
      )

      await askAbout(page, rows(page).filter({ hasText: FIXTURE_ALARM }))
      await expect(aiDialog(page)).toContainText('"Use AI assistant" system right')
      await expect(footerButton(page, 'Try again')).toHaveCount(0)
      await expect(page.getByText('Access Denied')).toHaveCount(0)

      await footerButton(page, 'Close').click()
      await expect(aiDialog(page)).toBeHidden()
    })
  })

  test('without the right, neither AI item is offered', async ({ page }) => {
    await page.goto('/alarms')

    await rows(page).filter({ hasText: FIXTURE_ALARM }).click({ button: 'right' })
    await expect(menuItem(page, 'Create incident')).toBeVisible()
    await expect(menuItem(page, 'Ask AI assistant...')).toHaveCount(0)
    await expect(menuItem(page, 'Discuss in AI chat')).toHaveCount(0)
  })
})

test.describe('on a server', () => {
  test.skip(useMocks, 'needs the server AI assistant')

  test('the assistant answers about an alarm, and Discard saves nothing', async ({ page }) => {
    // The server's request runs while the assistant calls tools; nginx gives it 300 s.
    test.setTimeout(330_000)
    const commentWrites = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && /\/comments(\/|$)/.test(request.url())) {
        commentWrites.push(`${request.method()} ${request.url()}`)
      }
    })

    await page.goto('/alarms')
    await expect(rows(page).first()).toBeVisible()
    const answered = page.waitForResponse((response) => AI_COMMENT.test(response.url()), {
      timeout: 310_000,
    })
    await askAbout(page, rows(page).first())
    await expect(aiDialog(page)).toContainText('Querying AI assistant')

    expect((await answered).status()).toBe(200)
    await expect(preview(page)).not.toBeEmpty()

    await footerButton(page, 'Discard').click()
    await expect(aiDialog(page)).toBeHidden()
    expect(commentWrites).toEqual([])
  })
})
