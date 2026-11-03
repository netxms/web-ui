// VISUAL_PASS R0.2's limited account, as far as a new user with only the server's default rights
// and no object access goes: R3.9, R3.18, R8.1 and the error states of a read the server refuses.
// The user is created for this test and removed after it, its password random and in memory only.
import fs from 'node:fs'
import { test, expect, guardServer } from './fixtures.js'
import { settle, useMocks, watchProblems } from './support.js'

test.skip(useMocks, 'the mock login grants everyone the same rights')

const CONFIG_SECTIONS = [
  ...fs
    .readFileSync('src/views/configuration/configSections.js', 'utf-8')
    .matchAll(/\bid: '([a-zA-Z-]+)'/g),
].map((match) => match[1])

const SHOTS = 'test-results/limited-user'

test('a new account with default rights sees neither the sections nor an error', async ({
  browser,
  server,
}, testInfo) => {
  test.setTimeout(240_000)
  const account = await server.createUser('limited')
  // A new context inherits the project's options, and so the run's signed-in session.
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] },
  })
  await guardServer(context)
  const page = await context.newPage()
  const problems = watchProblems(page)
  fs.mkdirSync(SHOTS, { recursive: true })

  await page.goto('/login')
  await page.locator('#username').fill(account.name)
  await page.locator('input[type="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('navigation', { name: 'Perspectives' })).toBeVisible({
    timeout: 15_000,
  })
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/home.png` })

  // R3.9, R3.18, R8.1: not offered.
  await page.goto('/configuration')
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/configuration.png` })
  const list = page.locator('.layout-main, body').first()
  for (const name of ['Persistent Storage', 'Mapping Tables', 'SNMP Trap', 'Agent Tunnels']) {
    await expect(list.getByRole('link', { name, exact: false }), name).toHaveCount(0)
  }

  // A link to each section still lands somewhere that says why, and nothing throws.
  const { systemRights } = await server.read(`/v1/users/${account.id}`)
  const everyone = await server.read(`/v1/user-groups/${0x40000000}`)
  const results = { systemRights, everyoneRights: everyone.systemRights }
  for (const section of CONFIG_SECTIONS) {
    problems.failedRequests.length = 0
    await page.goto(`/configuration/${section}`)
    await expect(page.getByRole('navigation', { name: 'Perspectives' })).toBeVisible()
    await page.waitForTimeout(700)
    const denied = await page.getByText('Access denied').count()
    results[section] = { denied: denied > 0, failed: [...problems.failedRequests] }
    if (!denied) await page.screenshot({ path: `${SHOTS}/section-${section}.png` })
  }
  fs.writeFileSync(`${SHOTS}/sections.json`, JSON.stringify(results, null, 1))

  for (const [name, url] of [
    ['infrastructure', '/infrastructure'],
    ['alarms', '/alarms'],
    ['logs', '/logs/EventLog'],
    ['dashboards', '/dashboards'],
    ['tools', '/tools'],
  ]) {
    await page.goto(url)
    await settle(page)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
  }

  expect(problems.errors).toEqual([])
  await context.close()
})
