// Dragging rows of the Infrastructure tree, on real drag events. The spec answers bind and unbind
// itself and serves the tree as they left it, so the mock object store keeps its fixtures.
import { test, expect } from './fixtures.js'
import { useMocks } from './support.js'

test.skip(!useMocks, 'serves its own tree')

const ROOT = 2
const OFFICE = 112
const ALPHA = 500
const NETXMS_NODE = 108
const TABLET = 529
const TABLET_NAME = 'iPad-Admin-01'

const row = (page, path) => page.locator(`.tree-node-row[data-path="${path}"]`)
const menuItem = (page, name) => page.getByRole('menuitem', { name, exact: true })

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

/** The children list a bind or unbind on `parentId` changes; the root's is the tree itself. */
function childrenOf(tree, parentId) {
  if (parentId === ROOT) return tree
  const parent = findNode(tree, parentId)
  parent.children ??= []
  return parent.children
}

/** Answers bind and unbind, and serves the tree as they left it. Returns the calls, in order. */
async function serveBindings(page) {
  const calls = []
  await page.route(/\/api\/v1\/objects\/\d+\/children\/\d+(\?.*)?$/, (route) => {
    const request = route.request()
    const [, parent, child] = request.url().match(/objects\/(\d+)\/children\/(\d+)/)
    calls.push({ method: request.method(), parent: Number(parent), child: Number(child) })
    return request.method() === 'DELETE'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: { id: Number(child) } })
  })
  await page.route(`**/api/v1/objects/${ROOT}/sub-tree*`, async (route) => {
    const response = await route.fetch()
    const tree = await response.json()
    for (const { method, parent, child } of calls) {
      const list = childrenOf(tree, parent)
      if (method === 'PUT') list.push(structuredClone(findNode(tree, child)))
      else
        list.splice(
          list.findIndex((node) => node.id === child),
          1,
        )
    }
    await route.fulfill({ response, json: tree })
  })
  return calls
}

/** Opening the tablet reveals its row, under DataCenter-Alpha. */
async function openTablet(page) {
  await page.goto(`/infrastructure/${TABLET}`)
  await expect(row(page, `${ALPHA}-${TABLET}`)).toBeVisible()
}

test('a row dropped on a container moves there, out of the one it was in', async ({ page }) => {
  const calls = await serveBindings(page)
  await openTablet(page)

  await row(page, `${ALPHA}-${TABLET}`).dragTo(row(page, String(OFFICE)))

  await expect(page.getByText('Moved to Office')).toBeVisible()
  expect(calls).toEqual([
    { method: 'PUT', parent: OFFICE, child: TABLET },
    { method: 'DELETE', parent: ALPHA, child: TABLET },
  ])
  await expect(row(page, `${ALPHA}-${TABLET}`)).toHaveCount(0)
  await row(page, String(OFFICE)).locator('.tree-toggle').click()
  await expect(row(page, `${OFFICE}-${TABLET}`)).toBeVisible()
})

test('only a row that can take the drag lights up under it', async ({ page }) => {
  const calls = await serveBindings(page)
  await openTablet(page)
  const centre = async (path) => {
    const box = await row(page, path).boundingBox()
    return [box.x + box.width / 2, box.y + box.height / 2]
  }
  const node = await centre(String(NETXMS_NODE))
  const office = await centre(String(OFFICE))

  await page.mouse.move(...(await centre(`${ALPHA}-${TABLET}`)))
  await page.mouse.down()
  await page.mouse.move(...node, { steps: 5 })
  await expect(row(page, String(NETXMS_NODE))).not.toHaveClass(/drop-target/)
  await page.mouse.move(...office, { steps: 5 })
  await expect(row(page, String(OFFICE))).toHaveClass(/drop-target/)
  await page.mouse.move(...node, { steps: 5 })
  await expect(row(page, String(OFFICE))).not.toHaveClass(/drop-target/)
  await page.mouse.up()

  await expect(row(page, `${ALPHA}-${TABLET}`)).toBeVisible()
  expect(calls).toEqual([])
})

test('Ctrl+drop binds the row and leaves it where it was', async ({ page }) => {
  const calls = await serveBindings(page)
  await openTablet(page)

  await page.keyboard.down('Control')
  await row(page, `${ALPHA}-${TABLET}`).dragTo(row(page, String(OFFICE)))
  await page.keyboard.up('Control')

  await expect(page.getByText('Object bound')).toBeVisible()
  expect(calls).toEqual([{ method: 'PUT', parent: OFFICE, child: TABLET }])
  await expect(row(page, `${ALPHA}-${TABLET}`)).toBeVisible()
})

test('set to Confirm in the sidebar settings, a drop asks first', async ({ page }) => {
  const calls = await serveBindings(page)
  await openTablet(page)

  await page.getByRole('button', { name: 'Sidebar settings' }).click()
  await menuItem(page, 'Confirm').click()
  await row(page, `${ALPHA}-${TABLET}`).dragTo(row(page, String(OFFICE)))

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(`Move "${TABLET_NAME}" to "Office"?`)
  expect(calls).toEqual([])
  await dialog.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('Moved to Office')).toBeVisible()
  expect(calls).toHaveLength(2)
})
