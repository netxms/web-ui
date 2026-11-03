/** Seconds. */
export const IDLE_TIMEOUT_MIN = 60
export const IDLE_TIMEOUT_MAX = 86400

/** Seconds; the server uses it when idleTimeout is 0. */
export const DEFAULT_IDLE_TIMEOUT = 1800

/** Server database column width, UTF-8 bytes. */
export const PEER_ID_MAX_LENGTH = 127

/** No endpoint lists them, so this is only a hint: any name is accepted, empty is default. */
export const KNOWN_PROVIDER_SLOTS = ['interactive', 'background', 'fast', 'analytical']

/**
 * @param {{ driverInitialized?: boolean, healthCheckStatus?: boolean }} bot
 * @returns {{ label: string, class: string, icon: string }}
 */
export function chatBotStatus(bot) {
  if (!bot?.driverInitialized) {
    return { label: 'Not Initialized', class: 'status-error', icon: 'pi pi-times-circle' }
  }
  if (!bot.healthCheckStatus) {
    return { label: 'Unhealthy', class: 'status-warn', icon: 'pi pi-exclamation-circle' }
  }
  return { label: 'Healthy', class: 'status-ok', icon: 'pi pi-check-circle' }
}

/**
 * The server keys mappings by peer ID and skips blank ones; do the same here (last one wins).
 *
 * @param {Array<{ peerId?: string, userId?: number }>} rows
 * @returns {Array<{ peerId: string, userId: number }>}
 */
export function normalizeMappings(rows) {
  const byPeerId = new Map()
  for (const row of rows ?? []) {
    const peerId = (row?.peerId ?? '').trim()
    if (!peerId) continue
    byPeerId.set(peerId, { peerId, userId: Number(row.userId) || 0 })
  }
  return [...byPeerId.values()]
}
