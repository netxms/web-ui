// VISUAL_PASS R3 on a real server: Persistent Storage, Mapping Tables and SNMP Trap Mappings have
// no fixtures. Each test creates its own `e2e-` item, removes it, and checks that everything else
// in the collection is as it was.
import { test, expect } from './fixtures.js'
import { TEST_PREFIX, useMocks } from './support.js'

test.skip(useMocks, 'these sections have no fixtures')

const unique = (label) => `${TEST_PREFIX}${label}-${Date.now()}`

/** The list without this test's items, comparable before and after. */
const othersIn = (items, nameOf) => items.filter((item) => !nameOf(item).startsWith(TEST_PREFIX))

const rowWith = (page, text) => page.locator('.app-table tbody tr').filter({ hasText: text })

async function confirmDelete(page) {
  await page.locator('.p-confirmdialog').getByRole('button', { name: 'Delete' }).click()
}

test('R3.2 Persistent Storage: create, edit, delete', async ({ page, server }) => {
  server.allow('/v1/persistent-storage')
  const before = await server.read('/v1/persistent-storage')
  const key = unique('key')

  await page.goto('/configuration/persistent-storage')
  await page.getByRole('button', { name: 'Create Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Entry' })
  await dialog.getByLabel('Key').fill(key)
  await dialog.getByLabel('Value').fill('first')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(rowWith(page, key)).toContainText('first')

  await rowWith(page, key).click()
  const edit = page.getByRole('dialog', { name: 'Edit Entry' })
  await expect(edit.getByLabel('Key')).toBeDisabled()
  await edit.getByLabel('Value').fill('second')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(rowWith(page, key)).toContainText('second')

  await page.reload()
  await expect(rowWith(page, key)).toContainText('second')

  await rowWith(page, key).locator('.app-table__checkbox-wrap').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(rowWith(page, key)).toHaveCount(0)

  const after = await server.read('/v1/persistent-storage')
  expect(Object.keys(after).filter((name) => name.startsWith(TEST_PREFIX))).toEqual([])
  for (const [name, value] of Object.entries(before)) {
    if (!name.startsWith(TEST_PREFIX)) expect(after[name], name).toBe(value)
  }
})

