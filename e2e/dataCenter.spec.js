// The data center classes in Infrastructure on a real server, on a facility this test creates and
// removes: a room made from the tree menu opens on its floor plan in edit mode, and what the Room
// panel sets is what the server keeps.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(useMocks, 'mock mode lists the demo facility instead of making one')

const INFRASTRUCTURE_ROOT = 2

const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })

test('a new room opens in edit mode with a 600 mm grid and keeps the size set there', async ({
  page,
  server,
}) => {
  server.allow('/v1/objects')
  const facility = await server.createObject('Facility', INFRASTRUCTURE_ROOT, 'facility')

  await page.goto(`/infrastructure/${facility.id}/overview`)
  await expect(page.getByRole('heading', { name: 'Facility power' })).toBeVisible()

  await page.locator('.tree-node-row.selected').click({ button: 'right' })
  await menuItem(page, 'Create').hover()
  await menuItem(page, 'Room').click()
  const dialog = page.getByRole('dialog', { name: 'Create Room' })
  await expect(dialog.getByLabel('Width')).toHaveCount(0)
  await dialog.getByLabel('Name').fill(`e2e-room-${Date.now()}`)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  // The edit flag leaves the URL once edit mode is on.
  await expect(page).toHaveURL(/\/infrastructure\/\d+\/floorPlan$/, { timeout: 20_000 })
  const roomId = Number(page.url().match(/infrastructure\/(\d+)\/floorPlan/)[1])
  await expect(page.locator('.fp-edit-bar')).toBeVisible()
  const width = page.getByLabel('Width (mm)')
  await expect(width).toHaveValue('6000')
  await expect(page.getByLabel('Depth (mm)')).toHaveValue('6000')
  await expect(page.getByLabel('Floor tile (mm)')).toHaveValue('600')
  await expect(page.getByRole('button', { name: 'Snap' })).toBeVisible()

  await width.click()
  await width.press('Control+a')
  await width.pressSequentially('9000')
  await width.press('Enter')
  await expect(page.locator('.fp-toolbar')).toContainText(/54\.0 m/)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Floor plan saved')).toBeVisible()
  await expect(page.locator('.fp-edit-bar')).toBeHidden()

  const room = await server.read(`/v1/objects/${roomId}/room`)
  expect(room).toMatchObject({ gridTileSize: 600, gridLabels: 'LETTERS_NUMBERS', area: 54 })
  expect(room.outline).toEqual([
    { x: 0, y: 0 },
    { x: 9000, y: 0 },
    { x: 9000, y: 6000 },
    { x: 0, y: 6000 },
  ])
})
