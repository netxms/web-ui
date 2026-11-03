import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { CAN_KEY_TO_RIGHT } from '@/auth/systemRights'

/**
 * UX-only checks against the user's system access rights; the server enforces them itself.
 *
 * @example
 * const { can } = usePermissions()
 * // template: v-if="can.manageScripts"
 */
export function usePermissions() {
  const authStore = useAuthStore()

  // BigInt: bits 53+ exceed the safe integer range
  const rights = computed(() => BigInt(authStore.user?.systemAccessRights ?? 0))

  /**
   * @param {number} bit - bit position from SYSTEM_RIGHTS
   * @returns {boolean}
   */
  function hasRight(bit) {
    return (rights.value & (1n << BigInt(bit))) !== 0n
  }

  const can = computed(() =>
    Object.fromEntries(Object.entries(CAN_KEY_TO_RIGHT).map(([key, bit]) => [key, hasRight(bit)])),
  )

  return { hasRight, can }
}
