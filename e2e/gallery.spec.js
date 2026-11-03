// A screenshot of every main screen in light, dark and a narrow window, for a person to scroll
// through, plus what each screen reported. `yarn test:e2e:gallery`, then open
// e2e/.gallery/index.html. Stays out of git: on a real server it shows that server's data.
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { TARGETS_FILE, settle, useMocks, watchProblems } from './support.js'

const OUT = 'e2e/.gallery'

const MODES = {
  light: { dark: false, viewport: { width: 1440, height: 900 } },
  dark: { dark: true, viewport: { width: 1440, height: 900 } },
  narrow: { dark: false, viewport: { width: 760, height: 900 } },
}

/** Ids from a registry's source, so a new section or view shows up here by itself. */
function registryIds(file) {
  const source = fs.readFileSync(file, 'utf-8')
  return [...new Set([...source.matchAll(/\bid: '([a-zA-Z-]+)'/g)].map((match) => match[1]))]
}

/** A view of one object. Not offered on that class, the app falls back and the shot says so. */
const objectView = (target, view) => (targets) =>
  targets[target] ? `/infrastructure/${targets[target]}/${view}` : null

const SCREENS = [
  ['home', () => '/home'],
  ['preferences', () => '/preferences'],
  ['alarms', () => '/alarms'],
  ['incidents', () => '/incidents'],
  ['dashboards', () => '/dashboards'],
  ['dashboard', (targets) => targets.dashboard && `/dashboards/${targets.dashboard}`],
  ['network-maps', () => '/network-maps'],
  ['network-map', (targets) => targets.map && `/network-maps/${targets.map}`],
  ['templates', () => '/templates'],
  ['assets', () => '/assets'],
  ['business-services', () => '/business-services'],
  [
    'business-service',
    (targets) =>
      targets.businessService && `/business-services/${targets.businessService}/checks`,
  ],
  ['logs', () => '/logs'],
  ['event-log', () => '/logs/EventLog'],
  ['ai', () => '/ai'],
  ['tools', () => '/tools'],
  ['configuration', () => '/configuration'],
  ['container', objectView('container', 'status')],
  ['container-status-map', objectView('container', 'statusMap')],
  ['rack', objectView('rack', 'rack')],
  ['chassis', objectView('chassis', 'chassis')],
  ['access-point-radios', objectView('accessPoint', 'radios')],
  ['access-point-stations', objectView('accessPoint', 'wirelessStations')],
  ...registryIds('src/config/objectViews.js')
    .filter((view) => !['statusMap', 'rack', 'chassis', 'radios', 'wirelessStations'].includes(view))
    .map((view) => [`node-${view}`, objectView('node', view)]),
  ...registryIds('src/views/configuration/configSections.js').map((section) => [
    `config-${section}`,
    () => `/configuration/${section}`,
  ]),
]

function writeIndex() {
  const records = fs
    .readdirSync(OUT)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf-8')))
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const rows = SCREENS.map(([name]) => {
    const shots = records.filter((record) => record.name === name)
    if (!shots.length) return ''
    const notes = shots.flatMap((shot) => [
      ...shot.errors.map((text) => `<li class="error">${shot.mode}: ${escape(text)}</li>`),
      ...(shot.paneScroll ? [`<li>${shot.mode}: main pane scrolls sideways</li>`] : []),
      ...(shot.pageScroll ? [`<li class="error">${shot.mode}: page scrolls sideways</li>`] : []),
      ...(shot.fellBack ? [`<li>${shot.mode}: not offered here, opened ${shot.opened}</li>`] : []),
      ...shot.failedRequests.map((text) => `<li>${shot.mode}: ${escape(text)}</li>`),
    ])
    const images = shots
      .map((shot) => `<a href="${name}-${shot.mode}.png"><img src="${name}-${shot.mode}.png" alt="${shot.mode}"></a>`)
      .join('')
    return `<section><h2>${name} <code>${shots[0].url}</code></h2><div class="row">${images}</div><ul>${[...new Set(notes)].join('')}</ul></section>`
  })
  const count = records.filter(
    (record) =>
      SCREENS.some(([name]) => name === record.name) && (record.errors.length || record.pageScroll),
  ).length
  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Gallery</title><style>
body{font:14px sans-serif;margin:16px}h2{font-size:15px;margin:24px 0 8px}
.row{display:flex;gap:8px;flex-wrap:wrap}img{height:300px;border:1px solid #888}
ul{margin:6px 0;padding-left:18px;font-size:12px}.error{color:#c00;font-weight:600}
</style><h1>Gallery: ${count} of ${records.length} shots have errors or sideways page scroll</h1>${rows.join('')}`,
  )
}

test.describe('@gallery', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
  test.afterAll(writeIndex)

  for (const [name, urlFor] of SCREENS) {
    for (const [mode, { dark, viewport }] of Object.entries(MODES)) {
      test(`${name} ${mode}`, async ({ page }) => {
        const url = urlFor(JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8')))
        test.skip(!url, 'the server has no such object')

        await page.setViewportSize(viewport)
        const problems = watchProblems(page)

        await page.goto(url)
        await expect(page.getByRole('navigation', { name: 'Perspectives' })).toBeVisible()
        await settle(page)

        // Through the header's toggle, since signing in replaces local preferences with the
        // account's. On a server the write guard keeps this in the browser.
        const isDark = await page.locator('html').evaluate((el) => el.classList.contains('app-dark'))
        if (isDark !== dark) {
          await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click()
          // Off the button, or its tooltip is in the shot.
          await page.mouse.move(viewport.width / 2, viewport.height - 5)
        }
        // Let entrance transitions and canvases finish; nothing to wait on for those.
        await page.waitForTimeout(useMocks ? 300 : 1000)

        const scroll = await page.evaluate(() => {
          const main = document.querySelector('.layout-main')
          return {
            pageScroll: document.documentElement.scrollWidth > window.innerWidth,
            paneScroll: main ? main.scrollWidth > main.clientWidth + 1 : false,
          }
        })
        const opened = new URL(page.url()).pathname
        await page.screenshot({ path: path.join(OUT, `${name}-${mode}.png`) })
        fs.writeFileSync(
          path.join(OUT, `${name}-${mode}.json`),
          JSON.stringify({ name, url, mode, opened, fellBack: opened !== url, ...scroll, ...problems }),
        )
      })
    }
  }
})
