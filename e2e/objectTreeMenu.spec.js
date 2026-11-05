// A tree row's menu acts on that row without opening it. Needs the real overlay and real focus.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'serves its own tree')

const OPEN_ID = 502
const OTHER_ID = 505
const OPEN_URL = new RegExp(`/infrastructure/${OPEN_ID}/dcis`)

const OTHER_PATH = `500-501-${OTHER_ID}`
const row = (page, path) => page.locator(`.tree-node-row[data-path="${path}"]`)
const selectedRow = (page) => page.locator('.tree-node-row.selected')
const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })

async function openNode(page) {
  await page.goto(`/infrastructure/${OPEN_ID}/dcis`)
  await expect(selectedRow(page)).toHaveAttribute('data-path', `500-501-${OPEN_ID}`)
}

test('a right click leaves the open object and view alone until the menu is used', async ({
  page,
}) => {
  await openNode(page)
  const other = row(page, OTHER_PATH)

  await other.click({ button: 'right' })
  await expect(menuItem(page, 'Properties')).toBeVisible()
  await expect(page).toHaveURL(OPEN_URL)
  await expect(selectedRow(page)).toHaveAttribute('data-path', `500-501-${OPEN_ID}`)
  await expect(other).toHaveClass(/menu-target/)

  await page.keyboard.press('Escape')
  await expect(menuItem(page, 'Properties')).toBeHidden()
  await expect(other).not.toHaveClass(/menu-target/)
  await expect(page).toHaveURL(OPEN_URL)

  // Del must not take the open object just because a different row was right-clicked.
  await page.keyboard.press('Delete')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the overflow button opens the same menu without opening the row', async ({ page }) => {
  await openNode(page)
  const other = row(page, OTHER_PATH)

  await other.hover()
  await other.getByRole('button', { name: 'Actions' }).click()

  await expect(menuItem(page, 'Properties')).toBeVisible()
  await expect(other).toHaveClass(/menu-target/)
  await expect(page).toHaveURL(OPEN_URL)
})

test('an item that opens a view opens it on the right-clicked row', async ({ page }) => {
  await openNode(page)

  await row(page, OTHER_PATH).click({ button: 'right' })
  await menuItem(page, 'Properties').click()

  await expect(page).toHaveURL(new RegExp(`/infrastructure/${OTHER_ID}/properties`))
  await expect(selectedRow(page)).toHaveAttribute('data-path', OTHER_PATH)
})

test('an object in two branches stays selected in the branch its menu was opened in', async ({
  page,
}) => {
  await page.route('**/api/v1/objects/2/sub-tree*', async (route) => {
    const response = await route.fetch()
    const tree = await response.json()
    const office = tree.find((object) => object.id === 112)
    const cluster = tree
      .find((object) => object.id === 500)
      .children.find((object) => object.id === 501)
    // First in server order, so it is where a plain lookup by id would land.
    office.children.push(cluster.children.find((object) => object.id === OTHER_ID))
    await route.fulfill({ response, json: tree })
  })
  await openNode(page)

  await row(page, OTHER_PATH).click({ button: 'right' })
  await menuItem(page, 'Properties').click()

  await expect(page).toHaveURL(new RegExp(`/infrastructure/${OTHER_ID}/properties`))
  await expect(selectedRow(page)).toHaveAttribute('data-path', OTHER_PATH)
  await expect(row(page, `112-${OTHER_ID}`)).toHaveCount(0)
})
