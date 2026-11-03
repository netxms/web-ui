/** RFC 4180, CRLF or LF; reads back whatever `toCsv` and `downloadCsv` (with its BOM) write. */

const BOM = 0xfeff

/**
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.delimiter=',']
 * @returns {string[][]} one array of fields per record; blank lines are skipped
 */
export function parseCsv(text, { delimiter = ',' } = {}) {
  const source = text.charCodeAt(0) === BOM ? text.slice(1) : text
  const records = []
  let record = []
  let field = ''
  let inQuotes = false
  let fieldStarted = false

  const endField = () => {
    record.push(field)
    field = ''
    fieldStarted = false
  }
  const endRecord = () => {
    endField()
    // A blank line parses as one empty field; it is not a record.
    if (record.length > 1 || record[0] !== '') records.push(record)
    record = []
  }

  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (inQuotes) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"' && !fieldStarted) {
      inQuotes = true
      fieldStarted = true
    } else if (c === delimiter) {
      endField()
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && source[i + 1] === '\n') i++
      endRecord()
    } else {
      field += c
      fieldStarted = true
    }
  }
  if (field !== '' || record.length > 0) endRecord()
  return records
}
