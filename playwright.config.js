import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { AUTH_FILE, useMocks } from './e2e/support.js'

// One port per mode, so a server left running for one mode is never reused for the other.
const port = useMocks ? 5199 : 5198
const baseURL = `http://localhost:${port}`

// A built bundle, not the dev server: a fresh browser context would fetch a thousand unbundled
// modules from it per page. The demo server adds the mock API; preview proxies to the real one.
const serve = useMocks
  ? `yarn build --mode demo && PORT=${port} node docker/demo-server.js`
  : `yarn build && yarn preview --port ${port} --strictPort`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  // Tall enough for a busy workstation; a real failure still shows up as a failed assertion.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Each worker is a whole browser, and these run on workstations. A real server also bursts 502s
  // under many parallel page loads.
  workers: 2,
  // Traces and the HTML report keep request bodies and step values, so a login among them. Only
  // on fixtures.
  reporter: useMocks ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: useMocks ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/, teardown: 'teardown' },
    { name: 'teardown', testMatch: /auth\.teardown\.js/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: AUTH_FILE,
      },
    },
  ],
  webServer: {
    command: serve,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
})
