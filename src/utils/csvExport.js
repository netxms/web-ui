/** RFC 4180. */
import { downloadText } from './fileDownload'

/**
 * @param {Array<object>} rows
 * @param {Array<{ field: string, label?: string }>} columns
 * @param {object} [options]
 * @param {string} [options.delimiter=',']
 * @returns {string}
 */
export function toCsv(rows, columns, { delimiter = ',' } = {}) {
  const header = columns.map((c) => escapeField(c.label ?? c.field, delimiter))
  const body = rows.map((row) =>
    columns.map((c) => escapeField(row[c.field], delimiter)).join(delimiter),
  )
  return [header.join(delimiter), ...body].join('\r\n')
}

function escapeField(value, delimiter) {
  if (value == null) return ''
  const text = String(value)
  if (text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

/**
 * Prepends a BOM, without which Excel does not read the file as UTF-8.
 *
 * @param {string} filename - without extension
 * @param {string} csv
 */
export function downloadCsv(filename, csv) {
  downloadText(
    filename.endsWith('.csv') ? filename : `${filename}.csv`,
    '﻿' + csv,
    'text/csv;charset=utf-8;',
  )
}

export function safeFilename(name, fallback = 'export') {
  const cleaned = String(name ?? '')
    .replaceAll(/[/\\:*?"<>|]/g, '-')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || fallback
}
