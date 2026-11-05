/**
 * `navigator.clipboard` exists only on HTTPS and localhost, and the console also runs on plain HTTP.
 *
 * @param {string} text
 * @returns {Promise<boolean>} whether the text reached the clipboard
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Refused by the browser or a policy; the older route below may still be allowed.
    }
  }

  const previouslyFocused = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  field.focus()

  let copied
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  field.remove()
  previouslyFocused?.focus?.()
  return copied
}
