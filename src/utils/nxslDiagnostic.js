/**
 * Compilation failure: `{ error: { lineNumber, message }, warnings }`. Runtime failure: flat
 * `{ lineNumber, code, message, module? }`. `lineNumber` is dropped for errors in an imported
 * module, since it counts that module's lines.
 *
 * @param {object|null|undefined} diagnostic
 * @returns {{ message: string, lineNumber: number|null, warnings: object[] }|null}
 */
export function readNxslDiagnostic(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object') return null
  const error =
    diagnostic.error && typeof diagnostic.error === 'object' ? diagnostic.error : diagnostic
  if (typeof error.message !== 'string' || error.message === '') return null
  return {
    message: error.message,
    lineNumber: !error.module && error.lineNumber > 0 ? error.lineNumber : null,
    warnings: Array.isArray(diagnostic.warnings) ? diagnostic.warnings : [],
  }
}
