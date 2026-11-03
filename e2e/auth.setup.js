import fs from 'node:fs'
import { test as setup, expect } from './fixtures.js'
import { AUTH_FILE, TARGETS_FILE, credentials, useMocks } from './support.js'

/** The ids of the fixtures in `mocks/`. */
const MOCK_TARGETS = { node: 502, container: 500, map: 600, dashboard: 700, dciNode: 502 }

/**
 * Picks objects to look at from what the server has: the node with the most interfaces, and the
 * one of the busiest nodes with the most DCIs.
 */
async function findTargets(page) {
  return page.evaluate(async () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('sessionGuid')}` }
    const getJson = async (path) => {
      const response = await fetch(`/api${path}`, { headers })
      return response.ok ? response.json() : null
    }
    const flatten = (entries) =>
      (entries ?? []).flatMap((entry) => [entry, ...flatten(entry.children)])
    const unique = (objects) => [...new Map(objects.map((o) => [o.id, o])).values()]

    const infrastructure = unique(flatten(await getJson('/v1/objects/2/sub-tree')))
    const interfacesOf = (node) =>
      (node.children ?? []).filter((child) => child.class === 'Interface').length
    const nodes = infrastructure
      .filter((object) => object.class === 'Node')
      .sort((a, b) => interfacesOf(b) - interfacesOf(a))

    let dciNode = nodes[0]?.id
    let dciCount = -1
    for (const node of nodes.slice(0, 12)) {
      const values = await getJson(`/v1/objects/${node.id}/data-collection/current-values`)
      const count = values?.values?.length ?? 0
      if (count > dciCount) [dciNode, dciCount] = [node.id, count]
    }
    const first = async (root, objectClass) =>
      unique(flatten(await getJson(`/v1/objects/${root}/sub-tree`))).find(
        (object) => object.class === objectClass,
      )?.id

    return {
      node: nodes[0]?.id,
      interfaces: nodes[0] ? interfacesOf(nodes[0]) : 0,
      dciNode,
      dciCount,
      otherNode: nodes[1]?.id,
      container: infrastructure.find((o) => o.class === 'Container' && o.children?.length > 1)?.id,
      rack: infrastructure.find((o) => o.class === 'Rack')?.id,
      chassis: infrastructure.find((o) => o.class === 'Chassis')?.id,
      accessPoint: infrastructure.find((o) => o.class === 'AccessPoint')?.id,
      map: await first(6, 'NetworkMap'),
      dashboard: await first(7, 'Dashboard'),
      businessService: await first(9, 'BusinessService'),
    }
  })
}

setup('sign in', async ({ page }) => {
  const { user, password } = credentials()

  await page.goto('/login')
  await page.locator('#username').fill(user)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('navigation', { name: 'Perspectives' })).toBeVisible()
  await page.context().storageState({ path: AUTH_FILE })
  fs.writeFileSync(
    TARGETS_FILE,
    JSON.stringify(useMocks ? MOCK_TARGETS : await findTargets(page)),
  )
})
