// VISUAL_PASS R23: column order, drag-to-reorder and the column chooser, on the Interfaces view.
import fs from 'node:fs'
import { test, expect } from './fixtures.js'
import { dragHeader, headerLabels, readTargets, settle } from './support.js'

const firstRow = (page) => page.locator('.app-table tbody tr').first()

const LEGACY_ORDER = [
  'ID',
  'Name',
  'Alias',
  'Index',
  'Description',
  'IP Addresses',
  'MAC Address',
  'VLANs',
  'MTU',
  'Speed',
  'Max Speed',
  'In Utilization',
  'Out Utilization',
  'Type',
  'Location',
  'Admin State',
  'Oper State',
  'Expected State',
  'STP State',
  'Status',
  'OSPF Area',
  'OSPF Type',
  'OSPF State',
  '802.1x PAE',
  '802.1x Backend',
  'Peer Node',
  'Peer Interface',
  'Peer MAC',
  'Peer IP',
  'Peer Protocol',
]

function chooser(page) {
  return {
    open: page.locator('.column-chooser-button'),
    all: page.getByLabel('Show all / Hide all'),
    options: page.locator('.column-chooser-option label'),
    apply: page.getByRole('button', { name: 'Apply' }),
    cancel: page.getByRole('button', { name: 'Cancel' }),
    restore: page.getByRole('button', { name: 'Restore default order' }),
  }
}

async function showAllColumns(page) {
  const columns = chooser(page)
  await columns.open.click()
  if (!(await columns.all.isChecked())) await columns.all.click()
  await columns.apply.click()
}

test.beforeEach(async ({ page, server }) => {
  server.freshAccount()
  await page.goto(`/infrastructure/${readTargets().node}/interfaces`)
  await expect(firstRow(page)).toBeVisible()
  // Columns still fitting to their content would move under a drag.
  await settle(page)
})

test('R23.1 Show all lists every column in legacy order, Hide all keeps Name', async ({ page }) => {
  const columns = chooser(page)
  const table = page.locator('.app-table')

  await showAllColumns(page)
  expect(await headerLabels(table)).toEqual(LEGACY_ORDER)

  await columns.open.click()
  await columns.all.click()
  await columns.apply.click()

  expect(await headerLabels(table)).toEqual(['Name'])
  await expect(columns.open).toHaveText('Columns (1)')
})

test('R23.2 a dragged header moves without sorting, a click still sorts', async ({ page }) => {
  const table = page.locator('.app-table')
  const name = table.locator('thead th').filter({ hasText: 'Name' })
  await expect(name).toHaveAttribute('aria-sort', 'ascending')

  await dragHeader(page, table, 'Speed', 'Name', 'left')

  expect((await headerLabels(table))[0]).toBe('Speed')
  const speed = table.locator('thead th').filter({ hasText: 'Speed' })
  await expect(speed).not.toHaveAttribute('aria-sort', /ascending|descending/)
  await expect(name).toHaveAttribute('aria-sort', 'ascending')

  await speed.click()
  await expect(speed).toHaveAttribute('aria-sort', 'ascending')
})

test('R23.4 the chooser follows the order, restore needs Apply', async ({ page }) => {
  const columns = chooser(page)
  const table = page.locator('.app-table')

  await columns.open.click()
  await expect(columns.restore).toBeDisabled()
  await columns.cancel.click()

  await dragHeader(page, table, 'Speed', 'Name', 'left')
  const dragged = await headerLabels(table)

  await columns.open.click()
  const listed = await columns.options.allTextContents()
  expect(listed.indexOf('Speed')).toBeLessThan(listed.indexOf('Name'))

  await columns.restore.click()
  await columns.cancel.click()
  expect(await headerLabels(table)).toEqual(dragged)

  await columns.open.click()
  await columns.restore.click()
  await columns.apply.click()
  expect((await headerLabels(table))[0]).toBe('Name')
})

test('R23.5 the order survives a reload and a hide and show', async ({ page }) => {
  const columns = chooser(page)
  const table = page.locator('.app-table')
  await dragHeader(page, table, 'Speed', 'Name', 'left')

  await page.reload()
  await expect(firstRow(page)).toBeVisible()
  expect((await headerLabels(table))[0]).toBe('Speed')

  await columns.open.click()
  await page.getByLabel('Speed', { exact: true }).click()
  await columns.apply.click()
  expect(await headerLabels(table)).not.toContain('Speed')

  await columns.open.click()
  await page.getByLabel('Speed', { exact: true }).click()
  await columns.apply.click()
  expect((await headerLabels(table))[0]).toBe('Speed')
})

test('R23.7 the CSV export follows the on-screen order', async ({ page }) => {
  const table = page.locator('.app-table')
  await dragHeader(page, table, 'Speed', 'Name', 'left')
  const labels = await headerLabels(table)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ])

  const csv = fs.readFileSync(await download.path(), 'utf-8').replace(/^﻿/, '')
  expect(csv.split(/\r?\n/)[0].split(',')).toEqual(labels)
})
