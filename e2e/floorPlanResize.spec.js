// Resize handles of a floor plan element, on real pointer events over the demo room "Hall A". The
// spec answers the element's PATCH itself, so the mock room keeps its fixture.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'works on the demo room of the fixtures')

const HALL_A = 2090000030
const TILE = 600
/** 1800 by 1400 mm at 11400, 9300: its sides on grid lines, its top and bottom between two. */
const RAMP = 8
/** 1200 by 100 mm. */
const OFFICE_DOOR = 9
/** 2400 by 900 mm at 14400, 4200, turned 90 degrees: its width runs down the screen. */
const CRAH_3 = 3

const element = (page, id) => page.locator(`.fp-el[data-key="e:${id}"]`)
const handle = (page, id) => page.locator(`.fp-handle[data-handle="${id}"]`)
const field = (page, label) => page.getByLabel(label, { exact: true })

async function centre(locator) {
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Answers every element PATCH of the room and returns what was sent, in order. */
async function answerElementPatches(page) {
  const patches = []
  await page.route(`**/api/v1/objects/${HALL_A}/floor-plan/passive-elements/*`, (route) => {
    const request = route.request()
    if (request.method() !== 'PATCH') return route.fallback()
    const id = Number(new URL(request.url()).pathname.split('/').pop())
    patches.push({ id, body: request.postDataJSON() })
    return route.fulfill({ json: { id, ...request.postDataJSON() } })
  })
  return patches
}

async function editHallA(page) {
  await page.goto(`/infrastructure/${HALL_A}/floorPlan`)
  await page
    .getByRole('group', { name: 'Floor plan mode' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await expect(page.locator('.fp-edit-bar')).toBeVisible()
}

/** Presses a handle and moves it by screen pixels, in steps that cross the drag threshold. */
async function pressAndMove(page, id, dx, dy) {
  const from = await centre(handle(page, id))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 })
}

async function save(page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Floor plan saved')).toBeVisible()
}

test('handle drags resize an element on the grid, and Save sends its new place and size', async ({
  page,
}) => {
  const patches = await answerElementPatches(page)
  await editHallA(page)
  await expect(page.locator('.fp-handle')).toHaveCount(0)

  await element(page, RAMP).click()
  await expect(page.locator('.fp-handle')).toHaveCount(8)
  await expect(handle(page, 'e')).toHaveCSS('cursor', 'ew-resize')
  await expect(handle(page, 's')).toHaveCSS('cursor', 'ns-resize')
  await expect(handle(page, 'nw')).toHaveCSS('cursor', 'nwse-resize')
  await expect(handle(page, 'ne')).toHaveCSS('cursor', 'nesw-resize')

  const west = await centre(handle(page, 'w'))
  const east = await centre(handle(page, 'e'))
  const tilePx = ((east.x - west.x) / 1800) * TILE

  // A little short of a tile: the edge still lands on the next grid line.
  await pressAndMove(page, 'e', tilePx * 0.8, 0)
  await expect(page.locator('.fp-readout')).toHaveText(/2400\D+1400/)
  await expect(field(page, 'Width (mm)')).toHaveValue('2400')
  await page.mouse.up()
  await expect(page.locator('.fp-readout')).toHaveCount(0)
  await expect(page.locator('.fp-handle')).toHaveCount(8)

  // The reference corner: the far corner stays, so the place changes with the size. The top edge
  // goes to the grid line at 9000, and the bottom stays at 10700.
  await pressAndMove(page, 'nw', -tilePx * 0.8, -tilePx * 0.8)
  await page.mouse.up()
  await expect(field(page, 'X (mm)')).toHaveValue('10800')
  await expect(field(page, 'Y (mm)')).toHaveValue('9000')
  await expect(field(page, 'Width (mm)')).toHaveValue('3000')
  await expect(field(page, 'Depth (mm)')).toHaveValue('1700')

  // One undo step per drag.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(field(page, 'X (mm)')).toHaveValue('11400')
  await expect(field(page, 'Width (mm)')).toHaveValue('2400')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(field(page, 'Width (mm)')).toHaveValue('3000')

  await save(page)
  expect(patches).toEqual([{ id: RAMP, body: { x: 10800, y: 9000, width: 3000, depth: 1700 } }])
})

test('a thin element gets all its handles, spread apart, and resizes across', async ({ page }) => {
  const patches = await answerElementPatches(page)
  await editHallA(page)

  await element(page, OFFICE_DOOR).click()
  await expect(page.locator('.fp-handle')).toHaveCount(8)
  const door = await element(page, OFFICE_DOOR).locator('polygon').first().boundingBox()
  const north = await centre(handle(page, 'n'))
  const south = await centre(handle(page, 's'))
  expect(north.y).toBeLessThan(door.y)
  expect(south.y).toBeGreaterThan(door.y + door.height)
  // Wider than three handles at this zoom, so the end handles sit on its ends.
  const west = await centre(handle(page, 'w'))
  const east = await centre(handle(page, 'e'))
  const tilePx = ((east.x - west.x) / 1200) * TILE

  // The bottom edge at 3100 goes to the grid line at 3600.
  await pressAndMove(page, 's', 0, tilePx * 0.8)
  await page.mouse.up()
  await expect(field(page, 'Depth (mm)')).toHaveValue('600')
  await expect(field(page, 'Width (mm)')).toHaveValue('1200')

  await save(page)
  expect(patches).toEqual([{ id: OFFICE_DOOR, body: { depth: 600 } }])
})

test('a turned element resizes along its own axes', async ({ page }) => {
  const patches = await answerElementPatches(page)
  await editHallA(page)

  await element(page, CRAH_3).click()
  await expect(handle(page, 'e')).toHaveCSS('cursor', 'ns-resize')
  const near = await centre(handle(page, 'w'))
  const far = await centre(handle(page, 'e'))
  const tilePx = ((far.y - near.y) / 2400) * TILE

  await pressAndMove(page, 'e', 0, tilePx)
  await page.mouse.up()
  await expect(field(page, 'Width (mm)')).toHaveValue('3000')
  await expect(field(page, 'Depth (mm)')).toHaveValue('900')

  // Off the grid with Snap off: the pointer's own millimetres, never under 50.
  await page.getByRole('button', { name: 'Snap', exact: true }).click()
  await pressAndMove(page, 's', tilePx * 3, 0)
  await page.mouse.up()
  await expect(field(page, 'Depth (mm)')).toHaveValue('50')

  await save(page)
  expect(patches).toEqual([{ id: CRAH_3, body: { width: 3000, depth: 50 } }])
})
