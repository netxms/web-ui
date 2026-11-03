import { inject, provide } from 'vue'

// Each DashboardCanvas provides the visited set plus its own id; an EmbeddedDashboardWidget
// checks it to refuse embedding an ancestor or itself.
const EMBED_GUARD_KEY = Symbol('embedded-dashboard-guard')

export const MAX_EMBED_DEPTH = 3

/** @returns {{ visitedIds: Set<number>, depth: number }} */
export function useEmbedGuard() {
  return inject(EMBED_GUARD_KEY, { visitedIds: new Set(), depth: 0 })
}

/** @param {number|null} selfDashboardId */
export function provideEmbedGuard(selfDashboardId) {
  const parent = useEmbedGuard()
  const visitedIds = new Set(parent.visitedIds)
  if (selfDashboardId != null) visitedIds.add(selfDashboardId)
  provide(EMBED_GUARD_KEY, { visitedIds, depth: parent.depth + 1 })
  return parent
}
