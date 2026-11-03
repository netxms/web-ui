import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import * as serverApi from '@/api/serverApi'
import { STATIC_TIER } from './config'

export const serverKeys = {
  info: () => ['server', 'info'],
}

export function useServerInfo() {
  return useQuery({
    queryKey: serverKeys.info(),
    queryFn: () => serverApi.getServerInfo(),
    ...STATIC_TIER,
  })
}

/**
 * `Client.*` server configuration variables with the prefix stripped, overlaid with the user's
 * own `Client.*` attributes (Java `NXCSession.getClientConfigurationHint`). They make
 * `/v1/server-info` user-specific; the cache is safe because sign-out clears it. A hint is
 * advice, never a permission.
 *
 * @example
 * const { hint, hintAsBoolean } = useClientConfigurationHints()
 * const welcomeEnabled = computed(() => hintAsBoolean('EnableWelcomePage', true))
 */
export function useClientConfigurationHints() {
  const { data, isLoading } = useServerInfo()

  const hints = computed(() => data.value?.clientConfigurationHints ?? {})

  /**
   * @param {string} name - hint name without the `Client.` prefix
   * @param {string|null} [defaultValue]
   * @returns {string|null}
   */
  function hint(name, defaultValue = null) {
    const value = hints.value[name]
    return value === undefined || value === '' ? defaultValue : value
  }

  /** Like the Java client: "true"/"yes" and any non-zero number are true. */
  function hintAsBoolean(name, defaultValue = false) {
    const value = hint(name)
    if (value === null) return defaultValue
    const text = value.trim().toLowerCase()
    if (text === 'true' || text === 'yes') return true
    if (text === 'false' || text === 'no') return false
    const parsed = Number.parseInt(text, 10)
    return Number.isNaN(parsed) ? defaultValue : parsed !== 0
  }

  /** @returns {number} `defaultValue` when the hint is absent or not a number. */
  function hintAsInt(name, defaultValue = 0) {
    const value = hint(name)
    if (value === null) return defaultValue
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  return { hints, isLoading, hint, hintAsBoolean, hintAsInt }
}
