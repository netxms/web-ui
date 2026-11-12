/**
 * Propagates sign-in and sign-out between tabs via the `storage` event, which fires in every
 * tab except the writer. Not a router guard: an idle tab would keep polling a dead session.
 */
import { onMounted, onUnmounted } from 'vue'
import { reloadPage } from '@/utils/navigation'

const SESSION_KEY = 'sessionGuid'

/**
 * @param {import('vue-router').Router} router
 * @param {{ sessionGuid: { value: string|null }, clearSession: () => void }} authStore
 */
export function useSessionSync(router, authStore) {
  /** @param {StorageEvent} event */
  function onStorage(event) {
    if (event.storageArea !== null && event.storageArea !== localStorage) return

    // `key === null` means the other tab called localStorage.clear().
    const touchedSession = event.key === null || event.key === SESSION_KEY
    if (!touchedSession) return

    const incoming = event.key === null ? localStorage.getItem(SESSION_KEY) : event.newValue

    if (incoming === null) {
      // The other tab already told the server; this token is the same dead one.
      if (authStore.sessionGuid.value === null) return
      authStore.clearSession()
      if (router.currentRoute.value.name !== 'login') {
        router.push({ name: 'login' })
      }
      return
    }

    // Possibly a different user: reload rather than keep the previous user's cached data.
    if (incoming !== authStore.sessionGuid.value) {
      reloadPage()
    }
  }

  onMounted(() => window.addEventListener('storage', onStorage))
  onUnmounted(() => window.removeEventListener('storage', onStorage))
}
