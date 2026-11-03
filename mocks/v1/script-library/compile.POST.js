import { Buffer } from 'node:buffer'

export default async function (req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const { code = '' } = JSON.parse(Buffer.concat(chunks).toString())

  // Simulate a compile error: include "FAIL" anywhere in the code
  if (code.includes('FAIL')) {
    const line = code.split('\n').findIndex((l) => l.includes('FAIL')) + 1
    return {
      success: false,
      error: { lineNumber: line, message: 'Simulated compile error (line contains FAIL)' },
      warnings: [],
    }
  }

  // Simulate warnings: each line containing "WARN" produces one
  const warnings = code
    .split('\n')
    .flatMap((l, i) => (l.includes('WARN') ? [{ lineNumber: i + 1, message: 'Simulated warning' }] : []))

  return { success: true, warnings }
}
