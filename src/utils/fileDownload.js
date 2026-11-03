/**
 * @param {string} filename
 * @param {string} text
 * @param {string} [mimeType='text/plain;charset=utf-8;']
 */
export function downloadText(filename, text, mimeType = 'text/plain;charset=utf-8;') {
  downloadBlob(filename, new Blob([text], { type: mimeType }))
}

/**
 * @param {string} filename
 * @param {Blob} blob
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking at once can cancel the download of a large blob the browser is still reading.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
