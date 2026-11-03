import { describe, it, expect } from 'vitest'
import { readNxslDiagnostic } from '@/utils/nxslDiagnostic'

describe('readNxslDiagnostic', () => {
  it('reads a compilation diagnostic, warnings included', () => {
    const warnings = [{ lineNumber: 2, message: 'unused variable' }]
    expect(
      readNxslDiagnostic({
        error: { lineNumber: 3, message: "Error in line 3: syntax error, unexpected '}'" },
        warnings,
      }),
    ).toEqual({ message: "Error in line 3: syntax error, unexpected '}'", lineNumber: 3, warnings })
  })

  it('reads the flat runtime diagnostic of the VM', () => {
    expect(
      readNxslDiagnostic({
        lineNumber: 5,
        code: 13,
        message: 'Error 13 in line 5: Invalid operation with NULL value',
      }),
    ).toEqual({
      message: 'Error 13 in line 5: Invalid operation with NULL value',
      lineNumber: 5,
      warnings: [],
    })
  })

  it('gives no line for an error inside an imported module', () => {
    expect(
      readNxslDiagnostic({
        lineNumber: 12,
        code: 5,
        module: 'Lib::Helpers',
        message: 'Error 5 in module Lib::Helpers line 12: Function not found',
      }).lineNumber,
    ).toBeNull()
  })

  it('gives no line for line 0', () => {
    expect(
      readNxslDiagnostic({ lineNumber: 0, message: 'Error 4 in line 0: x' }).lineNumber,
    ).toBeNull()
  })

  it('answers null when there is no message', () => {
    expect(readNxslDiagnostic(undefined)).toBeNull()
    expect(readNxslDiagnostic(null)).toBeNull()
    expect(readNxslDiagnostic({})).toBeNull()
    expect(readNxslDiagnostic({ error: { lineNumber: 1, message: '' } })).toBeNull()
  })
})
