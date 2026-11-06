// Escape in a filter field, on real focus and a real event loop: the filter's own clear re-renders
// before a window listener sees the same key, which a jsdom spec cannot reproduce.
import { test, expect } from './fixtures.js'

const filter = (page) => page.getByRole('combobox', { name: 'Filter alarms...' })
const suggestions = (page) => page.getByRole('listbox')

test.beforeEach(async ({ page }) => {
  await page.goto('/alarms')
  await filter(page).click()
  await expect(suggestions(page)).toBeVisible()
})

test('Escape clears typed text first and leaves the filter only once it is empty', async ({
  page,
}) => {
  await filter(page).fill('down')
  await page.keyboard.press('Escape')
  await expect(filter(page)).toHaveValue('')
  await expect(filter(page)).toBeFocused()
  await expect(suggestions(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(filter(page)).not.toBeFocused()
  await expect(suggestions(page)).toHaveCount(0)
})

test('Escape removes chips first and leaves the filter only once it is empty', async ({
  page,
}) => {
  await suggestions(page).getByRole('option', { name: 'Severity:' }).click()
  await suggestions(page).getByRole('option', { name: 'Critical' }).click()
  const chip = page.getByRole('button', { name: 'Remove filter Severity' })
  await expect(chip).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(chip).toHaveCount(0)
  await expect(filter(page)).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(filter(page)).not.toBeFocused()
  await expect(suggestions(page)).toHaveCount(0)
})

test('`/` comes back to the filter Escape left', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(filter(page)).not.toBeFocused()

  await page.keyboard.press('/')
  await expect(filter(page)).toBeFocused()
})