test('R3.4 R3.6 R3.7 Mapping Tables: numeric keys, add and next, leave guard, delete', async ({
  page,
  server,
}) => {
  server.allow('/v1/mapping-tables')
  const nameOf = (table) => table.name
  const before = othersIn(await server.read('/v1/mapping-tables'), nameOf)
  const name = unique('table')

  await page.goto('/configuration/mapping-tables')
  await page.getByRole('button', { name: 'New Mapping Table' }).click()
  await page.getByLabel('Name').fill(name)

  const save = page.getByRole('button', { name: 'Save', exact: true })
  const addEntry = page.getByRole('dialog', { name: 'Add Entry' })
  const problems = page.getByText(/must be fixed before saving/)

  // A text key on a table turned numeric: flagged in the table, and Save is blocked.
  await page.getByRole('button', { name: 'Add Entry' }).click()
  await addEntry.getByLabel('Key').fill('abc')
  await addEntry.getByLabel('Value').fill('sixteen')
  await addEntry.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('Numeric keys').click()
  await expect(problems).toBeVisible()
  await expect(save).toBeDisabled()

  await rowWith(page, 'sixteen').click()
  const editEntry = page.getByRole('dialog', { name: 'Edit Entry' })
  await editEntry.getByLabel('Key').fill('0x10')
  await editEntry.getByRole('button', { name: 'Apply' }).click()
  await expect(problems).toBeHidden()

  // 0x10 and 16 are one key: the dialog refuses it, so it never reaches the table.
  await page.getByRole('button', { name: 'Add Entry' }).click()
  await addEntry.getByLabel('Key').fill('16')
  await addEntry.getByLabel('Value').fill('again')
  await addEntry.getByRole('button', { name: 'Add & Next' }).click()
  await expect(addEntry).toContainText('Duplicate key "16"')

  // Add & Next keeps the dialog open for the next entry.
  await addEntry.getByLabel('Key').fill('17')
  await addEntry.getByRole('button', { name: 'Add & Next' }).click()
  await expect(addEntry.getByLabel('Key')).toHaveValue('')
  await addEntry.getByRole('button', { name: 'Cancel' }).click()
  await expect(rowWith(page, 'again')).toHaveCount(1)

  await save.click()
  await expect(page).toHaveURL(/\/configuration\/mapping-tables\/\d+/)

  // The server stores numeric keys as decimal.
  await page.reload()
  await expect(rowWith(page, 'sixteen')).toContainText('16')
  await expect(rowWith(page, 'again')).toContainText('17')

  await page.getByLabel('Description').fill('unsaved')
  await page.getByRole('link', { name: 'Persistent Storage' }).click()
  const guard = page.getByRole('alertdialog', { name: 'Unsaved Changes' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Stay' }).click()
  await expect(page.getByLabel('Description')).toHaveValue('unsaved')
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByLabel('Description')).toHaveValue('')

  await page.goto('/configuration/mapping-tables')
  await rowWith(page, name).locator('.app-table__checkbox-wrap').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(rowWith(page, name)).toHaveCount(0)

  expect(othersIn(await server.read('/v1/mapping-tables'), nameOf)).toEqual(before)
})

test('R3.10 R3.11 R3.13 SNMP Trap Mappings: OID checks, parameters, order, delete', async ({
  page,
  server,
}) => {
  server.allow('/v1/snmp-trap-mappings')
  const nameOf = (mapping) => mapping.description ?? ''
  const before = othersIn(await server.read('/v1/snmp-trap-mappings'), nameOf)
  const description = unique('trap')

  await page.goto('/configuration/snmp-trap-mappings')
  await page.getByRole('button', { name: 'New Mapping' }).click()

  // The form first: until it is up, the list's filter is what answers to "description".
  const save = page.getByRole('button', { name: 'Save', exact: true })
  const oid = page.getByLabel('Trap OID')
  await expect(oid).toBeVisible()
  await page.getByLabel('Description', { exact: true }).fill(description)

  for (const bad of ['1..3', '1.3.', 'abc']) {
    await oid.fill(bad)
    await expect(save, bad).toBeDisabled()
  }
  // A leading dot is accepted. The private enterprise number is reserved for documentation.
  await oid.fill('.1.3.6.1.4.1.32473.1')
  await expect(save).toBeEnabled()

  for (const varbind of ['1.3.6.1.4.1.32473.1.1', '1.3.6.1.4.1.32473.1.2']) {
    await page.getByRole('button', { name: 'Add Parameter' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add Parameter Mapping' })
    await dialog.getByLabel('Varbind OID').fill(varbind)
    await dialog.getByRole('button', { name: /^(Add|OK|Apply)$/ }).click()
  }
  const parameters = page.locator('.parameters-table tbody tr')
  await expect(parameters).toHaveCount(2)
  await parameters.nth(1).getByRole('button', { name: 'Move up' }).click()
  await expect(parameters.first()).toContainText('32473.1.2')

  await save.click()
  await expect(page).toHaveURL(/\/configuration\/snmp-trap-mappings\/\d+/)

  await page.reload()
  await expect(parameters).toHaveCount(2)
  await expect(parameters.first()).toContainText('32473.1.2')
  await expect(oid).toHaveValue('1.3.6.1.4.1.32473.1')

  await page.goto('/configuration/snmp-trap-mappings')
  // R3.10: with no event picked it goes to the server's catch-all.
  await expect(rowWith(page, description)).toContainText('SNMP_UNMATCHED_TRAP')
  await rowWith(page, description).locator('.app-table__checkbox-wrap').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(rowWith(page, description)).toHaveCount(0)

  expect(othersIn(await server.read('/v1/snmp-trap-mappings'), nameOf)).toEqual(before)
})
