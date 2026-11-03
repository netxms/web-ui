/** App.vue listens for this event and shows a toast. */
export function notifyNotImplemented(label) {
  window.dispatchEvent(new CustomEvent('app:notImplemented', { detail: { label } }))
}
