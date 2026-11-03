import fs from 'node:fs'
import process from 'node:process'
import { loadEnv } from 'vite'

// Same files as the dev server, so the untracked `.env.local` holds the target and test account.
const env = loadEnv('development', process.cwd(), '')

export const AUTH_FILE = 'e2e/.auth/state.json'

/** Object ids for this run, found at sign-in. Nothing here is secret, but it goes with the session. */
export const TARGETS_FILE = 'e2e/.auth/targets.json'

/** What the guard in fixtures.js refused during a run: method and path, never a body. */
export const BLOCKED_LOG = 'test-results/blocked-writes.log'

/** Every item a test creates on a real server carries this, so nothing else is ever touched. */
export const TEST_PREFIX = 'e2e-'

/** `VITE_USE_MOCKS=true yarn test:e2e` runs on the fixtures in `mocks/`, otherwise on a server. */
export const useMocks = env.VITE_USE_MOCKS === 'true'

/** The objects found at sign-in. */
export function readTargets() {
  return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8'))
}

/** Mock login takes anything. A real server needs an account made for these tests. */
export function credentials() {
  if (useMocks) return { user: 'admin', password: 'admin' }
  const { NETXMS_USER: user, NETXMS_PASSWORD: password } = env
  if (!user || !password) {
    throw new Error(
      'Live runs need NETXMS_USER and NETXMS_PASSWORD in .env.local (or use VITE_USE_MOCKS=true)',
    )
  }
  return { user, password }
}

/**
 * Collects what a page reports while a test runs: uncaught exceptions, console errors and failed
 * API calls.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ errors: string[], failedRequests: string[] }}
 */
export function watchProblems(page) {
  const problems = { errors: [], failedRequests: [] }
  page.on('pageerror', (error) => problems.errors.push(error.message))
  page.on('console', (message) => {
    const text = message.text()
    // The browser logs each failed request too; those are in failedRequests with their URL.
    if (message.type() === 'error' && !text.startsWith('Failed to load resource')) {
      problems.errors.push(text)
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      const path = new URL(response.url()).pathname.replace('/api', '')
      problems.failedRequests.push(`${response.status()} ${response.request().method()} ${path}`)
    }
  })
  return problems
}

/** Waits until a screen has stopped loading. Polling views never go idle, so this is bounded. */
export async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}

/** Moves to another perspective through the rail, the way a user leaves a view. */
export async function openPerspective(page, name) {
  await page.getByRole('navigation', { name: 'Perspectives' }).getByRole('link', { name }).click()
}

/** The visible header labels of the table, left to right. */
export async function headerLabels(table) {
  return table.locator('thead th .app-table__th-label').allTextContents()
}

/** Drags a table header onto the given side of another header. */
export async function dragHeader(page, table, from, onto, side) {
  const header = (label) =>
    table.locator('thead th').filter({ has: page.getByText(label, { exact: true }) })
  const source = await header(from).boundingBox()
  const target = await header(onto).boundingBox()
  const y = source.y + source.height / 2
  await page.mouse.move(source.x + source.width / 2, y)
  await page.mouse.down()
  // Two steps: the first crosses the drag threshold, the second lands on the drop position.
  await page.mouse.move(source.x + source.width / 2 + 10, y)
  const x = target.x + target.width * (side === 'left' ? 0.25 : 0.75)
  await page.mouse.move(x, target.y + target.height / 2, { steps: 5 })
  await page.mouse.up()
}
