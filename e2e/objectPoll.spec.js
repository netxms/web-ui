// Forced polls stream their output over a WebSocket. On fixtures, with the stream replayed.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'replays the poll stream on a fixture node')

test('a poll shows its lines with levels, appends a rerun and clears', async ({ page }) => {
  let started = 0
  await page.route('**/api/v1/objects/502/poll/status', (route) => {
    started++
    return route.fulfill({
      status: 202,
      json: { pollType: 'status', token: 't', expiresIn: 30, wsUrl: `/v1/polls/output/t${started}` },
    })
  })
  await page.routeWebSocket(/polls\/output/, (socket) => {
    socket.send(JSON.stringify({ type: 'output', data: 'Starting status poll of node web-01' }))
    socket.send(JSON.stringify({ type: 'output', level: 'error', data: '   Agent is unreachable' }))
    socket.send(JSON.stringify({ type: 'completed' }))
    socket.close()
  })

  await page.goto('/infrastructure/502/polls/status?autorun=1')

  // Every poll type has a tab panel; only the open one is in the accessibility tree.
  const output = page.getByRole('tabpanel').getByTestId('poll-output')
  await expect(output).toContainText('Poll completed successfully')
  await expect(output.locator('.poll-line--error')).toContainText('Agent is unreachable')
  await expect(page).not.toHaveURL(/autorun/)

  await page.getByRole('button', { name: 'Run Poll' }).click()
  await expect(output.getByText('Poll completed successfully')).toHaveCount(2)
  expect(started).toBe(2)

  await page.getByRole('button', { name: 'Clear Output' }).click()
  await expect(output).toContainText('Click "Run Poll" to start.')
})

test('a refused poll says why in the output', async ({ page }) => {
  await page.route('**/api/v1/objects/502/poll/topology', (route) =>
    route.fulfill({ status: 400, json: { reason: 'Poll type is not applicable to this object' } }),
  )

  await page.goto('/infrastructure/502/polls/topology?autorun=1')

  const output = page.getByRole('tabpanel').getByTestId('poll-output')
  await expect(output.locator('.poll-line--error')).toContainText(
    'POLL ERROR: Poll type is not applicable to this object',
  )
  await expect(page.getByRole('button', { name: 'Run Poll' })).toBeEnabled()
})
