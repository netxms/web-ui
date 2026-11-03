// Toasts from non-component code, via a window event App.vue listens for.

/**
 * @param {object} options
 * @param {'success'|'info'|'warn'|'error'} [options.severity]
 * @param {string} options.summary
 * @param {string} [options.detail]
 * @param {number} [options.life] - ms
 */
export function notify({ severity = 'success', summary, detail, life = 3000 }) {
  window.dispatchEvent(
    new CustomEvent('app:notify', { detail: { severity, summary, detail, life } }),
  )
}

/**
 * Small pill at the bottom of the window, for actions that changed nothing visible yet. Anything
 * the user has to read or act on is a `notify` toast.
 *
 * @param {string} message
 * @param {string} [icon] - PrimeVue icon class
 */
export function notifyAction(message, icon) {
  window.dispatchEvent(new CustomEvent('app:action', { detail: { message, icon } }))
}
