// Placing the backdrop image of the demo "Meet-Me Room" on real pointer events. Its fixture drawing
// is 960 px wide and uncalibrated, so it spans the 4800 mm outline at 5 mm a pixel. The spec
// answers the room PATCH itself, so the mock room keeps its fixture.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'works on the demo room of the fixtures')

const MEET_ME_ROOM = 2090000031

const field = (page, label) => page.getByLabel(label, { exact: true })
const backdrop = (page) => page.locator('.fp-backdrop')
/** Millimetres per image pixel in the side panel; a drag lands within a screen pixel. */
const scale = (page) => async () =>
  Number(await field(page, 'Scale, mm per image pixel').inputValue())

async function centre(locator) {
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Answers the room PATCH and returns what was sent, in order. */
async function answerRoomPatches(page) {
  const patches = []
  await page.route(`**/api/v1/objects/${MEET_ME_ROOM}/room`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    patches.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  return patches
}

/** Presses at `from` and moves by screen pixels, in steps that cross the drag threshold. */
async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 })
  await page.mouse.up()
}

test('an uncalibrated backdrop spans the room, and moves, scales and calibrates in its own mode', async ({
  page,
}) => {
  const patches = await answerRoomPatches(page)
  await page.goto(`/infrastructure/${MEET_ME_ROOM}/floorPlan`)
  await expect(backdrop(page)).toHaveAttribute('width', '4800')
  await expect(backdrop(page)).toHaveAttribute('height', '3600')

  await page
    .getByRole('group', { name: 'Floor plan mode' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.getByRole('button', { name: 'Backdrop', exact: true }).click()
  await expect(page.locator('.fp-canvas--backdrop')).toBeVisible()
  await expect(field(page, 'Scale, mm per image pixel')).toHaveValue('5')
  await expect(page.locator('.fp-backdrop-edit .fp-handle')).toHaveCount(4)

  const frame = await page.locator('.fp-backdrop-frame').boundingBox()
  const pxPerMm = frame.width / 4800

  // A rack under the image does not take the press: the image moves.
  await drag(page, await centre(page.locator('.fp-backdrop-surface')), 600 * pxPerMm, 0)
  await expect(field(page, 'X (mm)')).toHaveValue(/^(59\d|60\d)$/)
  await expect(field(page, 'Y (mm)')).toHaveValue('0')

  // The south-east corner in by half: the north-west corner stays, at 2.5 mm a pixel.
  const se = await centre(page.locator('[data-handle="se"]'))
  await drag(page, se, -frame.width / 2, -frame.height / 2)
  await expect.poll(scale(page)).toBeCloseTo(2.5, 1)
  await expect(field(page, 'Y (mm)')).toHaveValue('0')

  // Two points 1200 mm apart on the plan are really 2400 mm: 5 mm a pixel again.
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click()
  await expect(page.locator('.fp-canvas--calibrate')).toBeVisible()
  const start = await page.locator('.fp-backdrop').boundingBox()
  await page.mouse.click(start.x - 20, start.y + 10)
  await expect(page.getByText('That click was off the image')).toBeVisible()
  const a = { x: start.x + 10, y: start.y + 10 }
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(a.x + 1200 * pxPerMm, a.y)
  const distance = field(page, 'Real length (mm)')
  await expect(distance).toBeFocused()
  await expect(distance).toHaveValue(/^(119\d|120\d)$/)
  await distance.fill('2400')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(scale(page)).toBeCloseTo(5, 1)

  // Escape leaves the mode; the plan takes the pointer again.
  await page.keyboard.press('Escape')
  await expect(page.locator('.fp-canvas--backdrop')).toHaveCount(0)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Floor plan saved')).toBeVisible()
  expect(patches).toHaveLength(1)
  expect(Object.keys(patches[0]).sort()).toEqual(['backgroundScale', 'backgroundX', 'backgroundY'])
  expect(patches[0].backgroundScale).toBeGreaterThan(4900)
  expect(patches[0].backgroundScale).toBeLessThan(5100)
})
