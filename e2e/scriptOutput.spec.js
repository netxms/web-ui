// VISUAL_PASS R6.9: a script that prints thousands of lines must not freeze the page. On fixtures,
// with the output stream replayed, so what is measured is the client and not the server.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'replays the stream on a fixture node')

const LINES = 5000

test('R6.9 thousands of output frames do not each re-render the page', async ({ page }) => {
  test.setTimeout(300_000)
  await page.route('**/api/v1/objects/*/execute-script', (route) =>
    route.fulfill({
      status: 202,
      json: { executionId: 1, token: 't', expiresIn: 60, wsUrl: '/v1/script-executions/output/t' },
    }),
  )
  await page.routeWebSocket(/script-executions\/output/, async (socket) => {
    for (let line = 0; line < LINES; line++) {
      socket.send(JSON.stringify({ type: 'output', data: `line ${line}\n` }))
      if (line % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 1))
    }
    socket.send(JSON.stringify({ type: 'result', data: 'done' }))
    socket.send(JSON.stringify({ type: 'completed' }))
    socket.close()
  })

  await page.goto('/infrastructure/502/script')
  await page.locator('.cm-content').first().fill('x')

  // Renders and not time, which depends on how busy the machine is: the freeze was one render and
  // one layout per frame, at a cost that grows with the output.
  const output = page.locator('.output-content')
  await output.evaluate((element) => {
    window.outputRenders = 0
    new MutationObserver(() => window.outputRenders++).observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  })

  await page.getByRole('button', { name: 'Execute', exact: true }).click()
  await expect(output).toContainText('done', { timeout: 280_000 })
  await expect(output).toContainText(`line ${LINES - 1}`)

  const renders = await page.evaluate(() => window.outputRenders)
  console.log(`R6.9 ${LINES} frames: ${renders} renders`)
  expect(renders).toBeLessThan(LINES / 10)
})
